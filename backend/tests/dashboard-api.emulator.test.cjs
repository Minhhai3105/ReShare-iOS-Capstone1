const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createDashboardApi } = require('../dashboard-api.cjs');

test('US20: metrics match source records, date range and warehouse permissions', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const suffix = randomUUID().slice(0, 8);
  const app = initializeApp({ projectId: 'demo-reshare' }, `dashboard-${suffix}`);
  const db = getFirestore(app);
  const warehouseA = `d92-a-${suffix}`;
  const warehouseB = `d92-b-${suffix}`;
  const warehouseExtra = `d92-extra-29-${suffix}`;
  const workerA = `d92-worker-a-${suffix}`;
  const admin = `d92-admin-${suffix}`;
  const rows = [
    [`staff_assignments/${workerA}`, { active: true, role: 'warehouse_admin',
      warehouseIds: [warehouseA, ...Array.from({ length: 30 }, (_, i) => `d92-extra-${i}-${suffix}`)] }],
    [`staff_assignments/${admin}`, { active: true, role: 'system_admin', warehouseIds: [] }],
    [`donations/d92-pending-a-${suffix}`, { warehouseId: warehouseA, status: 'pending', createdAt: new Date('2026-10-01T12:00:00Z') }],
    [`donations/d92-approved-a-${suffix}`, { warehouseId: warehouseA, status: 'approved', createdAt: new Date('2026-10-02T10:00:00Z') }],
    [`donations/d92-pending-b-${suffix}`, { warehouseId: warehouseB, status: 'pending', createdAt: new Date('2026-10-02T10:00:00Z') }],
    [`donations/d92-pending-extra-${suffix}`, { warehouseId: warehouseExtra, status: 'pending', createdAt: new Date('2026-10-02T10:00:00Z') }],
    [`distribution_vouchers/d92-confirmed-a-${suffix}`, { warehouseId: warehouseA, status: 'confirmed', createdAt: new Date('2026-10-02T10:00:00Z') }],
    [`distribution_vouchers/d92-confirmed-b-${suffix}`, { warehouseId: warehouseB, status: 'confirmed', createdAt: new Date('2026-10-02T10:00:00Z') }],
    [`distribution_vouchers/d92-confirmed-extra-${suffix}`, { warehouseId: warehouseExtra, status: 'confirmed', createdAt: new Date('2026-10-02T10:00:00Z') }],
    [`distribution_vouchers/d92-pending-a-${suffix}`, { warehouseId: warehouseA, status: 'pending', createdAt: new Date('2026-10-02T10:00:00Z') }],
    [`inventory_movements/d92-in-a-${suffix}`, { warehouseId: warehouseA, type: 'stock_in', unitId: 'piece', quantity: 5, createdAt: new Date('2026-10-01T12:00:00Z') }],
    [`inventory_movements/d92-kg-a-${suffix}`, { warehouseId: warehouseA, type: 'stock_in', unitId: 'kg', quantity: 3, createdAt: new Date('2026-10-01T12:00:00Z') }],
    [`inventory_movements/d92-out-a-${suffix}`, { warehouseId: warehouseA, type: 'distribution', unitId: 'piece', quantity: -2, createdAt: new Date('2026-10-03T12:00:00Z') }],
    // unitId ngoài danh sách chuẩn: phiếu xuất có nhánh fallback 'chiếc', nên tổng tồn
    // phải gom nó vào nhóm other chứ không được bỏ qua.
    [`inventory_movements/d92-stray-a-${suffix}`, { warehouseId: warehouseA, type: 'stock_in', unitId: 'chiếc', quantity: 6, createdAt: new Date('2026-10-01T12:00:00Z') }],
    [`inventory_movements/d92-in-b-${suffix}`, { warehouseId: warehouseB, type: 'stock_in', unitId: 'box', quantity: 9, createdAt: new Date('2026-10-01T12:00:00Z') }],
    [`inventory_movements/d92-in-extra-${suffix}`, { warehouseId: warehouseExtra, type: 'stock_in', unitId: 'piece', quantity: 4, createdAt: new Date('2026-10-01T12:00:00Z') }],
  ];
  const api = createDashboardApi({ db, verifyToken: async token => ({ uid: token }) });
  const call = (uid, query = '') => api.handle('GET', '/v1/admin/dashboard/metrics',
    uid ? { authorization: `Bearer ${uid}` } : {}, null,
    `/v1/admin/dashboard/metrics${query}`);

  try {
    await Promise.all(rows.map(([path, data]) => db.doc(path).set(data)));
    await assert.rejects(call(null), { status: 401 });
    await assert.rejects(call(workerA, `?warehouseId=${warehouseB}`), { status: 403 });
    await assert.rejects(call(workerA, '?from=2026-02-30'), { status: 400 });
    await assert.rejects(call(workerA, '?from=2026-10-04&to=2026-10-02'), { status: 400 });

    const dated = await call(workerA, `?warehouseId=${warehouseA}&from=2026-10-02&to=2026-10-02`);
    assert.deepEqual(dated.body.metrics, {
      pendingDonations: 0, approvedDonations: 1,
      inventoryAvailableByUnit: { piece: 5, kg: 3, bag: 0, box: 0, set: 0, other: 6 },
      confirmedDistributions: 1,
    });
    assert.match(dated.body.definitions.inventoryAvailableByUnit, /from không áp dụng/);

    const current = await call(workerA);
    assert.deepEqual(current.body.metrics, {
      pendingDonations: 2, approvedDonations: 1,
      inventoryAvailableByUnit: { piece: 7, kg: 3, bag: 0, box: 0, set: 0, other: 6 },
      confirmedDistributions: 2,
    });
    const other = await call(admin, `?warehouseId=${warehouseB}`);
    assert.deepEqual(other.body.metrics, {
      pendingDonations: 1, approvedDonations: 0,
      inventoryAvailableByUnit: { piece: 0, kg: 0, bag: 0, box: 9, set: 0, other: 0 },
      confirmedDistributions: 1,
    });

    await db.doc(`staff_assignments/${workerA}`).update({ active: false });
    await assert.rejects(call(workerA), { status: 403 });
  } finally {
    const cleanup = await Promise.allSettled(rows.map(([path]) => db.doc(path).delete()));
    await deleteApp(app);
    assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Emulator cleanup must succeed');
  }
});
