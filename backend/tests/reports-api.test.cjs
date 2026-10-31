const test = require('node:test');
const assert = require('node:assert/strict');
const { createReportsApi } = require('../reports-api.cjs');
const { createQuery, getAll } = require('./fake-query.cjs');

function setup({ maxDocs } = {}) {
  const documents = new Map([
    ['staff_assignments/admin', { uid: 'admin', email: 'admin@reshare.vn', role: 'system_admin', active: true, warehouseIds: [] }],
    ['staff_assignments/worker-hai-chau', { uid: 'worker-hai-chau', email: 'hc@reshare.vn', role: 'warehouse_admin', active: true, warehouseIds: ['hai-chau'] }],
    ['staff_assignments/worker-son-tra', { uid: 'worker-son-tra', email: 'st@reshare.vn', role: 'warehouse_admin', active: true, warehouseIds: ['son-tra'] }],
    ['warehouses/hai-chau', { name: 'Kho Hải Châu', status: 'active' }],
    ['warehouses/son-tra', { name: 'Kho Sơn Trà', status: 'active' }],
    ['categories/clothing', { name: 'Quần áo' }],
    ['categories/blankets', { name: 'Chăn ấm' }],
    ['categories/books', { name: 'Sách vở' }],
    // Donations
    ['donations/don-1', {
      title: 'Áo khoác',
      donorName: 'Nguyễn Văn Secret Donor',
      donorPhone: '0901234567',
      donorEmail: 'secret@gmail.com',
      warehouseId: 'hai-chau',
      category: 'clothing',
      quantity: 10,
      unit: 'chiếc',
      status: 'approved',
      createdAt: new Date('2025-05-01T02:00:00Z'),
    }],
    ['donations/don-books', {
      title: 'Bộ SGK lớp 12',
      donorName: 'Phạm Thị Sách',
      warehouseId: 'hai-chau',
      category: 'books',
      declaredQuantity: 7,
      unitId: 'bộ',
      status: 'approved',
      createdAt: new Date('2025-05-02T02:00:00Z'),
    }],
    ['donations/don-2', {
      title: 'Chăn ấm',
      donorName: 'Lê Văn Private',
      warehouseId: 'son-tra',
      categoryId: 'blankets',
      quantity: 3,
      unit: 'chiếc',
      status: 'approved',
      createdAt: new Date('2025-05-05T03:00:00Z'),
    }],
    // Receipts
    ['receipts/rcp-1', {
      donationId: 'don-1',
      warehouseId: 'hai-chau',
      categoryId: 'clothing',
      itemName: 'Áo khoác',
      quantity: 10,
      unitId: 'chiếc',
      createdAt: new Date('2025-05-03T02:00:00Z'),
    }],
    // Inventory movements (intake and distribution)
    ['inventory_movements/mov-1', {
      id: 'mov-1',
      voucherId: 'rcp-1',
      warehouseId: 'hai-chau',
      categoryId: 'clothing',
      itemName: 'Áo khoác',
      type: 'intake',
      quantity: 10,
      unit: 'chiếc',
      createdAt: new Date('2025-05-03T03:00:00Z'),
    }],
    ['inventory_movements/mov-2', {
      id: 'mov-2',
      voucherId: 'px-1',
      warehouseId: 'hai-chau',
      categoryId: 'clothing',
      itemName: 'Áo khoác',
      type: 'distribution',
      quantity: -2,
      unit: 'chiếc',
      createdAt: new Date('2025-05-10T03:00:00Z'),
    }],
    // Inventory snapshot
    ['inventory/item-1', {
      warehouseId: 'hai-chau',
      category: 'clothing',
      itemName: 'Áo khoác',
      quantityAvailable: 8,
      unitId: 'chiếc',
    }],
    ['inventory/item-books', {
      warehouseId: 'hai-chau',
      category: 'books',
      itemName: 'Bộ SGK lớp 12',
      quantityAvailable: 7,
      unitId: 'bộ',
    }],
    ['inventory/item-2', {
      warehouseId: 'son-tra',
      category: 'blankets',
      itemName: 'Chăn ấm',
      quantityAvailable: 3,
      unitId: 'chiếc',
    }],
  ]);

  const snapshot = (id, data) => ({
    id,
    exists: data !== undefined,
    data: () => (data ? { ...data } : undefined),
  });

  const reads = [];
  const db = {
    getAll: getAll(reads),
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
  };

  const verifyToken = async (token) => {
    if (token === 'admin-token') return { uid: 'admin', email: 'admin@reshare.vn' };
    if (token === 'hc-token') return { uid: 'worker-hai-chau', email: 'hc@reshare.vn' };
    if (token === 'st-token') return { uid: 'worker-son-tra', email: 'st@reshare.vn' };
    throw new Error('Invalid token');
  };

  const api = createReportsApi({
    db,
    verifyToken,
    ...(maxDocs ? { maxDocs } : {}),
  });

  return { api, documents, reads };
}

