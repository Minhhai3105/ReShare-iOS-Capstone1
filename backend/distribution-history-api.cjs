const { ApiError } = require('./image-api.cjs');

const dateString = value => value?.toDate?.().toISOString() ||
  (value instanceof Date ? value.toISOString() : value || null);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
const pageNumber = (value, fallback, max) => {
  if (value === null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) throw new ApiError(400, 'Invalid pagination');
  return number;
};

function createDistributionHistoryApi({ db, verifyToken }) {
  if (!db || !verifyToken) throw new Error('Distribution history API configuration is incomplete');

  async function staffFrom(headers) {
    const match = /^Bearer (\S+)$/.exec(headers.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try { claims = await verifyToken(match[1]); }
    catch { throw new ApiError(401, 'Invalid session'); }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');
    const doc = await db.collection('staff_assignments').doc(claims.uid).get();
    if (!doc.exists || doc.data().active !== true) throw new ApiError(403, 'Active staff assignment required');
    const { role, warehouseIds } = doc.data();
    if (!['system_admin', 'warehouse_admin'].includes(role)) throw new ApiError(403, 'Staff role required');
    return { role, warehouseIds: Array.isArray(warehouseIds) ? warehouseIds : [] };
  }

  function canRead(staff, warehouseId) {
    return staff.role === 'system_admin' || staff.warehouseIds.includes(warehouseId);
  }

  function voucherFrom(doc) {
    const voucher = doc.data();
    return {
      id: doc.id, warehouseId: voucher.warehouseId, beneficiaryId: voucher.beneficiaryId,
      status: voucher.status, lines: (Array.isArray(voucher.lines) ? voucher.lines : []).map(line => ({
        inventoryItemId: line.inventoryItemId, quantity: line.quantity, unitId: line.unitId,
      })),
      note: voucher.note || '', createdByUid: voucher.createdByUid || '',
      confirmedByUid: voucher.confirmedByUid || '',
      createdAt: dateString(voucher.createdAt), confirmedAt: dateString(voucher.confirmedAt),
    };
  }

  function dateFilter(value, endOfDay = false) {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) {
      throw new ApiError(400, 'Invalid date filter');
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new ApiError(400, 'Invalid date filter');
    if (endOfDay && value.length === 10) date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  async function list(url, staff) {
    const warehouseId = url.searchParams.get('warehouseId') || '';
    const beneficiaryId = url.searchParams.get('beneficiaryId') || '';
    const status = url.searchParams.get('status') || '';
    const from = dateFilter(url.searchParams.get('from'));
    const to = dateFilter(url.searchParams.get('to'), true);
    const limit = pageNumber(url.searchParams.get('limit'), 25, 50);
    let offset = pageNumber(url.searchParams.get('offset'), 0, 10000);
    if (limit < 1 || (warehouseId && !validId(warehouseId)) ||
        (beneficiaryId && !validId(beneficiaryId)) ||
        (status && !/^[a-z_]{1,32}$/.test(status)) || (from && to && from > to)) {
      throw new ApiError(400, 'Invalid distribution filter');
    }
    if (warehouseId && !canRead(staff, warehouseId)) throw new ApiError(403, 'Warehouse access denied');
    if (staff.role === 'warehouse_admin' && !staff.warehouseIds.length) throw new ApiError(403, 'Warehouse assignment required');
    let query = db.collection('distribution_vouchers');
    if (warehouseId) query = query.where('warehouseId', '==', warehouseId);
    else if (staff.role === 'warehouse_admin') query = query.where('warehouseId', 'in', staff.warehouseIds);
    query = query.orderBy('createdAt', 'desc');
    const vouchers = [];
    let more = true;
    for (let scanned = 0; vouchers.length < limit && scanned < 500 && more;) {
      const batchSize = Math.min(100, 500 - scanned);
      const snapshot = await query.offset(offset).limit(batchSize).get();
      for (const doc of snapshot.docs) {
        offset += 1;
        scanned += 1;
        const voucher = voucherFrom(doc);
        const date = new Date(voucher.createdAt);
        if ((!beneficiaryId || voucher.beneficiaryId === beneficiaryId) &&
            (!status || voucher.status === status) &&
            (!from || date >= from) && (!to || date <= to)) {
          vouchers.push({ ...voucher, itemCount: voucher.lines.length });
          if (vouchers.length === limit) break;
        }
      }
      more = vouchers.length === limit || snapshot.size === batchSize;
    }
    return { vouchers, nextOffset: more ? offset : null };
  }

  async function detail(voucherId, staff) {
    if (!validId(voucherId)) throw new ApiError(400, 'Invalid distribution voucher ID');
    const doc = await db.collection('distribution_vouchers').doc(voucherId).get();
    if (!doc.exists) throw new ApiError(404, 'Distribution voucher not found');
    const voucher = voucherFrom(doc);
    if (!canRead(staff, voucher.warehouseId)) throw new ApiError(403, 'Warehouse access denied');
    const snapshot = await db.collection('inventory_movements')
      .where('voucherId', '==', voucherId).orderBy('createdAt', 'asc').limit(101).get();
    if (snapshot.size > 100) throw new ApiError(409, 'Distribution has too many movements');
    const movements = snapshot.docs.map(movementDoc => {
      const movement = movementDoc.data();
      return {
        id: movementDoc.id, type: movement.type, quantity: movement.quantity,
        inventoryItemId: movement.inventoryItemId, voucherId: movement.voucherId,
        warehouseId: movement.warehouseId, actorUid: movement.actorUid || '',
        createdAt: dateString(movement.createdAt),
      };
    });
    if (voucher.status === 'confirmed') {
      const expected = voucher.lines.map(line =>
        JSON.stringify([line.inventoryItemId, -line.quantity, voucher.warehouseId])).sort();
      const actual = movements.map(movement =>
        movement.type === 'distribution'
          ? JSON.stringify([movement.inventoryItemId, movement.quantity, movement.warehouseId])
          : '').sort();
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        throw new ApiError(409, 'Distribution voucher and movements do not match');
      }
    }
    return { voucher, movements, beneficiary: { id: voucher.beneficiaryId } };
  }

  async function handle(method, path, headers, _body, requestUrl = '') {
    if (method !== 'GET') throw new ApiError(404, 'Not found');
    const detailMatch = /^\/v1\/admin\/distributions\/([^/]+)$/.exec(path);
    if (path !== '/v1/admin/distributions' && !detailMatch) throw new ApiError(404, 'Not found');
    const staff = await staffFrom(headers);
    const url = new URL(requestUrl || path, 'http://localhost');
    const result = detailMatch ? await detail(detailMatch[1], staff) : await list(url, staff);
    return { status: 200, body: result };
  }

  return { handle };
}

module.exports = { createDistributionHistoryApi };
