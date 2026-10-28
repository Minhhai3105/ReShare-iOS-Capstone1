const test = require('node:test');
const assert = require('node:assert/strict');
const { createReportsApi } = require('../reports-api.cjs');

function setup() {
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
  });

  return { api, documents };
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

