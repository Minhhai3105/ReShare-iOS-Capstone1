const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createInventoryApi } = require('../inventory-api.cjs');
const { createStockIntakeApi } = require('../stock-intake-api.cjs');

test('US14: read inventory by assigned warehouse, filter, paginate and trace receipt', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'inventory-api-emulator-test');
  try {
    const db = getFirestore(app);
    const assignments = [
      ['inventory-admin', 'system_admin', []],
      ['inventory-worker-a', 'warehouse_admin', ['kho-a', ...Array.from({ length: 30 }, (_, i) => `kho-extra-${i}`)]],
      ['inventory-worker-b', 'warehouse_admin', ['kho-b']],
    ];
    await Promise.all(assignments.map(([uid, role, warehouseIds]) =>
      db.doc(`staff_assignments/${uid}`).set({ active: true, role, warehouseIds })));
    const verifyToken = async token => ({ uid: token, email: `${token}@example.com` });
    const intake = createStockIntakeApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
    const inventory = createInventoryApi({ db, verifyToken });
    for (const [id, warehouseId, title, category, quantity] of [
      ['item-a', 'kho-a', 'Sách cũ', 'books', 3],
      ['item-b', 'kho-a', 'Áo sơ mi', 'clothing', 2],
      ['item-c', 'kho-b', 'Nồi cơm', 'household', 1],
    ]) {
      const receiptId = `rcp_${id}`;
      await db.doc(`donations/${id}`).set({ id, title, category, quantity: quantity + 2,
        warehouseId, status: 'received', actualReceiptId: receiptId });
      await db.doc(`receipts/${receiptId}`).set({ id: receiptId, donationId: id,
        warehouseId, quantity, unitId: 'piece', conditionId: 'good' });
      await intake.handle('POST', `/v1/admin/donations/${id}/stock-in`,
        { authorization: 'Bearer inventory-admin' },
        { receiptId, location: 'Kệ A1', note: '', idempotencyKey: `stk_${receiptId}` });
    }
    await db.doc('inventory/extra-warehouse-item').set({
      warehouseId: 'kho-extra-29', itemName: 'Thùng mở rộng', category: 'household',
      conditionId: 'good', quantityAvailable: 1, unitId: 'box',
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });
    const get = (path, uid = 'inventory-admin') => inventory.handle('GET', path.split('?')[0],
      { authorization: `Bearer ${uid}` }, null, path);
    const pageA = (await get('/v1/admin/inventory', 'inventory-worker-a')).body;
    assert.equal(pageA.items.length, 3);
    assert.ok(pageA.items.every(item => ['kho-a', 'kho-extra-29'].includes(item.warehouseId)));
    assert.equal((await get('/v1/admin/inventory', 'inventory-admin')).body.items.length, 4);
    assert.equal((await get('/v1/admin/inventory?category=books&search=Sách', 'inventory-worker-a')).body.items.length, 1);
    assert.equal((await get('/v1/admin/inventory?category=books&search=sach', 'inventory-worker-a')).body.items.length, 1);
    const firstPage = (await get('/v1/admin/inventory?limit=1', 'inventory-worker-a')).body;
    assert.equal(firstPage.items.length, 1);
    assert.ok(firstPage.nextCursor);
    const secondPage = (await get(`/v1/admin/inventory?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`, 'inventory-worker-a')).body;
    assert.equal(secondPage.items.length, 1);
    assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);
    const thirdPage = (await get(`/v1/admin/inventory?limit=1&cursor=${encodeURIComponent(secondPage.nextCursor)}`, 'inventory-worker-a')).body;
    assert.equal(thirdPage.items[0].id, 'extra-warehouse-item');
    await assert.rejects(get('/v1/admin/inventory?limit=1&offset=1', 'inventory-worker-a'), { status: 400 });
    await assert.rejects(get('/v1/admin/inventory?limit=1&cursor=invalid', 'inventory-worker-a'), { status: 400 });
    await assert.rejects(get('/v1/admin/inventory?warehouseId=kho-b', 'inventory-worker-a'), { status: 403 });
    await assert.rejects(get('/v1/admin/inventory/inv_rcp_item-c', 'inventory-worker-a'), { status: 403 });
    await assert.rejects(get('/v1/admin/inventory', 'donor'), { status: 403 });
    const detail = (await get('/v1/admin/inventory/inv_rcp_item-a', 'inventory-worker-a')).body;
    assert.equal(detail.item.quantityAvailable, 3);
    assert.equal(detail.movements[0].quantity, 3);
    assert.equal(detail.movements[0].receiptId, 'rcp_item-a');
    assert.equal(detail.movements[0].voucherId, null);
    assert.equal(detail.movements[0].stockEntryId, 'ste_rcp_item-a');

    // Dòng trong danh sách phải mở được dù ID không theo tiền tố inv_rcp_ (dữ liệu seed/demo).
    await db.doc('inventory/legacy-item').set({
      warehouseId: 'kho-a', itemName: 'Thùng cũ', category: 'household',
      conditionId: 'good', unitId: 'piece', quantityReceived: 1, quantityAvailable: 1,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    const legacy = (await get('/v1/admin/inventory/legacy-item', 'inventory-worker-a')).body;
    assert.equal(legacy.item.id, 'legacy-item');
    assert.deepEqual(legacy.movements, []);
    await assert.rejects(get('/v1/admin/inventory/khong@hop-le', 'inventory-worker-a'), { status: 400 });
    // API không nhận offset để tránh tính phí đọc các document bị bỏ qua.
    await assert.rejects(get('/v1/admin/inventory?offset=999999', 'inventory-worker-a'), { status: 400 });
  } finally {
    await deleteApp(app);
  }
});
