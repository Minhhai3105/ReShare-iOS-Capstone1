const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { createReportsApi } = require('../reports-api.cjs');
const { createDistributionApi } = require('../distribution-api.cjs');

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

// Fake db trong unit test không chứng minh được ngữ nghĩa Firestore thật: so sánh Date trong
// truy vấn với Timestamp đã lưu, getAll, và truy vấn bất đẳng thức một field. Test này chạy đúng
// các truy vấn đó trên Emulator. Dùng năm 2019 để không đụng dữ liệu các test khác (ghi theo giờ hiện tại).
test('báo cáo và form xuất kho đọc có giới hạn trên Firestore thật', { skip }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const app = initializeApp({ projectId: 'demo-reshare' }, `bounded-${suffix}`);
  const db = getFirestore(app);
  const id = name => `${name}-${suffix}`;
  const warehouseId = id('kho');
  const at = iso => Timestamp.fromDate(new Date(iso));
  const paths = [];
  const seed = async (path, data) => { paths.push(path); await db.doc(path).set(data); };
  try {
    await seed(`warehouses/${warehouseId}`, { name: 'Kho giới hạn', status: 'active' });
    await seed(`staff_assignments/${id('admin')}`, { active: true, role: 'system_admin', warehouseIds: [] });
    await seed(`donations/${id('don-in')}`, { title: 'Áo', warehouseId, category: 'clothing', quantity: 1, createdAt: at('2019-03-10T02:00:00Z') });
    await seed(`donations/${id('don-first')}`, { title: 'Biên đầu', warehouseId, category: 'clothing', quantity: 1, createdAt: at('2019-02-28T17:00:00Z') });
    await seed(`donations/${id('don-before')}`, { title: 'Trước kỳ', warehouseId, category: 'clothing', quantity: 1, createdAt: at('2019-02-28T16:59:59Z') });
    await seed(`donations/${id('don-old')}`, { title: 'Từ điển', warehouseId, category: 'books', unitId: 'bộ', createdAt: at('2019-01-05T02:00:00Z') });
    await seed(`receipts/${id('rcp-old')}`, { donationId: id('don-old'), warehouseId, quantity: 2, unitId: 'bộ', createdAt: at('2019-03-12T02:00:00Z') });
    await seed(`inventory/${id('inv-stock')}`, { itemName: 'Chăn', warehouseId, category: 'blankets', quantityAvailable: 2, unitId: 'chiếc', version: 1 });
    await seed(`inventory/${id('inv-legacy')}`, { name: 'Nồi', warehouseId, categoryId: 'household', available: 3, unit: 'chiếc', version: 1 });
    await seed(`inventory/${id('inv-empty')}`, { itemName: 'Ghế', warehouseId, category: 'household', quantityAvailable: 0, unitId: 'chiếc', version: 2 });
    await seed(`inventory_movements/${id('mov-empty')}`, {
      type: 'distribution', inventoryItemId: id('inv-empty'), warehouseId, quantity: -1, createdAt: at('2019-03-15T02:00:00Z'),
    });
    await seed(`beneficiaries/${id('ben-new')}`, { name: 'Mới', warehouseId, status: 'approved' });
    await seed(`beneficiaries/${id('ben-legacy')}`, { name: 'Cũ', warehouseId, approved: true });
    await seed(`beneficiaries/${id('ben-unverified')}`, { name: 'Chưa duyệt', warehouseId, status: 'unverified' });

    const deps = { db, verifyToken: async () => ({ uid: id('admin'), email: 'admin@reshare.test' }) };
    const auth = { authorization: 'Bearer token' };

    const report = await createReportsApi(deps).handle('GET', '/v1/admin/reports', auth, null,
      `/v1/admin/reports?from=2019-03-01&to=2019-03-31&warehouseId=${warehouseId}`);
    const sources = new Map(report.body.sources.map(row => [row.id, row]));
    assert.ok(sources.has(id('don-in')) && sources.has(id('don-first')), 'Timestamp trong kỳ, kể cả 00:00 ngày đầu giờ VN');
    assert.ok(!sources.has(id('don-before')) && !sources.has(id('don-old')), 'Timestamp ngoài kỳ không thành dòng');
    assert.equal(sources.get(id('rcp-old'))?.categoryId, 'books', 'getAll lấy đúng danh mục từ đơn tạo trước kỳ');
    assert.equal(sources.get(id('mov-empty'))?.item, 'Ghế', 'getAll lấy đúng tên mục tồn đã xuất hết');
    const stock = report.body.inventory.map(item => item.id);
    assert.ok(stock.includes(id('inv-stock')) && stock.includes(id('inv-legacy')));
    assert.ok(!stock.includes(id('inv-empty')));

    const options = await createDistributionApi(deps).handle('GET', '/v1/admin/distribution/options', auth, null,
      `/v1/admin/distribution/options?warehouseId=${warehouseId}`);
    assert.deepEqual(options.body.inventory.map(item => item.id), [id('inv-legacy'), id('inv-stock')]);
    assert.deepEqual(options.body.beneficiaries.map(entry => entry.id).sort(), [id('ben-legacy'), id('ben-new')].sort());
  } finally {
    const cleanup = await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
    assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Emulator cleanup must succeed');
  }
});
