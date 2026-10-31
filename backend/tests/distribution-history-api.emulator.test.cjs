const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createDistributionHistoryApi } = require('../distribution-history-api.cjs');

test('US17: distribution history is scoped, filtered and tied to confirmed movements', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'distribution-history-emulator-test');
  try {
    const db = getFirestore(app);
    await Promise.all([
      db.doc('staff_assignments/history-admin').set({ active: true, role: 'system_admin', warehouseIds: [] }),
      db.doc('staff_assignments/history-a').set({ active: true, role: 'warehouse_admin', warehouseIds: ['history-kho-a'] }),
      db.doc('staff_assignments/history-b').set({ active: true, role: 'warehouse_admin', warehouseIds: ['history-kho-b'] }),
    ]);
    const vouchers = [
      ['history-dist-a', 'history-kho-a', 'person-a', '2026-10-20T10:00:00Z', 2],
      ['history-dist-a2', 'history-kho-a', 'person-b', '2026-10-19T10:00:00Z', 1],
      ['history-dist-b', 'history-kho-b', 'person-c', '2026-10-18T10:00:00Z', 3],
    ];
    for (const [id, warehouseId, beneficiaryId, createdAt, quantity] of vouchers) {
      await db.doc(`distribution_vouchers/${id}`).set({
        warehouseId, beneficiaryId, status: 'confirmed', createdAt: new Date(createdAt),
        confirmedAt: new Date(createdAt), createdByUid: 'history-admin', confirmedByUid: 'history-admin',
        lines: [{ inventoryItemId: `inv_${id}`, quantity, unitId: 'piece' }],
        beneficiaryPhone: 'private-must-not-leak',
      });
      await db.doc(`inventory_movements/mov_${id}`).set({
        type: 'distribution', quantity: -quantity, inventoryItemId: `inv_${id}`,
        voucherId: id, warehouseId, actorUid: 'history-admin', createdAt: new Date(createdAt),
      });
    }
    const api = createDistributionHistoryApi({ db, verifyToken: async token => ({ uid: token }) });
    const get = (path, uid = 'history-admin') => api.handle('GET', path.split('?')[0],
      { authorization: `Bearer ${uid}` }, null, path);
    const listA = (await get('/v1/admin/distributions', 'history-a')).body;
    assert.equal(listA.vouchers.length, 2);
    assert.ok(listA.vouchers.every(voucher => voucher.warehouseId === 'history-kho-a'));
    assert.equal((await get('/v1/admin/distributions?from=2026-10-20&to=2026-10-20', 'history-a')).body.vouchers.length, 1);
    assert.equal((await get('/v1/admin/distributions?beneficiaryId=person-b&status=confirmed', 'history-a')).body.vouchers.length, 1);
    const page = (await get('/v1/admin/distributions?limit=1', 'history-a')).body;
    assert.equal(page.vouchers.length, 1);
    assert.ok(page.nextOffset > 0);
    assert.notEqual(page.vouchers[0].id,
      (await get(`/v1/admin/distributions?limit=1&offset=${page.nextOffset}`, 'history-a')).body.vouchers[0].id);
    await assert.rejects(get('/v1/admin/distributions?warehouseId=history-kho-b', 'history-a'), { status: 403 });
    await assert.rejects(get('/v1/admin/distributions/history-dist-b', 'history-a'), { status: 403 });
    await assert.rejects(get('/v1/admin/distributions', 'history-donor'), { status: 403 });
    const detail = (await get('/v1/admin/distributions/history-dist-a', 'history-a')).body;
    assert.equal(detail.voucher.lines[0].quantity, -detail.movements[0].quantity);
    assert.equal(detail.beneficiary.id, 'person-a');
    assert.equal(JSON.stringify(detail).includes('private-must-not-leak'), false);
    await db.doc('inventory_movements/mov_history-dist-a').update({ quantity: -99 });
    await assert.rejects(get('/v1/admin/distributions/history-dist-a', 'history-a'), { status: 409 });
    await db.doc('inventory_movements/mov_history-dist-a').update({ quantity: -2 });
    await db.doc('distribution_vouchers/history-dist-a').update({
      lines: [
        { inventoryItemId: 'inv_history-dist-a', quantity: 2, unitId: 'piece' },
        { inventoryItemId: 'inv_history-dist-a', quantity: 2, unitId: 'piece' },
      ],
    });
    await db.doc('inventory_movements/mov_history-dist-a-extra').set({
      type: 'distribution', quantity: -2, inventoryItemId: 'unrelated-item',
      voucherId: 'history-dist-a', warehouseId: 'history-kho-a', createdAt: new Date(),
    });
    await assert.rejects(get('/v1/admin/distributions/history-dist-a', 'history-a'), { status: 409 });

    // 2026-10-20T20:00Z = 03:00 ngày 21/10 giờ VN: phải thuộc ngày 21, không thuộc ngày 20.
    await db.doc('distribution_vouchers/history-dist-late').set({
      warehouseId: 'history-kho-a', beneficiaryId: 'person-a', status: 'confirmed',
      createdAt: new Date('2026-10-20T20:00:00Z'), confirmedAt: new Date('2026-10-20T20:00:00Z'),
      createdByUid: 'history-admin', confirmedByUid: 'history-admin',
      lines: [{ inventoryItemId: 'inv_history-dist-late', quantity: 1, unitId: 'piece' }],
    });
    await db.doc('inventory_movements/mov_history-dist-late').set({
      type: 'distribution', quantity: -1, inventoryItemId: 'inv_history-dist-late',
      voucherId: 'history-dist-late', warehouseId: 'history-kho-a',
      actorUid: 'history-admin', createdAt: new Date('2026-10-20T20:00:00Z'),
    });
    const vnDay20 = (await get('/v1/admin/distributions?from=2026-10-20&to=2026-10-20', 'history-a')).body;
    assert.ok(!vnDay20.vouchers.some(v => v.id === 'history-dist-late'));
    const vnDay21 = (await get('/v1/admin/distributions?from=2026-10-21&to=2026-10-21', 'history-a')).body;
    assert.deepEqual(vnDay21.vouchers.map(v => v.id), ['history-dist-late']);
  } finally {
    await deleteApp(app);
  }
});
