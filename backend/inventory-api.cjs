const { ApiError } = require('./image-api.cjs');

const dateString = value => value?.toDate?.().toISOString() ||
  (value instanceof Date ? value.toISOString() : value || null);
const normalizeSearch = value => String(value).toLocaleLowerCase('vi')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd');
const integer = (value, fallback, max) => {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) throw new ApiError(400, 'Invalid pagination');
  return parsed;
};

function createInventoryApi({ db, verifyToken }) {
  if (!db || !verifyToken) throw new Error('Inventory API configuration is incomplete');

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

  function itemFrom(doc) {
    const item = doc.data();
    return { ...item, id: doc.id, createdAt: dateString(item.createdAt), updatedAt: dateString(item.updatedAt) };
  }

  function movementFrom(doc) {
    const movement = doc.data();
    return { ...movement, id: doc.id, voucherId: movement.voucherId || null,
      createdAt: dateString(movement.createdAt) };
  }

  async function list(url, staff) {
    const warehouseId = url.searchParams.get('warehouseId') || '';
    const category = url.searchParams.get('category') || '';
    const condition = url.searchParams.get('condition') || '';
    const stock = url.searchParams.get('stock') || 'all';
    const search = normalizeSearch((url.searchParams.get('search') || '').trim());
    const limit = integer(url.searchParams.get('limit'), 25, 50);
    let offset = integer(url.searchParams.get('offset'), 0, 10000);
    if (limit < 1 || search.length > 80 ||
        (warehouseId && !/^[A-Za-z0-9_-]{1,64}$/.test(warehouseId)) ||
        (category && !['clothing', 'books', 'household'].includes(category)) ||
        (condition && !['good', 'minor-wear', 'damaged'].includes(condition)) ||
        !['all', 'in_stock', 'out_of_stock'].includes(stock)) {
      throw new ApiError(400, 'Invalid inventory filter');
    }
    if (warehouseId && !canRead(staff, warehouseId)) throw new ApiError(403, 'Warehouse access denied');
    if (staff.role === 'warehouse_admin' && !staff.warehouseIds.length) throw new ApiError(403, 'Warehouse assignment required');

    let query = db.collection('inventory');
    if (warehouseId) query = query.where('warehouseId', '==', warehouseId);
    else if (staff.role === 'warehouse_admin') query = query.where('warehouseId', 'in', staff.warehouseIds);
    query = query.orderBy('createdAt', 'desc');
    const items = [];
    let more = true;
    // Search and optional filters scan only authorized inventory in bounded pages.
    // offset always advances by scanned documents, so a later page cannot repeat a result.
    for (let scanned = 0; items.length < limit && scanned < 500 && more;) {
      const batchSize = Math.min(100, 500 - scanned);
      const snapshot = await query.offset(offset).limit(batchSize).get();
      for (const doc of snapshot.docs) {
        offset += 1;
        scanned += 1;
        const item = itemFrom(doc);
        if ((!category || item.category === category) &&
            (!condition || item.conditionId === condition) &&
            (stock === 'all' || (item.quantityAvailable > 0) === (stock === 'in_stock')) &&
            (!search || normalizeSearch(`${item.itemName || ''} ${item.id} ${item.stockEntryId || ''}`).includes(search))) {
          items.push(item);
          if (items.length === limit) break;
        }
      }
      more = items.length === limit || snapshot.size === batchSize;
    }
    return { items, nextOffset: more ? offset : null };
  }

  async function detail(itemId, url, staff) {
    if (!/^inv_rcp_[A-Za-z0-9_-]{1,120}$/.test(itemId)) throw new ApiError(400, 'Invalid inventory ID');
    const doc = await db.collection('inventory').doc(itemId).get();
    if (!doc.exists) throw new ApiError(404, 'Inventory item not found');
    const item = itemFrom(doc);
    if (!canRead(staff, item.warehouseId)) throw new ApiError(403, 'Warehouse access denied');
    const limit = integer(url.searchParams.get('limit'), 25, 50);
    const offset = integer(url.searchParams.get('offset'), 0, 10000);
    if (limit < 1) throw new ApiError(400, 'Invalid pagination');
    const snapshot = await db.collection('inventory_movements')
      .where('inventoryItemId', '==', itemId).orderBy('createdAt', 'desc')
      .offset(offset).limit(limit + 1).get();
    return {
      item, movements: snapshot.docs.slice(0, limit).map(movementFrom),
      nextOffset: snapshot.size > limit ? offset + limit : null,
    };
  }

  async function handle(method, path, headers, _body, queryString = '') {
    if (method !== 'GET') throw new ApiError(404, 'Not found');
    const detailMatch = /^\/v1\/admin\/inventory\/([^/]+)$/.exec(path);
    if (path !== '/v1/admin/inventory' && !detailMatch) throw new ApiError(404, 'Not found');
    const staff = await staffFrom(headers);
    const url = new URL(queryString || path, 'http://localhost');
    const result = detailMatch ? await detail(detailMatch[1], url, staff) : await list(url, staff);
    return { status: 200, body: result };
  }

  return { handle };
}

module.exports = { createInventoryApi };