test('RC1D-95: unauthenticated request returns 401', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle('GET', '/v1/admin/reports?from=2025-05-01&to=2025-05-31', {}),
    { status: 401 }
  );
});

test('RC1D-95: warehouse admin cannot query warehouse outside assignment', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle('GET', '/v1/admin/reports?from=2025-05-01&to=2025-05-31&warehouseId=son-tra', { authorization: 'Bearer hc-token' }),
    { status: 403 }
  );
});

test('RC1D-95: invalid date filters are rejected with 400', async () => {
  const { api } = setup();
  // from > to
  await assert.rejects(
    () => api.handle('GET', '/v1/admin/reports?from=2025-06-01&to=2025-05-01', { authorization: 'Bearer admin-token' }),
    { status: 400 }
  );
  // malformed date
  await assert.rejects(
    () => api.handle('GET', '/v1/admin/reports?from=not-a-date&to=2025-05-01', { authorization: 'Bearer admin-token' }),
    { status: 400 }
  );
  await assert.rejects(
    () => api.handle('GET', '/v1/admin/reports?from=2025-02-30&to=2025-05-01', { authorization: 'Bearer admin-token' }),
    { status: 400 }
  );
});

test('RC1D-95: System Admin sees unassigned donations but warehouse staff and warehouse filters do not', async () => {
  const { api, documents } = setup();
  documents.set('donations/don-unassigned', {
    title: 'Áo chưa phân kho', category: 'clothing', quantity: 1,
    status: 'pending', createdAt: new Date('2025-05-04T02:00:00Z'),
  });
  const path = '/v1/admin/reports?from=2025-05-01&to=2025-05-31';
  const admin = await api.handle('GET', path, { authorization: 'Bearer admin-token' });
  assert.ok(admin.body.sources.some(row => row.id === 'don-unassigned' && row.type === 'donation' && row.warehouseId === ''));
  const staff = await api.handle('GET', path, { authorization: 'Bearer hc-token' });
  assert.ok(!staff.body.sources.some(row => row.id === 'don-unassigned'));
  const filtered = await api.handle('GET', `${path}&warehouseId=hai-chau`, { authorization: 'Bearer admin-token' });
  assert.ok(!filtered.body.sources.some(row => row.id === 'don-unassigned'));
});

test('RC1D-95: system admin sees all warehouses; warehouse admin sees only assigned warehouse', async () => {
  const { api } = setup();
  const adminRes = await api.handle('GET', '/v1/admin/reports?from=2025-05-01&to=2025-05-31', { authorization: 'Bearer admin-token' });
  assert.equal(adminRes.status, 200);
  assert.equal(adminRes.body.warehouses.length, 2);
  assert.equal(adminRes.body.inventory.length, 3);

  const hcRes = await api.handle('GET', '/v1/admin/reports?from=2025-05-01&to=2025-05-31', { authorization: 'Bearer hc-token' });
  assert.equal(hcRes.status, 200);
  assert.equal(hcRes.body.warehouses.length, 1);
  assert.equal(hcRes.body.warehouses[0].id, 'hai-chau');
  assert.equal(hcRes.body.inventory.length, 2);
  assert.ok(hcRes.body.inventory.every(i => i.warehouseId === 'hai-chau'));
  assert.ok(hcRes.body.sources.every((s) => s.warehouseId === 'hai-chau'));
});

