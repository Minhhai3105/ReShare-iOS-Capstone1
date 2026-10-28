const test = require('node:test');
const assert = require('node:assert/strict');
const { createDistributionApi } = require('../distribution-api.cjs');

function setup() {
  const documents = new Map([
    ['staff_assignments/admin', { uid: 'admin', email: 'admin@reshare.vn', role: 'system_admin', active: true, warehouseIds: [] }],
    ['staff_assignments/worker-hai-chau', { uid: 'worker-hai-chau', email: 'hc@reshare.vn', role: 'warehouse_admin', active: true, warehouseIds: ['hai-chau'] }],
    ['staff_assignments/worker-son-tra', { uid: 'worker-son-tra', email: 'st@reshare.vn', role: 'warehouse_admin', active: true, warehouseIds: ['son-tra'] }],
    ['staff_assignments/inactive-worker', { uid: 'inactive-worker', email: 'inact@reshare.vn', role: 'warehouse_admin', active: false, warehouseIds: ['hai-chau'] }],
    ['warehouses/hai-chau', { name: 'Kho Hải Châu', status: 'active' }],
    ['warehouses/son-tra', { name: 'Kho Sơn Trà', status: 'active' }],
    ['inventory/item-1', {
      id: 'item-1',
      name: 'Áo khoác người lớn',
      warehouseId: 'hai-chau',
      categoryId: 'clothing',
      available: 3,
      unit: 'chiếc',
      location: 'A-02',
      sourceReceipt: 'PNK-001',
      version: 1,
    }],
    ['inventory/item-us13', {
      id: 'item-us13',
      itemName: 'Sách giáo khoa lớp 5',
      warehouseId: 'hai-chau',
      category: 'books',
      quantityReceived: 3,
      quantityAvailable: 3,
      unitId: 'bộ',
      location: 'C-03',
      receiptId: 'rcp_don-us13',
      stockEntryId: 'ste_rcp_don-us13',
      version: 1,
    }],
    ['inventory/item-2', {
      id: 'item-2',
      name: 'Chăn ấm',
      warehouseId: 'son-tra',
      categoryId: 'blankets',
      available: 5,
      unit: 'chiếc',
      location: 'B-01',
      sourceReceipt: 'PNK-002',
      version: 1,
    }],
    ['beneficiaries/ben-1', {
      id: 'ben-1',
      name: 'Nguyễn Văn A',
      warehouseId: 'hai-chau',
      area: 'Hải Châu',
      approved: true,
    }],
    ['beneficiaries/ben-pending', {
      id: 'ben-pending',
      name: 'Trần Thị B',
      warehouseId: 'hai-chau',
      area: 'Hải Châu',
      approved: false,
    }],
    ['beneficiaries/ben-son-tra', {
      id: 'ben-son-tra',
      name: 'Lê Văn C',
      warehouseId: 'son-tra',
      area: 'Sơn Trà',
      approved: true,
    }],
  ]);

  const snapshot = (id, data) => ({
    id,
    exists: data !== undefined,
    data: () => (data ? { ...data } : undefined),
  });

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
        async get() {
          const docs = [];
          for (const [key, val] of documents.entries()) {
            if (key.startsWith(`${name}/`)) {
              const id = key.slice(name.length + 1);
              docs.push(snapshot(id, val));
            }
          }
          return { docs, empty: docs.length === 0 };
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
        const existing = documents.get(key) || {};
        documents.set(key, { ...existing, ...data });
      }
      return result;
    },
  };

  const verifyToken = async (token) => {
    if (token === 'admin-token') return { uid: 'admin', email: 'admin@reshare.vn' };
    if (token === 'hc-token') return { uid: 'worker-hai-chau', email: 'hc@reshare.vn' };
    if (token === 'st-token') return { uid: 'worker-son-tra', email: 'st@reshare.vn' };
    if (token === 'inactive-token') return { uid: 'inactive-worker', email: 'inact@reshare.vn' };
    throw new Error('Invalid token');
  };

  const api = createDistributionApi({
    db,
    verifyToken,
    serverTimestamp: () => new Date('2026-10-29T00:00:00Z'),
  });

  return { api, documents };
}

test('RC1D-83: unauthenticated request returns 401', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle('GET', '/v1/admin/distribution/options', {}),
    { status: 401 }
  );
});

test('RC1D-83: warehouse admin cannot access unassigned warehouse options', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle('GET', '/v1/admin/distribution/options?warehouseId=son-tra', { authorization: 'Bearer hc-token' }),
    { status: 403 }
  );
});

test('RC1D-83: options endpoint lists only scoped inventory and approved beneficiaries', async () => {
  const { api } = setup();
  const res = await api.handle('GET', '/v1/admin/distribution/options', { authorization: 'Bearer hc-token' });
  assert.equal(res.status, 200);
  assert.equal(res.body.warehouses.length, 1);
  assert.equal(res.body.warehouses[0].id, 'hai-chau');
  assert.equal(res.body.inventory.length, 2);
  assert.ok(res.body.inventory.every(i => i.warehouseId === 'hai-chau'));
  assert.equal(res.body.beneficiaries.length, 1);
  assert.equal(res.body.beneficiaries[0].id, 'ben-1');
});

