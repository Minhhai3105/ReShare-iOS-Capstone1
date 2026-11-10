const { ApiError } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');
const { assertCurrentStaffAccess } = require('./staff-access.cjs');
const { quantityBase } = require('./quantity.cjs');

// Chiến dịch quyên góp do System Admin phát động. Client chỉ được ĐỌC chiến dịch đã công khai
// (rules); mọi thao tác tạo/sửa/mở/đóng đi qua API này để giữ ranh giới tin cậy như donation.
// Tiến độ (receivedQuantity/receivedDonationCount) KHÔNG sửa được ở đây: chỉ transaction nhập
// kho cộng vào, để con số trên app luôn là hàng đã vào kho thật chứ không phải số donor khai báo.

const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CATEGORIES = new Set(['clothing', 'books', 'household']);
const UNITS = new Set(['piece', 'kg', 'bag', 'box', 'set']);
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MAX_HUBS = 10;
const MAX_GUIDELINES = 8;
const MAX_LIST = 100;
const MAX_DONATIONS = 200;
const TEXT_LIMITS = Object.freeze({ title: [1, 120], summary: [0, 200], description: [0, 2000], organizer: [1, 120] });
const EDITABLE_FIELDS = Object.freeze([
  'title', 'summary', 'description', 'organizer', 'category', 'unitId',
  'targetQuantity', 'urgent', 'endDate', 'hubIds', 'guidelines',
]);
// Đổi danh mục hoặc đơn vị sau khi công khai sẽ làm sai tiến độ đã cộng và làm đơn đang gửi
// lệch danh mục với chiến dịch, nên chỉ cho đổi khi còn nháp.
const DRAFT_ONLY_FIELDS = new Set(['category', 'unitId']);
const TRANSITIONS = Object.freeze({ draft: ['active'], active: ['closed'], closed: ['active'] });

function localDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
}

