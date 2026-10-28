const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createDistributionApi } = require('../distribution-api.cjs');

test('US16: Concurrent distribution requests in Firestore Emulator never result in negative stock (AC3)', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'distribution-api-emulator-test');
  const db = getFirestore(app);
  const warehouseId = 'kho-hai-chau';
  const itemId = 'item-emu-concurrent';
  const beneficiaryId = 'ben-emu-concurrent';
  let results = [];

  try {
    // 1. Seed initial data
    await db.doc(`warehouses/${warehouseId}`).set({ name: 'Kho Hải Châu', status: 'active' });
    await db.doc('staff_assignments/staff-hc-1').set({
      uid: 'staff-hc-1',
      role: 'warehouse_admin',
      active: true,
      warehouseIds: [warehouseId],
    });
    await db.doc('staff_assignments/staff-hc-2').set({
      uid: 'staff-hc-2',
      role: 'warehouse_admin',
      active: true,
      warehouseIds: [warehouseId],
    });

    await db.doc(`beneficiaries/${beneficiaryId}`).set({
      name: 'Người thụ hưởng Emulator',
      warehouseId,
      area: 'Hải Châu',
      approved: true,
    });

    // Initial stock: 3 items (US13 schema with quantityAvailable)
    await db.doc(`inventory/${itemId}`).set({
      id: itemId,
      itemName: 'Áo khoác gió',
      category: 'clothing',
      warehouseId,
      quantityReceived: 3,
      quantityAvailable: 3,
      unitId: 'chiếc',
      version: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const api = createDistributionApi({
      db,
      verifyToken: async (token) => {
        if (token === 'staff-1-token') return { uid: 'staff-hc-1', email: 'hc1@reshare.vn' };
        if (token === 'staff-2-token') return { uid: 'staff-hc-2', email: 'hc2@reshare.vn' };
        throw new Error('Invalid token');
      },
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    // 2. Fire two concurrent distribution requests attempting to export 2 items each from stock of 3
    const request1 = api.handle(
      'POST',
      '/v1/admin/distribution',
      { authorization: 'Bearer staff-1-token' },
      {
        warehouseId,
        itemId,
        beneficiaryId,
        quantity: 2,
        handedOver: true,
        expectedVersion: 1,
      }
    );

    const request2 = api.handle(
      'POST',
      '/v1/admin/distribution',
      { authorization: 'Bearer staff-2-token' },
      {
        warehouseId,
        itemId,
        beneficiaryId,
        quantity: 2,
        handedOver: true,
        expectedVersion: 1,
      }
    );

    results = await Promise.allSettled([request1, request2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed, and exactly one must fail
    assert.equal(fulfilled.length, 1, 'Chính xác 1 request thành công');
    assert.equal(rejected.length, 1, 'Chính xác 1 request bị từ chối');

    assert.equal(fulfilled[0].value.status, 201);
    assert.equal(fulfilled[0].value.body.success, true);
    assert.equal(fulfilled[0].value.body.voucher.before, 3);
    assert.equal(fulfilled[0].value.body.voucher.after, 1);

    const error = rejected[0].reason;
    assert.equal(error.status, 409, 'Lỗi phải trả về 409 Conflict');
    assert.ok(
      error.code === 'INSUFFICIENT_STOCK' || error.code === 'STOCK_CONFLICT',
      `Error code phải là INSUFFICIENT_STOCK hoặc STOCK_CONFLICT, nhận được: ${error.code}`
    );

    // Verify DB state: stock must be 1, never negative
    const itemDoc = await db.doc(`inventory/${itemId}`).get();
    const itemData = itemDoc.data();
    assert.equal(itemData.quantityAvailable, 1, 'Tồn kho còn lại đúng bằng 1');
    assert.equal(itemData.version, 2, 'Version được tăng lên 2');

    // Verify US17 compatibility: vouchers and movements match
    const voucherId = fulfilled[0].value.body.voucher.id;
    const voucherDoc = await db.doc(`distribution_vouchers/${voucherId}`).get();
    assert.ok(voucherDoc.exists);
    const voucher = voucherDoc.data();
    assert.equal(voucher.status, 'confirmed');
    assert.equal(voucher.lines.length, 1);
    assert.equal(voucher.lines[0].inventoryItemId, itemId);
    assert.equal(voucher.lines[0].quantity, 2);

    const movementId = fulfilled[0].value.body.movement.id;
    const movementDoc = await db.doc(`inventory_movements/${movementId}`).get();
    assert.ok(movementDoc.exists);
    const movement = movementDoc.data();
    assert.equal(movement.type, 'distribution');
    assert.equal(movement.inventoryItemId, itemId);
    assert.equal(movement.quantity, -2);
  } finally {
    try {
      const deleteOps = [
        db.doc(`warehouses/${warehouseId}`).delete(),
        db.doc('staff_assignments/staff-hc-1').delete(),
        db.doc('staff_assignments/staff-hc-2').delete(),
        db.doc(`beneficiaries/${beneficiaryId}`).delete(),
        db.doc(`inventory/${itemId}`).delete(),
      ];
      if (Array.isArray(results)) {
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value?.body?.voucher?.id) {
            deleteOps.push(db.doc(`distribution_vouchers/${r.value.body.voucher.id}`).delete());
          }
          if (r.status === 'fulfilled' && r.value?.body?.movement?.id) {
            deleteOps.push(db.doc(`inventory_movements/${r.value.body.movement.id}`).delete());
          }
        }
      }
      await Promise.allSettled(deleteOps);
    } catch {
      // ignore cleanup errors
    }
    await deleteApp(app);
  }
});

