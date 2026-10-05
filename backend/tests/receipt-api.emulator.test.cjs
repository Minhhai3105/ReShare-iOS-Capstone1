const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createReceiptApi } = require('../receipt-api.cjs');

test('US12: receipt creation, idempotency, warehouse access, and state transition in Firestore Emulator', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'receipt-api-emulator-test');
  try {
    const db = getFirestore(app);

    // Setup initial records
    await db.doc('warehouses/kho-hai-chau').set({ name: 'Kho Hải Châu', status: 'active' });
    await db.doc('warehouses/kho-son-tra').set({ name: 'Kho Sơn Trà', status: 'active' });

    await db.doc('staff_assignments/staff-hc').set({
      uid: 'staff-hc',
      role: 'warehouse_admin',
      active: true,
      warehouseIds: ['kho-hai-chau'],
    });

    await db.doc('staff_assignments/staff-st').set({
      uid: 'staff-st',
      role: 'warehouse_admin',
      active: true,
      warehouseIds: ['kho-son-tra'],
    });

    await db.doc('donations/don-emu-1').set({
      id: 'don-emu-1',
      title: 'Bộ bàn ghế học sinh',
      donorId: 'donor-1',
      hubId: 'kho-hai-chau',
      status: 'approved',
      quantity: 2,
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.doc('donations/don-emu-pending').set({
      id: 'don-emu-pending',
      title: 'Tủ sách cũ',
      donorId: 'donor-2',
      hubId: 'kho-hai-chau',
      status: 'pending',
      quantity: 1,
      createdAt: FieldValue.serverTimestamp(),
    });

    const api = createReceiptApi({
      db,
      verifyToken: async (token) => {
        if (token === 'staff-hc-token') return { uid: 'staff-hc', email: 'haichau@reshare.vn' };
        if (token === 'staff-st-token') return { uid: 'staff-st', email: 'sontra@reshare.vn' };
        throw new Error('Invalid token');
      },
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    // 1. Worker assigned to kho-hai-chau successfully creates receipt
    const response = await api.handle(
      'POST',
      '/v1/admin/donations/don-emu-1/receipt',
      { authorization: 'Bearer staff-hc-token' },
      {
        warehouseId: 'kho-hai-chau',
        quantity: 2,
        unitId: 'set',
        conditionId: 'good',
        note: 'Hàng đúng mô tả, tiếp nhận đủ 2 bộ bàn ghế',
      }
    );

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.receipt.id, 'rcp_don-emu-1');

    // Verify Firestore documents
    const receiptDoc = await db.doc('receipts/rcp_don-emu-1').get();
    assert.equal(receiptDoc.exists, true);
    assert.equal(receiptDoc.data().quantity, 2);
    assert.equal(receiptDoc.data().unitId, 'set');
    assert.equal(receiptDoc.data().warehouseId, 'kho-hai-chau');
    assert.equal(receiptDoc.data().actorUid, 'staff-hc');

    const donationDoc = await db.doc('donations/don-emu-1').get();
    assert.equal(donationDoc.data().status, 'received');
    assert.equal(donationDoc.data().actualReceiptId, 'rcp_don-emu-1');
    assert.equal(donationDoc.data().receivedWarehouseId, 'kho-hai-chau');

    // 2. Idempotent replay: submitting again returns existing receipt
    const replayResponse = await api.handle(
      'POST',
      '/v1/admin/donations/don-emu-1/receipt',
      { authorization: 'Bearer staff-hc-token' },
      {
        warehouseId: 'kho-hai-chau',
        quantity: 2,
        unitId: 'set',
        conditionId: 'good',
      }
    );
    assert.equal(replayResponse.status, 201);
    assert.equal(replayResponse.body.receipt.id, 'rcp_don-emu-1');
    assert.equal(replayResponse.body.receipt.idempotentReplay, true);

    // 3. Worker assigned only to Son Tra attempts to receive at Hai Chau -> 403 Forbidden
    await assert.rejects(
      () => api.handle(
        'POST',
        '/v1/admin/donations/don-emu-pending/receipt',
        { authorization: 'Bearer staff-st-token' },
        {
          warehouseId: 'kho-hai-chau',
          quantity: 1,
          unitId: 'piece',
          conditionId: 'good',
        }
      ),
      { status: 403, message: 'Nhân sự không có quyền thao tác tại kho này' }
    );

    // 4. Attempt to receive pending donation -> 409 Conflict
    await assert.rejects(
      () => api.handle(
        'POST',
        '/v1/admin/donations/don-emu-pending/receipt',
        { authorization: 'Bearer staff-hc-token' },
        {
          warehouseId: 'kho-hai-chau',
          quantity: 1,
          unitId: 'piece',
          conditionId: 'good',
        }
      ),
      { status: 409 }
    );
  } finally {
    await deleteApp(app);
  }
});
