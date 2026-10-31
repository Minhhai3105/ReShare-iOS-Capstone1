const { AggregateField } = require('firebase-admin/firestore');
const { ApiError } = require('./image-api.cjs');
const { warehouseQueries } = require('./scoped-pagination.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const UNIT_IDS = ['piece', 'kg', 'bag', 'box', 'set'];

function dayStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new ApiError(400, 'Invalid date filter');
  const utc = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'Invalid date filter');
  }
  return new Date(`${value}T00:00:00+07:00`);
}

function createDashboardApi({ db, verifyToken }) {
  if (!db || !verifyToken) throw new Error('Dashboard API configuration is incomplete');

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
    return { role: data.role, warehouseIds: Array.isArray(data.warehouseIds) ? data.warehouseIds : [] };
  }

  function dateRange(query, from, toExclusive) {
    if (from) query = query.where('createdAt', '>=', from);
    if (toExclusive) query = query.where('createdAt', '<', toExclusive);
    return query;
  }

  async function count(query) {
    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  async function countAll(queries) {
    return (await Promise.all(queries.map(count))).reduce((total, value) => total + value, 0);
  }

  async function metrics(staff, url) {
    const warehouseId = url.searchParams.get('warehouseId') || '';
    if (warehouseId && !/^[A-Za-z0-9_-]{1,128}$/.test(warehouseId)) {
      throw new ApiError(400, 'Invalid warehouseId');
    }
    if (staff.role === 'warehouse_admin' &&
        (!staff.warehouseIds.length || (warehouseId && !staff.warehouseIds.includes(warehouseId)))) {
      throw new ApiError(403, 'Warehouse access denied');
    }
    const fromText = url.searchParams.get('from') || '';
    const toText = url.searchParams.get('to') || '';
    const from = fromText ? dayStart(fromText) : null;
    const toExclusive = toText ? new Date(dayStart(toText).getTime() + DAY_MS) : null;
    if (from && toExclusive && from >= toExclusive) throw new ApiError(400, 'Invalid date range');

    const donations = status => warehouseQueries(
      db.collection('donations').where('status', '==', status), staff, warehouseId,
    ).map(query => dateRange(query, from, toExclusive));
    const distributions = warehouseQueries(
      db.collection('distribution_vouchers').where('status', '==', 'confirmed'), staff, warehouseId,
    ).map(query => dateRange(query, from, toExclusive));
    // Tồn là tổng delta của sổ biến động đến cuối ngày "to", không lọc theo "from".
    const movements = warehouseQueries(db.collection('inventory_movements'), staff, warehouseId)
      .map(query => toExclusive ? query.where('createdAt', '<', toExclusive) : query);

    // unitId null = tổng toàn bộ movement, dùng để suy ra nhóm "other". Nếu chỉ cộng
    // 5 unit đã biết thì movement có unitId lạ (ví dụ fallback 'chiếc' của phiếu xuất)
    // sẽ bị loại khỏi tổng tồn mà không báo gì — số sai mà nhìn vẫn hợp lệ.
    const sumStock = async unitId => {
      const snapshots = await Promise.all(movements.map(query =>
        (unitId === null ? query : query.where('unitId', '==', unitId))
          .aggregate({ total: AggregateField.sum('quantity') }).get()));
      return snapshots.reduce((total, snapshot) => total + (snapshot.data().total || 0), 0);
    };
    const [pendingDonations, approvedDonations, confirmedDistributions, stockValues] = await Promise.all([
      countAll(donations('pending')),
      countAll(donations('approved')),
      countAll(distributions),
      Promise.all([...UNIT_IDS, null].map(sumStock)),
    ]);
    const knownUnits = stockValues.slice(0, UNIT_IDS.length);
    const stockByUnit = UNIT_IDS.map((unitId, index) => [unitId, knownUnits[index]]);
    stockByUnit.push(['other', stockValues.at(-1) - knownUnits.reduce((a, b) => a + b, 0)]);
    return {
      scope: { warehouseId: warehouseId || null, from: fromText || null, to: toText || null },
      metrics: {
        pendingDonations,
        approvedDonations,
        inventoryAvailableByUnit: Object.fromEntries(stockByUnit),
        confirmedDistributions,
      },
      definitions: {
        pendingDonations: 'Số donation có trạng thái hiện tại pending, lọc theo createdAt.',
        approvedDonations: 'Số donation có trạng thái hiện tại approved, lọc theo createdAt.',
        inventoryAvailableByUnit: toText
          ? 'Tổng delta inventory_movements theo từng unitId đến hết ngày to (Asia/Ho_Chi_Minh); from không áp dụng. Khoá other gom mọi unitId ngoài danh sách chuẩn để tổng không bị thiếu âm thầm.'
          : 'Tổng delta inventory_movements theo từng unitId đến hiện tại; from không áp dụng. Khoá other gom mọi unitId ngoài danh sách chuẩn để tổng không bị thiếu âm thầm.',
        confirmedDistributions: 'Số phiếu xuất confirmed, lọc theo createdAt.',
      },
    };
  }

  async function handle(method, path, headers, _body, requestUrl = '') {
    if (method !== 'GET' || path !== '/v1/admin/dashboard/metrics') throw new ApiError(404, 'Not found');
    const staff = await staffFrom(headers);
    return { status: 200, body: await metrics(staff, new URL(requestUrl || path, 'http://localhost')) };
  }

  return { handle };
}

module.exports = { createDashboardApi };
