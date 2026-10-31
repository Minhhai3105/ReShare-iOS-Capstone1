const { ApiError } = require('./image-api.cjs');
const { FieldPath } = require('firebase-admin/firestore');
const { cursorFor, readCursor, warehouseQueries, compareBy, mergedPage } = require('./scoped-pagination.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');

const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PROFILE_FIELDS = ['name', 'phone', 'notes', 'needs'];
const NEEDS = new Set(['clothing', 'books', 'household']);

function dateString(value) {
  return value?.toDate?.().toISOString() || (value instanceof Date ? value.toISOString() : value || null);
}

function searchName(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
}

function profileFrom(doc, includePrivate = false) {
  const data = doc.data();
  const profile = {
    id: doc.id, name: data.name, warehouseId: data.warehouseId,
    status: data.status || 'unverified', version: data.version || 1,
    createdAt: dateString(data.createdAt), updatedAt: dateString(data.updatedAt),
  };
  if (includePrivate) {
    Object.assign(profile, {
      phone: data.phone || '', notes: data.notes || '',
      needs: Array.isArray(data.needs) ? data.needs : [],
      createdByUid: data.createdByUid || '', verifiedByUid: data.verifiedByUid || '',
      verifiedAt: dateString(data.verifiedAt), unverifiedByUid: data.unverifiedByUid || '',
      unverifiedAt: dateString(data.unverifiedAt), rejectedByUid: data.rejectedByUid || '',
      rejectedAt: dateString(data.rejectedAt), reviewReason: data.reviewReason || '',
    });
  }
  return profile;
}

function validateFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !allowed.includes(key))) {
    throw new ApiError(400, 'Invalid beneficiary fields');
  }
  const fields = {};
  for (const key of PROFILE_FIELDS) {
    if (key === 'name' && !Object.hasOwn(body, key) && allowed.includes('warehouseId')) {
      throw new ApiError(400, 'Name is required');
    }
    if (!Object.hasOwn(body, key)) continue;
    const value = body[key];
    if (key === 'needs') {
      if (!Array.isArray(value) || !value.length || value.length > NEEDS.size ||
          new Set(value).size !== value.length || value.some(need => !NEEDS.has(need))) {
        throw new ApiError(400, 'Invalid needs');
      }
      fields.needs = value;
      continue;
    }
    const max = key === 'name' ? 120 : key === 'phone' ? 32 : 500;
    if (typeof value !== 'string' || value.trim().length > max ||
        (key === 'name' && !value.trim()) ||
        (key === 'phone' && value.trim() &&
          (!/^\+?[0-9().\s-]+$/.test(value.trim()) ||
            !/^\+?\d{9,15}$/.test(value.trim().replace(/[\s().-]/g, ''))))) {
      throw new ApiError(400, `Invalid ${key}`);
    }
    fields[key] = value.trim();
  }
  return fields;
}

function pageNumber(value, fallback, max) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) > max) throw new ApiError(400, 'Invalid pagination');
  return Number(value);
}

