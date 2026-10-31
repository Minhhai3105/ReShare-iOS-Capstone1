const test = require('node:test');
const assert = require('node:assert/strict');
const { createDistributionApi } = require('../distribution-api.cjs');
const { createQuery } = require('./fake-query.cjs');

function setup({ maxDocs } = {}) {
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

  const reads = [];
  const db = {
    collection(name) {
      return {
        ...createQuery(name, documents, snapshot, reads),
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
    ...(maxDocs ? { maxDocs } : {}),
  });

  return { api, documents, reads };
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

// server.cjs truyền pathname ở tham số 2 và URL đầy đủ ở tham số 5. Nếu module bỏ qua
// tham số 5 thì query bị mất ÂM THẦM: filter kho không áp dụng và endpoint trả về mọi
// kho mà nhân sự được phép, không có lỗi nào bật ra.
test('RC1D-83: query đọc từ tham số thứ 5 giống cách server.cjs gọi', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle('GET', '/v1/admin/distribution/options', { authorization: 'Bearer hc-token' },
      null, '/v1/admin/distribution/options?warehouseId=son-tra'),
    { status: 403 }
  );
  const scoped = await api.handle('GET', '/v1/admin/distribution/options',
    { authorization: 'Bearer hc-token' }, null, '/v1/admin/distribution/options?warehouseId=hai-chau');
  assert.deepEqual([...new Set(scoped.body.inventory.map(i => i.warehouseId))], ['hai-chau']);
  assert.deepEqual(scoped.body.warehouses.map(w => w.id), ['hai-chau']);
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
    idempotencyKey: 'req-partial-001',
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
    idempotencyKey: 'req-us13-001',
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
    idempotencyKey: 'req-shortage-first',
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
      idempotencyKey: 'req-shortage-second',
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
      idempotencyKey: 'req-stale-version',
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
      expectedVersion: 1,
      idempotencyKey: 'req-ben-pending',
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
      expectedVersion: 1,
      idempotencyKey: 'req-ben-cross-warehouse',
    }),
    { status: 400, code: 'VALIDATION' }
  );
});

test('RC1D-83: retry after a lost response returns the same voucher without deducting stock again', async () => {
  const { api, documents } = setup();
  const draft = {
    warehouseId: 'hai-chau', itemId: 'item-1', beneficiaryId: 'ben-1',
    quantity: 1, handedOver: true, expectedVersion: 1, idempotencyKey: 'req-retry-same-handover',
  };
  const first = await api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, draft);
  const replay = await api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, draft);
  assert.equal(first.status, 201);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotentReplay, true);
  assert.equal(replay.body.voucher.id, first.body.voucher.id);
  assert.equal(documents.get('inventory/item-1').quantityAvailable ?? documents.get('inventory/item-1').available, 2);
  assert.equal([...documents.keys()].filter(key => key.startsWith('distribution_vouchers/')).length, 1);
  assert.equal([...documents.keys()].filter(key => key.startsWith('inventory_movements/')).length, 1);

  await assert.rejects(
    () => api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, { ...draft, quantity: 2, expectedVersion: 2 }),
    { status: 409, code: 'IDEMPOTENCY_CONFLICT' }
  );
  await assert.rejects(
    () => api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, { ...draft, expectedVersion: 2 }),
    { status: 409, code: 'IDEMPOTENCY_CONFLICT' }
  );
});

test('RC1D-83: an inactive warehouse cannot distribute even with an old assignment', async () => {
  const { api, documents } = setup();
  documents.set('warehouses/hai-chau', { name: 'Kho Hải Châu', status: 'inactive' });
  await assert.rejects(
    () => api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, {
      warehouseId: 'hai-chau', itemId: 'item-1', beneficiaryId: 'ben-1',
      quantity: 1, handedOver: true, expectedVersion: 1, idempotencyKey: 'req-inactive-warehouse',
    }),
    { status: 409, code: 'WAREHOUSE_INACTIVE' }
  );
  assert.equal(documents.get('inventory/item-1').available, 3);
});

test('RC1D-83: a new distribution requires a version and stable request key', async () => {
  const { api } = setup();
  const draft = {
    warehouseId: 'hai-chau', itemId: 'item-1', beneficiaryId: 'ben-1', quantity: 1, handedOver: true,
  };
  await assert.rejects(() => api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, draft),
    { status: 400, code: 'VALIDATION' });
  await assert.rejects(() => api.handle('POST', '/v1/admin/distribution', { authorization: 'Bearer hc-token' }, { ...draft, expectedVersion: 1 }),
    { status: 400, code: 'VALIDATION' });
});


test('Giới hạn truy vấn: options chỉ đọc mục còn tồn và hồ sơ đã duyệt, không quét cả collection', async () => {
  const { api, documents, reads } = setup();
  for (let i = 0; i < 30; i += 1) {
    documents.set(`inventory/empty-${i}`, { itemName: 'Đã xuất hết', warehouseId: 'hai-chau', quantityAvailable: 0, unitId: 'chiếc', version: 3 });
    documents.set(`beneficiaries/unverified-${i}`, { name: 'Chưa duyệt', warehouseId: 'hai-chau', status: 'unverified' });
  }
  documents.set('beneficiaries/ben-approved-new', { name: 'Đã duyệt theo schema mới', warehouseId: 'hai-chau', status: 'approved' });

  const res = await api.handle('GET', '/v1/admin/distribution/options', { authorization: 'Bearer hc-token' });

  assert.deepEqual(reads.filter(read => read.kind === 'scan').map(read => read.collection), ['warehouses']);
  const count = collection => reads.filter(read => read.collection === collection).reduce((sum, read) => sum + read.count, 0);
  assert.equal(count('inventory'), 3, 'chỉ 3 mục còn tồn (gồm 2 mục dữ liệu cũ dùng field available)');
  assert.ok(count('beneficiaries') <= 3, 'không đọc hồ sơ chưa duyệt');
  assert.deepEqual(res.body.inventory.map(item => item.id), ['item-1', 'item-us13']);
  assert.deepEqual(res.body.beneficiaries.map(entry => entry.id), ['ben-1', 'ben-approved-new']);
});

test('Giới hạn truy vấn: options vượt trần thì từ chối rõ ràng, không cắt bớt âm thầm', async () => {
  const { api } = setup({ maxDocs: 2 });
  await assert.rejects(
    () => api.handle('GET', '/v1/admin/distribution/options', { authorization: 'Bearer hc-token' }),
    { status: 422, code: 'VALIDATION' });
});