test('RC1D-95: category filtering correctly isolates real schema items (e.g. books) without defaulting to clothing', async () => {
  const { api } = setup();
  const res = await api.handle('GET', '/v1/admin/reports?from=2025-05-01&to=2025-05-31&categoryId=books', { authorization: 'Bearer admin-token' });
  assert.equal(res.status, 200);
  assert.equal(res.body.sources.length, 1);
  const bookSource = res.body.sources[0];
  assert.equal(bookSource.id, 'don-books');
  assert.equal(bookSource.categoryId, 'books');
  assert.equal(bookSource.quantity, 7);
  assert.equal(bookSource.unit, 'bộ');

  assert.equal(res.body.inventory.length, 1);
  const bookStock = res.body.inventory[0];
  assert.equal(bookStock.id, 'item-books');
  assert.equal(bookStock.categoryId, 'books');
  assert.equal(bookStock.available, 7);
  assert.equal(bookStock.unit, 'bộ');
});

test('RC1D-95: query đọc từ tham số thứ 5 giống cách server.cjs gọi', async () => {
  const { api } = setup();
  await assert.rejects(
    () => api.handle('GET', '/v1/admin/reports', { authorization: 'Bearer hc-token' },
      null, '/v1/admin/reports?from=2026-13-40&to=2026-12-31'),
    { status: 400 }
  );
});

test('RC1D-95: strict PII removal protects donor and beneficiary data', async () => {
  const { api } = setup();
  const res = await api.handle('GET', '/v1/admin/reports?from=2025-05-01&to=2025-05-31', { authorization: 'Bearer admin-token' });
  assert.equal(res.status, 200);
  for (const source of res.body.sources) {
    assert.equal(source.donorName, undefined);
    assert.equal(source.donorPhone, undefined);
    assert.equal(source.donorEmail, undefined);
    assert.equal(source.beneficiaryName, undefined);
    assert.equal(source.beneficiaryPhone, undefined);
    assert.equal(source.address, undefined);
    const keys = Object.keys(source);
    assert.ok(keys.every(k => ['id', 'type', 'timestamp', 'warehouseId', 'categoryId', 'item', 'quantity', 'unit', 'reference', 'status'].includes(k)));
  }
});


const MAY = '/v1/admin/reports?from=2025-05-01&to=2025-05-31';
const ADMIN = { authorization: 'Bearer admin-token' };

test('Giới hạn truy vấn: không quét cả lịch sử, chỉ đọc bản ghi trong kỳ và tồn còn hàng', async () => {
  const { api, documents, reads } = setup();
  for (let i = 0; i < 40; i += 1) {
    documents.set(`donations/old-${i}`, { title: 'Cũ', warehouseId: 'hai-chau', category: 'clothing', quantity: 1, createdAt: new Date('2024-03-01T02:00:00Z') });
    documents.set(`receipts/old-${i}`, { warehouseId: 'hai-chau', quantity: 1, createdAt: new Date('2024-03-02T02:00:00Z') });
    documents.set(`inventory/empty-${i}`, { warehouseId: 'hai-chau', category: 'clothing', itemName: 'Đã xuất hết', quantityAvailable: 0 });
  }
  documents.set('inventory/legacy-available', { warehouseId: 'son-tra', category: 'blankets', itemName: 'Chăn cũ', available: 4 });

  const res = await api.handle('GET', MAY, ADMIN);

  const scanned = reads.filter(read => read.kind === 'scan').map(read => read.collection);
  assert.deepEqual(scanned.sort(), ['categories', 'warehouses'], 'chỉ bảng danh mục nhỏ mới được đọc toàn bộ');
  const count = (collection, kind) => reads.filter(read => read.collection === collection && read.kind === kind)
    .reduce((sum, read) => sum + read.count, 0);
  assert.equal(count('donations', 'query'), 3, 'chỉ 3 đơn trong tháng 5');
  assert.equal(count('receipts', 'query'), 1);
  assert.equal(count('inventory', 'query'), 4, '3 mục còn hàng + 1 mục dữ liệu cũ dùng field available');
  assert.ok(!res.body.inventory.some(item => item.id.startsWith('empty-')));
  assert.equal(res.body.inventory.find(item => item.id === 'legacy-available')?.available, 4);
});

