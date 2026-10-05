const test = require('node:test');
const assert = require('node:assert/strict');
const { createReceiptApi } = require('../receipt-api.cjs');

function setup() {
  const documents = new Map([
    ['staff_assignments/admin', { uid: 'admin', role: 'system_admin', active: true, warehouseIds: [] }],
    ['staff_assignments/worker-a', { uid: 'worker-a', role: 'warehouse_admin', active: true, warehouseIds: ['kho-a'] }],
    ['staff_assignments/worker-b', { uid: 'worker-b', role: 'warehouse_admin', active: true, warehouseIds: ['kho-b'] }],
    ['staff_assignments/inactive-worker', { uid: 'inactive-worker', role: 'warehouse_admin', active: false, warehouseIds: ['kho-a'] }],
    ['donations/don-approved', {
      id: 'don-approved',
      title: 'Quần áo mùa đông',
      donorId: 'donor-1',
      status: 'approved',
      hubId: 'kho-a',
      quantity: 5,
      createdAt: new Date(),
    }],
    ['donations/don-pending', {
      id: 'don-pending',
      title: 'Sách giáo khoa',
      donorId: 'donor-2',
      status: 'pending',
      hubId: 'kho-a',
      quantity: 10,
      createdAt: new Date(),
    }],
  ]);

  const inventorySnapshots = new Map([
    ['inventory/item-1', { quantity: 100 }],
  ]);

  const snapshot = (id, data) => ({ id, exists: data !== undefined, data: () => data });

  const db = {
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            key,
            id,
            async get() { return snapshot(id, documents.get(key)); },
          };
        },
      };
    },
    async runTransaction(work) {
      const writes = [];
      const updates = [];
      const result = await work({
        get: async (ref) => snapshot(ref.id, documents.get(ref.key)),
        set: (ref, data) => writes.push([ref.key, data]),
        update: (ref, data) => updates.push([ref.key, data]),
      });
      for (const [key, data] of writes) documents.set(key, data);
      for (const [key, data] of updates) {
        const current = documents.get(key) || {};
        documents.set(key, { ...current, ...data });
      }
      return result;
    },
  };

  const api = createReceiptApi({
    db,
    verifyToken: async (token) => {
      if (token === 'admin-token') return { uid: 'admin', email: 'admin@reshare.vn' };
      if (token === 'worker-a-token') return { uid: 'worker-a', email: 'worker-a@reshare.vn' };
      if (token === 'worker-b-token') return { uid: 'worker-b', email: 'worker-b@reshare.vn' };
      if (token === 'inactive-token') return { uid: 'inactive-worker', email: 'inactive@reshare.vn' };
      if (token === 'donor-token') return { uid: 'donor', email: 'donor@reshare.vn' };
      throw new Error('Invalid token');
    },
    serverTimestamp: () => '2026-10-06T00:00:00.000Z',
  });

  return { api, documents, inventorySnapshots };
}

test('US12: missing token returns 401', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle('POST', '/v1/admin/donations/don-approved/receipt', {}, {
      warehouseId: 'kho-a',
      quantity: 5,
      unitId: 'piece',
      conditionId: 'good',
    }),
    { status: 401, message: 'Sign in required' }
  );
});

test('US12: non-staff user returns 403', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle(
      'POST',
      '/v1/admin/donations/don-approved/receipt',
      { authorization: 'Bearer donor-token' },
      { warehouseId: 'kho-a', quantity: 5, unitId: 'piece', conditionId: 'good' }
    ),
    { status: 403 }
  );
});

test('US12: warehouse authorization check rejects worker from unassigned warehouse (AC3)', async () => {
  const { api } = setup();
  // worker-b is only assigned to kho-b, attempting to receive at kho-a
  await assert.rejects(
    () => api.handle(
      'POST',
      '/v1/admin/donations/don-approved/receipt',
      { authorization: 'Bearer worker-b-token' },
      { warehouseId: 'kho-a', quantity: 5, unitId: 'piece', conditionId: 'good' }
    ),
    { status: 403, message: 'Nhân sự không có quyền thao tác tại kho này' }
  );
});

test('US12: invalid quantity (<= 0) returns 400', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle(
      'POST',
      '/v1/admin/donations/don-approved/receipt',
      { authorization: 'Bearer worker-a-token' },
      { warehouseId: 'kho-a', quantity: 0, unitId: 'piece', conditionId: 'good' }
    ),
    { status: 400, message: 'Số lượng thực nhận phải lớn hơn 0' }
  );
});

test('US12: non-approved donation (pending) cannot be received, returns 409', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle(
      'POST',
      '/v1/admin/donations/don-pending/receipt',
      { authorization: 'Bearer worker-a-token' },
      { warehouseId: 'kho-a', quantity: 10, unitId: 'piece', conditionId: 'good' }
    ),
    { status: 409 }
  );
});

test('US12: successful receipt creation updates donation to received and preserves inventory invariant (AC5)', async () => {
  const { api, documents, inventorySnapshots } = setup();
  const initialInventory = inventorySnapshots.get('inventory/item-1').quantity;

  const result = await api.handle(
    'POST',
    '/v1/admin/donations/don-approved/receipt',
    { authorization: 'Bearer worker-a-token' },
    {
      warehouseId: 'kho-a',
      quantity: 4,
      unitId: 'piece',
      conditionId: 'minor-wear',
      note: 'Áo mất 1 nút áo, thực nhận 4 chiếc',
    }
  );

  assert.equal(result.status, 201);
  assert.equal(result.body.success, true);
  assert.equal(result.body.receipt.id, 'rcp_don-approved');
  assert.equal(result.body.receipt.quantity, 4);
  assert.equal(result.body.receipt.actorUid, 'worker-a');

  // Verify receipt stored in documents
  const storedReceipt = documents.get('receipts/rcp_don-approved');
  assert.ok(storedReceipt);
  assert.equal(storedReceipt.quantity, 4);
  assert.equal(storedReceipt.unitId, 'piece');

  // Verify donation status changed to received
  const updatedDonation = documents.get('donations/don-approved');
  assert.equal(updatedDonation.status, 'received');
  assert.equal(updatedDonation.actualReceiptId, 'rcp_don-approved');
  assert.equal(updatedDonation.actualQuantity, 4);

  // Invariant (AC5): Inventory is completely untouched
  assert.equal(inventorySnapshots.get('inventory/item-1').quantity, initialInventory);
});

test('US12: idempotent retry returns existing receipt without duplicating', async () => {
  const { api, documents } = setup();

  // First call
  const first = await api.handle(
    'POST',
    '/v1/admin/donations/don-approved/receipt',
    { authorization: 'Bearer worker-a-token' },
    { warehouseId: 'kho-a', quantity: 5, unitId: 'piece', conditionId: 'good' }
  );
  assert.equal(first.status, 201);

  // Second call with same donation
  const second = await api.handle(
    'POST',
    '/v1/admin/donations/don-approved/receipt',
    { authorization: 'Bearer worker-a-token' },
    { warehouseId: 'kho-a', quantity: 5, unitId: 'piece', conditionId: 'good' }
  );
  assert.equal(second.status, 201);
  assert.equal(second.body.receipt.id, 'rcp_don-approved');
  assert.equal(second.body.receipt.idempotentReplay, true);
});