// 'YYYY-MM-DD' theo giờ Việt Nam -> cuối ngày đó (23:59:59.999 +07:00).
function endOfLocalDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T23:59:59.999+07:00`);
  if (Number.isNaN(date.getTime()) || localDate(date) !== value) return null;
  return date;
}

function dateString(value) {
  return value?.toDate?.().toISOString() || (value instanceof Date ? value.toISOString() : value || null);
}

function toDate(value) {
  return value?.toDate?.() || (value instanceof Date ? value : null);
}

function cleanText(key, value) {
  const [min, max] = TEXT_LIMITS[key];
  if (typeof value !== 'string') throw new ApiError(400, `Invalid ${key}`, 'VALIDATION');
  const text = value.trim();
  if (text.length < min || text.length > max) throw new ApiError(400, `Invalid ${key}`, 'VALIDATION');
  return text;
}

// Kiểm tra từng field có mặt trong body. `required` = tạo mới (phải đủ field bắt buộc).
function validateCampaignFields(body, { required }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Invalid campaign fields', 'VALIDATION');
  }
  const allowed = required ? EDITABLE_FIELDS : [...EDITABLE_FIELDS, 'expectedVersion'];
  if (Object.keys(body).some(key => !allowed.includes(key))) {
    throw new ApiError(400, 'Invalid campaign fields', 'VALIDATION');
  }
  if (required) {
    for (const key of ['title', 'organizer', 'category', 'unitId', 'targetQuantity', 'endDate', 'hubIds']) {
      if (!Object.hasOwn(body, key)) throw new ApiError(400, `${key} is required`, 'VALIDATION');
    }
  }
  const fields = {};
  for (const key of Object.keys(TEXT_LIMITS)) {
    if (Object.hasOwn(body, key)) fields[key] = cleanText(key, body[key]);
  }
  if (Object.hasOwn(body, 'category')) {
    if (!CATEGORIES.has(body.category)) throw new ApiError(400, 'Invalid category', 'VALIDATION');
    fields.category = body.category;
  }
  if (Object.hasOwn(body, 'unitId')) {
    if (!UNITS.has(body.unitId)) throw new ApiError(400, 'Invalid unitId', 'VALIDATION');
    fields.unitId = body.unitId;
  }
  if (Object.hasOwn(body, 'targetQuantity')) {
    if (typeof body.targetQuantity !== 'number' || !Number.isFinite(body.targetQuantity) || body.targetQuantity <= 0) {
      throw new ApiError(400, 'Invalid targetQuantity', 'VALIDATION');
    }
    fields.targetQuantity = body.targetQuantity;
  }
  if (Object.hasOwn(body, 'urgent')) {
    if (typeof body.urgent !== 'boolean') throw new ApiError(400, 'Invalid urgent flag', 'VALIDATION');
    fields.urgent = body.urgent;
  }
  if (Object.hasOwn(body, 'endDate')) {
    const endDate = endOfLocalDay(body.endDate);
    if (!endDate) throw new ApiError(400, 'Invalid endDate', 'VALIDATION');
    fields.endDate = endDate;
  }
  if (Object.hasOwn(body, 'hubIds')) {
    const ids = body.hubIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_HUBS || new Set(ids).size !== ids.length ||
        ids.some(id => typeof id !== 'string' || !VALID_ID.test(id))) {
      throw new ApiError(400, 'Invalid hubIds', 'VALIDATION');
    }
    fields.hubIds = ids;
  }
  if (Object.hasOwn(body, 'guidelines')) {
    const lines = body.guidelines;
    if (!Array.isArray(lines) || lines.length > MAX_GUIDELINES ||
        lines.some(line => typeof line !== 'string' || !line.trim() || line.trim().length > 200)) {
      throw new ApiError(400, 'Invalid guidelines', 'VALIDATION');
    }
    fields.guidelines = lines.map(line => line.trim());
  }
  return fields;
}

function campaignFrom(doc) {
  const data = doc.data();
  const endDate = toDate(data.endDate);
  return {
    id: doc.id,
    title: data.title || '',
    summary: data.summary || '',
    description: data.description || '',
    organizer: data.organizer || '',
    category: data.category || '',
    unitId: data.unitId || '',
    targetQuantity: typeof data.targetQuantity === 'number' ? data.targetQuantity : 0,
    receivedQuantity: typeof data.receivedQuantity === 'number' ? data.receivedQuantity : 0,
    receivedDonationCount: Number.isSafeInteger(data.receivedDonationCount) ? data.receivedDonationCount : 0,
    urgent: data.urgent === true,
    endDate: endDate ? endDate.toISOString() : null,
    endDateLocal: endDate ? localDate(endDate) : null,
    hubs: Array.isArray(data.hubs) ? data.hubs.map(hub => ({ id: hub.id, name: hub.name })) : [],
    guidelines: Array.isArray(data.guidelines) ? data.guidelines : [],
    status: data.status || 'draft',
    version: data.version || 1,
    createdAt: dateString(data.createdAt),
    updatedAt: dateString(data.updatedAt),
    publishedAt: dateString(data.publishedAt),
    closedAt: dateString(data.closedAt),
  };
}

function createCampaignsApi({ db, verifyToken, serverTimestamp, clock }) {
  if (!db || !verifyToken) throw new Error('Campaigns API configuration is incomplete');
  const now = serverTimestamp || (() => new Date());
  const currentTime = clock || (() => new Date());

  async function systemAdminFrom(headers) {
    const match = /^Bearer (\S+)$/.exec(headers?.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try { claims = await verifyToken(match[1]); }
    catch { throw new ApiError(401, 'Invalid session'); }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');
    const assignment = await db.collection('staff_assignments').doc(claims.uid).get();
    if (!assignment.exists || assignment.data().active !== true || assignment.data().role !== 'system_admin') {
      throw new ApiError(403, 'System Admin access required');
    }
    return { uid: claims.uid };
  }

  function assertTargetFitsUnit(targetQuantity, unitId) {
    if (quantityBase(targetQuantity, unitId) === null) {
      throw new ApiError(400, 'targetQuantity does not match unit rules', 'VALIDATION');
    }
  }

  function assertEndDateOpen(endDate) {
    if (!endDate || endDate.getTime() <= currentTime().getTime()) {
      throw new ApiError(409, 'Campaign end date has passed', 'VALIDATION');
    }
  }

  // Đọc Hub trong transaction để danh sách điểm nhận lưu kèm chiến dịch là Hub đang hoạt động thật.
  async function hubsFor(tx, hubIds) {
    const docs = await Promise.all(hubIds.map(id => tx.get(db.collection('hubs').doc(id))));
    return docs.map(doc => {
      if (!doc.exists || doc.data().status !== 'active') {
        throw new ApiError(409, 'Hub is inactive or missing', 'VALIDATION');
      }
      return { id: doc.id, name: doc.data().name || doc.id };
    });
  }

  async function list() {
    const snapshot = await db.collection('campaigns').orderBy('createdAt', 'desc').limit(MAX_LIST).get();
    return { status: 200, body: { campaigns: snapshot.docs.map(campaignFrom) } };
  }

  async function options() {
    const snapshot = await db.collection('hubs').where('status', '==', 'active').limit(100).get();
    const hubs = snapshot.docs
      .map(doc => ({ id: doc.id, name: doc.data().name || doc.id, isDemo: doc.data().isDemo === true }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return { status: 200, body: { hubs } };
  }

  async function detail(id) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid campaign ID');
    const doc = await db.collection('campaigns').doc(id).get();
    if (!doc.exists) throw new ApiError(404, 'Campaign not found');
    // Một điều kiện bằng, không orderBy: không cần composite index; sắp xếp trong bộ nhớ.
    const snapshot = await db.collection('donations').where('campaignId', '==', id).limit(MAX_DONATIONS + 1).get();
    const donations = snapshot.docs.slice(0, MAX_DONATIONS).map(donation => {
      const data = donation.data();
      return {
        id: donation.id, title: data.title || '', status: data.status || '',
        quantity: typeof data.quantity === 'number' ? data.quantity : null,
        unitId: data.unitId || '', warehouseId: data.warehouseId || '',
        createdAt: dateString(data.createdAt),
      };
    }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return {
      status: 200,
      body: { campaign: campaignFrom(doc), donations, donationsTruncated: snapshot.docs.length > MAX_DONATIONS },
    };
  }

  async function create(staff, body) {
    const fields = validateCampaignFields(body, { required: true });
    assertTargetFitsUnit(fields.targetQuantity, fields.unitId);
    if (fields.endDate.getTime() <= currentTime().getTime()) {
      throw new ApiError(400, 'Campaign end date must be in the future', 'VALIDATION');
    }
    const ref = db.collection('campaigns').doc();
    await runTransaction(db, async tx => {
      const hubs = await hubsFor(tx, fields.hubIds);
      await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
      const timestamp = now();
      const { hubIds, ...rest } = fields;
      tx.create(ref, {
        id: ref.id, summary: '', description: '', urgent: false, guidelines: [],
        ...rest, hubIds, hubs, status: 'draft',
        receivedQuantity: 0, receivedDonationCount: 0, version: 1,
        createdByUid: staff.uid, updatedByUid: staff.uid, createdAt: timestamp, updatedAt: timestamp,
      });
    });
    return { status: 201, body: { campaign: campaignFrom(await ref.get()) } };
  }

  function expectedVersionFrom(body) {
    const expectedVersion = body?.expectedVersion;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new ApiError(400, 'expectedVersion is required', 'VALIDATION');
    }
    return expectedVersion;
  }

  async function update(staff, id, body) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid campaign ID');
    const expectedVersion = expectedVersionFrom(body);
    const fields = validateCampaignFields(body, { required: false });
    if (!Object.keys(fields).length) throw new ApiError(400, 'No campaign fields to update', 'VALIDATION');
    const ref = db.collection('campaigns').doc(id);
    await runTransaction(db, async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ApiError(404, 'Campaign not found');
      const current = doc.data();
      const hubs = fields.hubIds ? await hubsFor(tx, fields.hubIds) : null;
      await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
      if ((current.version || 1) !== expectedVersion) throw new ApiError(409, 'Campaign changed; reload first');
      if (current.status === 'closed') throw new ApiError(409, 'Closed campaigns cannot be edited');
      const changed = Object.keys(fields).filter(key => key === 'endDate'
        ? toDate(current.endDate)?.getTime() !== fields.endDate.getTime()
        : JSON.stringify(current[key]) !== JSON.stringify(fields[key]));
      if (!changed.length) throw new ApiError(409, 'Campaign is unchanged');
      if (current.status !== 'draft' && changed.some(key => DRAFT_ONLY_FIELDS.has(key))) {
        throw new ApiError(409, 'Category and unit can only change while the campaign is a draft');
      }
      assertTargetFitsUnit(fields.targetQuantity ?? current.targetQuantity, fields.unitId ?? current.unitId);
      if (changed.includes('endDate') && fields.endDate.getTime() <= currentTime().getTime()) {
        throw new ApiError(400, 'Campaign end date must be in the future', 'VALIDATION');
      }
      tx.update(ref, {
        ...fields, ...(hubs ? { hubs } : {}),
        version: expectedVersion + 1, updatedByUid: staff.uid, updatedAt: now(),
      });
    });
    return { status: 200, body: { campaign: campaignFrom(await ref.get()) } };
  }

  async function changeStatus(staff, id, body) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid campaign ID');
    if (!body || Object.keys(body).some(key => !['expectedVersion', 'status'].includes(key)) ||
        !['active', 'closed'].includes(body.status)) {
      throw new ApiError(400, 'Invalid campaign status', 'VALIDATION');
    }
    const expectedVersion = expectedVersionFrom(body);
    const ref = db.collection('campaigns').doc(id);
    await runTransaction(db, async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ApiError(404, 'Campaign not found');
      const current = doc.data();
      // Mở chiến dịch thì các Hub phải còn hoạt động: đọc lại trong transaction.
      if (body.status === 'active') await hubsFor(tx, Array.isArray(current.hubIds) ? current.hubIds : []);
      await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
      if ((current.version || 1) !== expectedVersion) throw new ApiError(409, 'Campaign changed; reload first');
      const from = current.status || 'draft';
      if (!(TRANSITIONS[from] || []).includes(body.status)) throw new ApiError(409, 'Invalid status transition');
      if (body.status === 'active') {
        assertEndDateOpen(toDate(current.endDate));
        if (!Array.isArray(current.hubIds) || !current.hubIds.length) {
          throw new ApiError(409, 'Campaign needs at least one hub', 'VALIDATION');
        }
      }
      const timestamp = now();
      tx.update(ref, {
        status: body.status,
        ...(body.status === 'active' && !current.publishedAt ? { publishedAt: timestamp } : {}),
        ...(body.status === 'closed' ? { closedAt: timestamp } : {}),
        version: expectedVersion + 1, updatedByUid: staff.uid, updatedAt: timestamp,
      });
    });
    return { status: 200, body: { campaign: campaignFrom(await ref.get()) } };
  }

  async function handle(method, path, headers, body) {
    const listPath = path === '/v1/admin/campaigns';
    const optionsPath = path === '/v1/admin/campaigns/options';
    const idMatch = !optionsPath && /^\/v1\/admin\/campaigns\/([^/]+)$/.exec(path);
    const actionMatch = /^\/v1\/admin\/campaigns\/([^/]+)\/(update|status)$/.exec(path);
    if (!listPath && !optionsPath && !idMatch && !actionMatch) throw new ApiError(404, 'Not found');
    const staff = await systemAdminFrom(headers);
    if (listPath && method === 'GET') return list();
    if (listPath && method === 'POST') return create(staff, body);
    if (optionsPath && method === 'GET') return options();
    if (idMatch && method === 'GET') return detail(idMatch[1]);
    if (actionMatch && method === 'POST') {
      return actionMatch[2] === 'update' ? update(staff, actionMatch[1], body) : changeStatus(staff, actionMatch[1], body);
    }
    throw new ApiError(404, 'Not found');
  }

  return { handle };
}

module.exports = { createCampaignsApi, validateCampaignFields, endOfLocalDay };