test('RC1D-83: AC1 & AC4: partial distribution (stock 3 -> export 2 -> stock 1) generates voucher and movement', async () => {
  const { api, documents } = setup();
  const draft = {
    warehouseId: 'hai-chau',
    itemId: 'item-1',
    beneficiaryId: 'ben-1',
    quantity: 2,
    handedOver: true,
    note: 'Hỗ trợ hộ khó khăn',
    expectedVersion: 1,
  };

  const res = await api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, draft);
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.item.available, 1);
  assert.equal(res.body.item.version, 2);
  assert.equal(res.body.voucher.before, 3);
  assert.equal(res.body.voucher.after, 1);
  assert.equal(res.body.voucher.quantity, 2);
  assert.equal(res.body.movement.quantity, -2);

  // Check state in DB
  const itemInDb = documents.get('inventory/item-1');
  assert.equal(itemInDb.available, 1);
  assert.equal(itemInDb.version, 2);

  const voucherInDb = documents.get(`distribution_vouchers/${res.body.voucher.id}`);
  assert.ok(voucherInDb);
  assert.equal(voucherInDb.itemId, 'item-1');
  assert.equal(voucherInDb.quantity, 2);
  assert.equal(voucherInDb.warehouseId, 'hai-chau');
  assert.equal(voucherInDb.actor.id, 'worker-hai-chau');
  assert.equal(voucherInDb.status, 'confirmed', 'Voucher status phải là confirmed cho US17');
  assert.ok(Array.isArray(voucherInDb.lines), 'Voucher phải có mảng lines cho US17');
  assert.equal(voucherInDb.lines[0].inventoryItemId, 'item-1');
  assert.equal(voucherInDb.lines[0].quantity, 2);

  const movementInDb = documents.get(`inventory_movements/${res.body.movement.id}`);
  assert.ok(movementInDb);
  assert.equal(movementInDb.type, 'distribution');
  assert.equal(movementInDb.quantity, -2);
  assert.equal(movementInDb.inventoryItemId, 'item-1', 'Movement phải có inventoryItemId cho US17 đối chiếu');
});

test('RC1D-83: US13 stock intake item (quantityAvailable, itemName, unitId) can be distributed', async () => {
  const { api, documents } = setup();
  const options = await api.handle('GET', '/v1/admin/distribution/options?warehouseId=hai-chau', { authorization: 'Bearer hc-token' });
  const us13Option = options.body.inventory.find(i => i.id === 'item-us13');
  assert.ok(us13Option, 'Options phải tìm thấy item-us13 tạo bởi US13');
  assert.equal(us13Option.available, 3, 'Tồn khả dụng phải là 3 chứ không phải 0');
  assert.equal(us13Option.name, 'Sách giáo khoa lớp 5');
  assert.equal(us13Option.unit, 'bộ');

  const res = await api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, {
    warehouseId: 'hai-chau',
    itemId: 'item-us13',
    beneficiaryId: 'ben-1',
    quantity: 2,
    handedOver: true,
    expectedVersion: 1,
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.item.available, 1);
  assert.equal(res.body.item.name, 'Sách giáo khoa lớp 5');

  const updatedDb = documents.get('inventory/item-us13');
  assert.equal(updatedDb.quantityAvailable, 1);
  assert.equal(updatedDb.available, 1);
  assert.equal(updatedDb.version, 2);
});

test('RC1D-83: AC2: subsequent distribution exceeding remaining stock is rejected with INSUFFICIENT_STOCK', async () => {
  const { api } = setup();
  // First export 2 of 3 -> leaves 1
  await api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, {
    warehouseId: 'hai-chau',
    itemId: 'item-1',
    beneficiaryId: 'ben-1',
    quantity: 2,
    handedOver: true,
    expectedVersion: 1,
  });

  // Second export attempts to take 2 from remaining 1 -> should fail
  await assert.rejects(
    () => api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, {
      warehouseId: 'hai-chau',
      itemId: 'item-1',
      beneficiaryId: 'ben-1',
      quantity: 2,
      handedOver: true,
      expectedVersion: 2,
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'INSUFFICIENT_STOCK');
      assert.equal(err.details?.item?.available, 1);
      return true;
    }
  );
});

test('RC1D-83: AC3: stale version conflict is rejected with STOCK_CONFLICT', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, {
      warehouseId: 'hai-chau',
      itemId: 'item-1',
      beneficiaryId: 'ben-1',
      quantity: 1,
      handedOver: true,
      expectedVersion: 999, // Stale version
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'STOCK_CONFLICT');
      assert.equal(err.details?.item?.version, 1);
      return true;
    }
  );
});

test('RC1D-83: unapproved beneficiary or cross-warehouse beneficiary is rejected', async () => {
  const { api } = setup();
  // Unapproved beneficiary
  await assert.rejects(
    () => api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, {
      warehouseId: 'hai-chau',
      itemId: 'item-1',
      beneficiaryId: 'ben-pending',
      quantity: 1,
      handedOver: true,
    }),
    { status: 400, code: 'VALIDATION' }
  );

  // Beneficiary belonging to different warehouse
  await assert.rejects(
    () => api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, {
      warehouseId: 'hai-chau',
      itemId: 'item-1',
      beneficiaryId: 'ben-son-tra',
      quantity: 1,
      handedOver: true,
    }),
    { status: 400, code: 'VALIDATION' }
  );
});