test('Giới hạn truy vấn: phiếu nhận trong kỳ trỏ tới đơn tạo trước kỳ vẫn lấy đúng danh mục, nhưng đơn đó không thành dòng', async () => {
  const { api, documents, reads } = setup();
  documents.set('donations/don-old', { title: 'Từ điển', warehouseId: 'hai-chau', category: 'books', unitId: 'bộ', createdAt: new Date('2025-04-20T02:00:00Z') });
  documents.set('receipts/rcp_don-old', { donationId: 'don-old', warehouseId: 'hai-chau', quantity: 2, unitId: 'bộ', createdAt: new Date('2025-05-06T02:00:00Z') });

  const res = await api.handle('GET', MAY, ADMIN);

  const receipt = res.body.sources.find(row => row.id === 'rcp_don-old');
  assert.equal(receipt.categoryId, 'books');
  assert.equal(receipt.item, 'Từ điển');
  assert.ok(!res.body.sources.some(row => row.id === 'don-old'), 'đơn tạo trước kỳ không được tính vào kỳ');
  assert.ok(reads.some(read => read.collection === 'donations' && read.kind === 'lookup'), 'đọc riêng đúng đơn được tham chiếu');
});

test('Giới hạn truy vấn: movement trỏ tới mục tồn đã xuất hết vẫn lấy đúng tên và danh mục', async () => {
  const { api, documents } = setup();
  documents.set('inventory/inv-empty', { warehouseId: 'hai-chau', category: 'household', itemName: 'Nồi cơm', quantityAvailable: 0, unitId: 'chiếc' });
  documents.set('inventory_movements/mov-empty', {
    type: 'distribution', inventoryItemId: 'inv-empty', warehouseId: 'hai-chau', quantity: -1,
    createdAt: new Date('2025-05-12T02:00:00Z'),
  });

  const res = await api.handle('GET', MAY, ADMIN);

  const movement = res.body.sources.find(row => row.id === 'mov-empty');
  assert.equal(movement.item, 'Nồi cơm');
  assert.equal(movement.categoryId, 'household');
  assert.ok(!res.body.inventory.some(item => item.id === 'inv-empty'), 'mục đã hết không nằm trong snapshot tồn');
});

test('Giới hạn truy vấn: biên ngày tính theo giờ Việt Nam', async () => {
  const { api, documents } = setup();
  const at = iso => ({ title: 'Biên', warehouseId: 'hai-chau', category: 'clothing', quantity: 1, createdAt: new Date(iso) });
  documents.set('donations/edge-before', at('2025-04-30T16:59:59Z'));
  documents.set('donations/edge-first', at('2025-04-30T17:00:00Z'));
  documents.set('donations/edge-last', at('2025-05-31T16:59:59Z'));
  documents.set('donations/edge-after', at('2025-05-31T17:00:00Z'));

  const ids = (await api.handle('GET', MAY, ADMIN)).body.sources.map(row => row.id);

  assert.ok(ids.includes('edge-first') && ids.includes('edge-last'));
  assert.ok(!ids.includes('edge-before') && !ids.includes('edge-after'));
});

test('Giới hạn truy vấn: vượt trần thì từ chối rõ ràng, không cắt bớt âm thầm', async () => {
  const { api, documents } = setup({ maxDocs: 3 });
  assert.equal((await api.handle('GET', MAY, ADMIN)).status, 200, 'đúng bằng trần vẫn trả đủ');
  documents.set('donations/don-extra', { title: 'Thêm', warehouseId: 'hai-chau', category: 'clothing', quantity: 1, createdAt: new Date('2025-05-20T02:00:00Z') });
  await assert.rejects(() => api.handle('GET', MAY, ADMIN), { status: 422, code: 'VALIDATION' });
});
