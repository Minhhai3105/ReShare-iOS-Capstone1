const { ApiError } = require('./image-api.cjs');

function cursorFor(doc, filterKey) {
  return Buffer.from(JSON.stringify({ v: 1, id: doc.id, filterKey })).toString('base64url');
}

async function readCursor(db, collection, token, filterKey, canUse) {
  if (!token) return null;
  if (typeof token !== 'string' || token.length > 2048) throw new ApiError(400, 'Invalid cursor');
  let value;
  try { value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')); }
  catch { throw new ApiError(400, 'Invalid cursor'); }
  if (value?.v !== 1 || value.filterKey !== filterKey ||
      typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id)) {
    throw new ApiError(400, 'Invalid cursor');
  }
  const doc = await db.collection(collection).doc(value.id).get();
  if (!doc.exists || !canUse(doc)) throw new ApiError(400, 'Cursor is no longer valid');
  return doc;
}

function warehouseQueries(query, staff, warehouseId) {
  if (warehouseId) return [query.where('warehouseId', '==', warehouseId)];
  if (staff.role === 'system_admin') return [query];
  const warehouseIds = [...new Set(staff.warehouseIds)];
  const queries = [];
  for (let start = 0; start < warehouseIds.length; start += 30) {
    const ids = warehouseIds.slice(start, start + 30);
    queries.push(ids.length === 1
      ? query.where('warehouseId', '==', ids[0])
      : query.where('warehouseId', 'in', ids));
  }
  return queries;
}

function compareBy(field, direction = 'desc') {
  const binaryCompare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  return (left, right) => {
    const a = left.get(field);
    const b = right.get(field);
    let difference;
    if (a?.seconds !== undefined && b?.seconds !== undefined) {
      difference = a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
    } else if (a instanceof Date && b instanceof Date) {
      difference = a.getTime() - b.getTime();
    } else if (typeof a === 'number' && typeof b === 'number') {
      // Firestore sắp số theo giá trị, còn String() cho "9" > "12"; phải so sánh
      // số riêng để trang gộp không đảo thứ tự khi version vượt quá 9.
      difference = a - b;
    } else {
      difference = binaryCompare(String(a ?? ''), String(b ?? ''));
    }
    if (difference) return direction === 'desc' ? -difference : difference;
    return direction === 'desc'
      ? binaryCompare(right.id, left.id) : binaryCompare(left.id, right.id);
  };
}

async function mergedPage(queries, cursor, limit, compare, sortField) {
  const snapshots = await Promise.all(queries.map(query =>
    (cursor ? query.startAfter(cursor.get(sortField), cursor.id) : query).limit(limit + 1).get()));
  const all = snapshots.flatMap(snapshot => snapshot.docs).sort(compare);
  return { docs: all.slice(0, limit), hasMore: all.length > limit };
}

module.exports = { cursorFor, readCursor, warehouseQueries, compareBy, mergedPage };
