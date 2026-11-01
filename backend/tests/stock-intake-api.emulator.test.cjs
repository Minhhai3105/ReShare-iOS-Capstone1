const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createStockIntakeApi } = require('../stock-intake-api.cjs');

async function removeFixtureDocs(db, paths) {
  const results = await Promise.allSettled(paths.map(path => db.doc(path).delete()));
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected' ? [`${paths[index]}: ${result.reason?.message || result.reason}`] : []);
  assert.deepEqual(failures, []);
}

test('US13: intake uses actual receipt quantity once under concurrent requests', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'stock-intake-emulator-test');
  const db = getFirestore(app);
  const donationId = 'don-stock-intake-test';
  const receiptId = `rcp_${donationId}`;
  try {
    await db.doc('warehouses/kho-a').set({ name: 'Kho A', status: 'active' });
    await db.doc('staff_assignments/worker-a').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] });
    await db.doc('staff_assignments/worker-b').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] });
    await db.doc('staff_assignments/wrong-warehouse').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-b'] });
    await db.doc(`donations/${donationId}`).set({
      title: 'Sách cũ', category: 'books', quantity: 5, status: 'received',
      warehouseId: 'kho-a', actualReceiptId: receiptId,
    });
    await db.doc(`receipts/${receiptId}`).set({
      id: receiptId, donationId, warehouseId: 'kho-a', quantity: 3,
      unitId: 'piece', conditionId: 'good',
    });
    const api = createStockIntakeApi({
      db, serverTimestamp: () => FieldValue.serverTimestamp(),
      verifyToken: async token => ({ uid: token }),
    });
    const path = `/v1/admin/donations/${donationId}/stock-in`;
    const body = { receiptId, location: 'Kệ A1', note: 'Đã kiểm đếm', idempotencyKey: `stk_${receiptId}`, quantity: 100 };
    await assert.rejects(
      api.handle('POST', path, { authorization: 'Bearer wrong-warehouse' }, body),
      { status: 403 }
    );
    const responses = await Promise.all([
      api.handle('POST', path, { authorization: 'Bearer worker-a' }, body),
      api.handle('POST', path, { authorization: 'Bearer worker-b' }, body),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
    assert.deepEqual(responses.map(response => response.body.idempotentReplay).sort(), [false, true]);
    const inventory = (await db.doc(`inventory/inv_${receiptId}`).get()).data();
    assert.equal(inventory.quantityReceived, 3);
    assert.equal(inventory.quantityAvailable, 3);
    assert.equal(inventory.donationId, donationId);
    assert.equal(inventory.receiptId, receiptId);
    const movement = (await db.doc(`inventory_movements/mov_in_${receiptId}`).get()).data();
    assert.equal(movement.quantity, 3);
    assert.equal(movement.type, 'stock_in');
    assert.equal(movement.receiptId, receiptId);
    assert.equal(movement.warehouseId, 'kho-a');
    assert.equal((await db.collection('inventory_movements').where('receiptId', '==', receiptId).get()).size, 1);
    assert.equal((await db.doc(`receipts/${receiptId}`).get()).data().stockEntryId, `ste_${receiptId}`);
    assert.equal((await db.doc(`donations/${donationId}`).get()).data().status, 'in_stock');
    const entry = (await api.handle('GET', `/v1/admin/stock-entries/ste_${receiptId}`,
      { authorization: 'Bearer worker-a' })).body.stockEntry;
    assert.equal(entry.items[0].quantity, 3);
    assert.equal(entry.movement.receiptId, receiptId);
    assert.equal(entry.warehouseName, 'Kho A', 'màn phiếu nhập hiện tên kho, không phải mã kho');
    assert.equal(entry.movement.warehouseName, 'Kho A');
    await assert.rejects(api.handle('POST', path, { authorization: 'Bearer worker-a' },
      { ...body, location: 'Kệ khác' }), { status: 409 });
  } finally {
    try {
      await removeFixtureDocs(db, [
        'warehouses/kho-a',
        'staff_assignments/worker-a',
        'staff_assignments/worker-b',
        'staff_assignments/wrong-warehouse',
        `donations/${donationId}`,
        `receipts/${receiptId}`,
        `stock_entries/ste_${receiptId}`,
        `inventory/inv_${receiptId}`,
        `inventory_movements/mov_in_${receiptId}`,
      ]);
    } finally {
      await deleteApp(app);
    }
  }
});

test('US13: intake rejects missing, invalid and unrelated receipts', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'stock-intake-invalid-emulator-test');
  const db = getFirestore(app);
  try {
    await db.doc('staff_assignments/intake-admin').set({ active: true, role: 'system_admin', warehouseIds: [] });
    const api = createStockIntakeApi({ db, verifyToken: async token => ({ uid: token }) });
    const headers = { authorization: 'Bearer intake-admin' };
    await assert.rejects(api.handle('POST', '/v1/admin/donations/missing/stock-in', headers,
      { receiptId: 'rcp_missing', location: 'Kệ A1', note: '', idempotencyKey: 'stk_rcp_missing' }), { status: 404 });
    await db.doc('donations/invalid-intake').set({ status: 'approved', warehouseId: 'kho-a', actualReceiptId: 'rcp_invalid-intake' });
    await db.doc('receipts/rcp_invalid-intake').set({
      id: 'rcp_invalid-intake', donationId: 'invalid-intake', warehouseId: 'kho-a', quantity: 1, unitId: 'piece',
    });
    await assert.rejects(api.handle('POST', '/v1/admin/donations/invalid-intake/stock-in', headers,
      { receiptId: 'rcp_invalid-intake', location: 'Kệ A1', note: '', idempotencyKey: 'stk_rcp_invalid-intake' }), { status: 409 });
    assert.equal((await db.doc('inventory/inv_rcp_invalid-intake').get()).exists, false);
  } finally {
    try {
      await removeFixtureDocs(db, [
        'staff_assignments/intake-admin',
        'donations/invalid-intake',
        'receipts/rcp_invalid-intake',
        'stock_entries/ste_rcp_invalid-intake',
        'inventory/inv_rcp_invalid-intake',
        'inventory_movements/mov_in_rcp_invalid-intake',
      ]);
    } finally {
      await deleteApp(app);
    }
  }
});