function createBeneficiariesApi({ db, verifyToken, serverTimestamp }) {
  if (!db || !verifyToken) throw new Error('Beneficiaries API configuration is incomplete');
  const now = serverTimestamp || (() => new Date());

  async function staffFrom(headers) {
    const match = /^Bearer (\S+)$/.exec(headers?.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try { claims = await verifyToken(match[1]); }
    catch { throw new ApiError(401, 'Invalid session'); }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');
    const assignment = await db.collection('staff_assignments').doc(claims.uid).get();
    if (!assignment.exists || assignment.data().active !== true ||
        !['system_admin', 'warehouse_admin'].includes(assignment.data().role)) {
      throw new ApiError(403, 'Active staff access required');
    }
    const data = assignment.data();
    return { uid: claims.uid, role: data.role,
      warehouseIds: Array.isArray(data.warehouseIds) ? data.warehouseIds : [] };
  }

  function canAccess(staff, warehouseId) {
    return staff.role === 'system_admin' || staff.warehouseIds.includes(warehouseId);
  }

  async function assertCurrentAssignment(tx, staff, warehouseId, systemOnly = false) {
    const doc = await tx.get(db.collection('staff_assignments').doc(staff.uid));
    const data = doc.exists ? doc.data() : null;
    if (data?.active !== true || !['system_admin', 'warehouse_admin'].includes(data.role) ||
        (systemOnly && data.role !== 'system_admin') ||
        (data.role !== 'system_admin' && !(Array.isArray(data.warehouseIds) && data.warehouseIds.includes(warehouseId)))) {
      throw new ApiError(403, 'Staff access changed; reload session');
    }
  }

  function scopedQueries(staff, warehouseId) {
    if (warehouseId && !VALID_ID.test(warehouseId)) throw new ApiError(400, 'Invalid warehouseId');
    if (warehouseId && !canAccess(staff, warehouseId)) throw new ApiError(403, 'Warehouse access denied');
    if (staff.role === 'warehouse_admin' && !staff.warehouseIds.length) {
      throw new ApiError(403, 'Warehouse assignment required');
    }
    return warehouseQueries(db.collection('beneficiaries'), staff, warehouseId);
  }

  async function list(staff, url) {
    const warehouseId = url.searchParams.get('warehouseId') || '';
    const rawSearch = (url.searchParams.get('search') || '').trim();
    const limit = pageNumber(url.searchParams.get('limit'), 25, 50);
    if (limit < 1 || rawSearch.length > 120 || url.searchParams.has('offset')) {
      throw new ApiError(400, 'Invalid beneficiary filter');
    }
    let queries = scopedQueries(staff, warehouseId);
    const key = searchName(rawSearch);
    const filterKey = JSON.stringify({ kind: 'beneficiaries', warehouseId, search: key });
    if (rawSearch && VALID_ID.test(rawSearch)) {
      const exact = await db.collection('beneficiaries').doc(rawSearch).get();
      if (exact.exists && canAccess(staff, exact.data().warehouseId) &&
          (!warehouseId || exact.data().warehouseId === warehouseId)) {
        return { items: [profileFrom(exact)], nextCursor: null };
      }
    }
    const cursor = await readCursor(db, 'beneficiaries', url.searchParams.get('cursor'), filterKey,
      doc => canAccess(staff, doc.data().warehouseId) &&
        (!warehouseId || doc.data().warehouseId === warehouseId));
    if (rawSearch) {
      queries = queries.map(query => query.where('nameSearch', '>=', key)
        .where('nameSearch', '<', `${key}\uf8ff`)
        .orderBy('nameSearch').orderBy(FieldPath.documentId()));
    } else {
      queries = queries.map(query => query.orderBy('createdAt', 'desc')
        .orderBy(FieldPath.documentId(), 'desc'));
    }
    const page = await mergedPage(queries, cursor, limit,
      compareBy(rawSearch ? 'nameSearch' : 'createdAt', rawSearch ? 'asc' : 'desc'),
      rawSearch ? 'nameSearch' : 'createdAt');
    return {
      items: page.docs.map(doc => profileFrom(doc)),
      nextCursor: page.hasMore ? cursorFor(page.docs.at(-1), filterKey) : null,
    };
  }

  async function detail(staff, id, url) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid beneficiary ID');
    const doc = await db.collection('beneficiaries').doc(id).get();
    if (!doc.exists) throw new ApiError(404, 'Beneficiary not found');
    if (!canAccess(staff, doc.data().warehouseId)) throw new ApiError(403, 'Warehouse access denied');
    const limit = pageNumber(url.searchParams.get('limit'), 20, 50);
    if (limit < 1 || url.searchParams.has('offset')) throw new ApiError(400, 'Invalid pagination');
    const filterKey = JSON.stringify({ kind: 'beneficiary-support', id });
    const cursor = await readCursor(db, 'distribution_vouchers', url.searchParams.get('cursor'),
      filterKey, voucher => voucher.data().beneficiaryId === id &&
        voucher.data().warehouseId === doc.data().warehouseId && voucher.data().status === 'confirmed');
    const query = db.collection('distribution_vouchers')
      .where('beneficiaryId', '==', id)
      .where('warehouseId', '==', doc.data().warehouseId)
      .where('status', '==', 'confirmed');
    const [history, count] = await Promise.all([
      mergedPage([query.orderBy('confirmedAt', 'desc')
        .orderBy(FieldPath.documentId(), 'desc')], cursor, limit, compareBy('confirmedAt'), 'confirmedAt'),
      query.count().get(),
    ]);
    return { status: 200, body: {
      beneficiary: profileFrom(doc, true), supportCount: count.data().count,
      supportHistory: history.docs.map(voucher => ({
        voucherId: voucher.id, confirmedAt: dateString(voucher.data().confirmedAt),
        lines: (Array.isArray(voucher.data().lines) ? voucher.data().lines : [])
          .map(line => ({ inventoryItemId: line.inventoryItemId, quantity: line.quantity, unitId: line.unitId })),
      })),
      nextCursor: history.hasMore ? cursorFor(history.docs.at(-1), filterKey) : null,
    } };
  }

  async function audit(staff, id, url) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid beneficiary ID');
    const profile = await db.collection('beneficiaries').doc(id).get();
    if (!profile.exists) throw new ApiError(404, 'Beneficiary not found');
    if (!canAccess(staff, profile.data().warehouseId)) throw new ApiError(403, 'Warehouse access denied');
    const limit = pageNumber(url.searchParams.get('limit'), 20, 50);
    if (limit < 1 || url.searchParams.has('offset')) throw new ApiError(400, 'Invalid pagination');
    const filterKey = JSON.stringify({ kind: 'beneficiary-audit', id });
    const cursor = await readCursor(db, 'beneficiary_audit', url.searchParams.get('cursor'),
      filterKey, entry => entry.data().beneficiaryId === id);
    const page = await mergedPage([db.collection('beneficiary_audit')
      .where('beneficiaryId', '==', id).orderBy('version', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')], cursor, limit, compareBy('version'), 'version');
    return { status: 200, body: {
      items: page.docs.map(entry => ({ id: entry.id, ...entry.data(),
        createdAt: dateString(entry.data().createdAt) })),
      nextCursor: page.hasMore ? cursorFor(page.docs.at(-1), filterKey) : null,
    } };
  }

  async function create(staff, body) {
    const fields = validateFields(body, [...PROFILE_FIELDS, 'warehouseId']);
    const warehouseId = body.warehouseId;
    if (typeof warehouseId !== 'string' || !VALID_ID.test(warehouseId)) {
      throw new ApiError(400, 'Valid warehouseId is required');
    }
    if (!canAccess(staff, warehouseId)) throw new ApiError(403, 'Warehouse access denied');
    if (!fields.needs) throw new ApiError(400, 'Support needs are required');
    const ref = db.collection('beneficiaries').doc();
    await runTransaction(db, async tx => {
      const warehouse = await tx.get(db.collection('warehouses').doc(warehouseId));
      if (!warehouse.exists || warehouse.data().status !== 'active') {
        throw new ApiError(409, 'Warehouse is inactive or missing');
      }
      await assertCurrentAssignment(tx, staff, warehouseId);
      const timestamp = now();
      tx.set(ref, {
        ...fields, nameSearch: searchName(fields.name), warehouseId,
        status: 'unverified', version: 1, createdByUid: staff.uid,
        createdAt: timestamp, updatedAt: timestamp,
      });
      tx.create(db.collection('beneficiary_audit').doc(`${ref.id}_v1`), {
        beneficiaryId: ref.id, warehouseId, action: 'created', actorUid: staff.uid,
        version: 1, changedFields: Object.keys(fields), createdAt: timestamp,
      });
    });
    return { status: 201, body: { beneficiary: profileFrom(await ref.get(), true) } };
  }

  async function update(staff, id, body, verify = false) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid beneficiary ID');
    const expectedVersion = body?.expectedVersion;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new ApiError(400, 'expectedVersion is required');
    }
    const fields = verify ? {} : validateFields(body, [...PROFILE_FIELDS, 'expectedVersion']);
    if (verify && (!body || Object.keys(body).some(key => !['expectedVersion', 'status', 'reason'].includes(key)) ||
        !['approved', 'unverified', 'rejected'].includes(body.status) ||
        (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.trim().length > 500)) ||
        (body.status === 'rejected' && !body.reason?.trim()))) {
      throw new ApiError(400, 'Invalid verification status');
    }
    if (!verify && !Object.keys(fields).length) throw new ApiError(400, 'No profile fields to update');
    const ref = db.collection('beneficiaries').doc(id);
    await runTransaction(db, async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ApiError(404, 'Beneficiary not found');
      if (!canAccess(staff, doc.data().warehouseId)) throw new ApiError(403, 'Warehouse access denied');
      await assertCurrentAssignment(tx, staff, doc.data().warehouseId, verify);
      if ((doc.data().version || 1) !== expectedVersion) throw new ApiError(409, 'Beneficiary changed; reload first');
      if (verify && staff.role !== 'system_admin') throw new ApiError(403, 'System Admin approval required');
      if (verify && body.status === 'approved' &&
          (!Array.isArray(doc.data().needs) || !doc.data().needs.length)) {
        throw new ApiError(400, 'Support needs must be selected before approval');
      }
      if (verify && doc.data().status === body.status) throw new ApiError(409, 'Status is unchanged');
      const timestamp = now();
      const changedFields = verify ? ['status'] : Object.keys(fields).filter(key =>
        JSON.stringify(doc.data()[key]) !== JSON.stringify(fields[key]));
      if (!changedFields.length) throw new ApiError(409, 'Profile is unchanged');
      const resetReview = !verify && ['approved', 'rejected'].includes(doc.data().status);
      if (resetReview) changedFields.push('status');
      const action = verify ? body.status : 'updated';
      tx.update(ref, verify ? {
        status: body.status,
        ...(body.status === 'approved'
          ? { verifiedByUid: staff.uid, verifiedAt: timestamp }
          : body.status === 'rejected'
            ? { rejectedByUid: staff.uid, rejectedAt: timestamp, reviewReason: body.reason.trim() }
            : { unverifiedByUid: staff.uid, unverifiedAt: timestamp }),
        version: expectedVersion + 1, updatedAt: timestamp,
      } : {
        ...fields, ...(fields.name ? { nameSearch: searchName(fields.name) } : {}),
        ...(resetReview ? { status: 'unverified', unverifiedByUid: staff.uid, unverifiedAt: timestamp } : {}),
        version: expectedVersion + 1, updatedByUid: staff.uid, updatedAt: timestamp,
      });
      tx.create(db.collection('beneficiary_audit').doc(`${id}_v${expectedVersion + 1}`), {
        beneficiaryId: id, warehouseId: doc.data().warehouseId, action, actorUid: staff.uid,
        version: expectedVersion + 1, changedFields,
        changes: Object.fromEntries(changedFields.map(key => [key, {
          before: doc.data()[key] ?? null,
          after: verify ? body.status : key === 'status' ? 'unverified' : fields[key],
        }])),
        createdAt: timestamp,
      });
    });
    return { status: 200, body: { beneficiary: profileFrom(await ref.get(), true) } };
  }

  async function handle(method, path, headers, body, requestUrl = '') {
    const listPath = path === '/v1/admin/beneficiaries';
    const idMatch = /^\/v1\/admin\/beneficiaries\/([^/]+)$/.exec(path);
    const auditMatch = /^\/v1\/admin\/beneficiaries\/([^/]+)\/audit$/.exec(path);
    const updateMatch = /^\/v1\/admin\/beneficiaries\/([^/]+)\/(update|verify)$/.exec(path);
    if (!listPath && !idMatch && !auditMatch && !updateMatch) throw new ApiError(404, 'Not found');
    const staff = await staffFrom(headers);
    const url = new URL(requestUrl || path, 'http://localhost');
    if (listPath && method === 'GET') return { status: 200, body: await list(staff, url) };
    if (listPath && method === 'POST') return create(staff, body);
    if (idMatch && method === 'GET') return detail(staff, idMatch[1], url);
    if (auditMatch && method === 'GET') return audit(staff, auditMatch[1], url);
    if (updateMatch && method === 'POST') return update(staff, updateMatch[1], body, updateMatch[2] === 'verify');
    throw new ApiError(404, 'Not found');
  }

  return { handle };
}

module.exports = { createBeneficiariesApi };
