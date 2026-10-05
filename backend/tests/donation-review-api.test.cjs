const test = require('node:test');
const assert = require('node:assert/strict');
const { createDonationReviewApi } = require('../donation-review-api.cjs');

function setup() {
  const documents = new Map();
  const collection = (name) => ({
    doc(id) {
      const key = `${name}/${id}`;
      return {
        id,
        key,
        async get() {
          const val = documents.get(key);
          return { exists: val !== undefined, data: () => val };
        },
      };
    },
  });

  const db = {
    collection,
    async runTransaction(work) {
      const writes = [];
      const result = await work({
        get: async (ref) => {
          const val = documents.get(ref.key);
          return { exists: val !== undefined, data: () => val };
        },
        update: (ref, data) => {
          const current = documents.get(ref.key) || {};
          writes.push([ref.key, { ...current, ...data }]);
        },
      });
      for (const [k, d] of writes) documents.set(k, d);
      return result;
    },
  };

  const verifyToken = async (token) => {
    if (token === 'admin-token') return { uid: 'admin-1' };
    if (token === 'wh-a-token') return { uid: 'worker-a' };
    if (token === 'wh-b-token') return { uid: 'worker-b' };
    if (token === 'donor-token') return { uid: 'donor-1' };
    throw new Error('Invalid token');
  };

  const api = createDonationReviewApi({
    db,
    verifyToken,
    serverTimestamp: () => 'SERVER_TIMESTAMP',
  });

  // Setup staff
  documents.set('staff_assignments/admin-1', { role: 'system_admin', active: true, warehouseIds: [] });
  documents.set('staff_assignments/worker-a', { role: 'warehouse_admin', active: true, warehouseIds: ['kho-a'] });
  documents.set('staff_assignments/worker-b', { role: 'warehouse_admin', active: true, warehouseIds: ['kho-b'] });

  // Setup donations
  documents.set('donations/don-1', {
    id: 'don-1',
    donorId: 'donor-1',
    hubId: 'kho-a',
    title: 'Áo khoác ấm',
    status: 'pending',
    version: 1,
  });

  documents.set('donations/don-2', {
    id: 'don-2',
    donorId: 'donor-1',
    hubId: 'kho-b',
    title: 'Sách vở',
    status: 'pending',
    version: 1,
  });

  return { api, documents };
}

test('US10: Authorized Warehouse Admin can approve pending donation in their warehouse without modifying inventory', async () => {
  const { api, documents } = setup();

  const inventoryBefore = [...documents.keys()].filter((k) => k.startsWith('inventory'));
  assert.equal(inventoryBefore.length, 0);

  const res = await api.handle(
    'POST',
    '/v1/admin/donations/don-1/decide',
    { authorization: 'Bearer wh-a-token' },
    { action: 'approve' }
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'success');
  assert.equal(res.body.donation.status, 'approved');
  assert.equal(res.body.donation.reviewedBy, 'worker-a');

  // Verify stored document
  const stored = documents.get('donations/don-1');
  assert.equal(stored.status, 'approved');
  assert.equal(stored.version, 2);

  // AC5: Inventory is unchanged
  const inventoryAfter = [...documents.keys()].filter((k) => k.startsWith('inventory'));
  assert.equal(inventoryAfter.length, 0);
});

test('US10: Rejection requires publicMessage and rejects empty reason', async () => {
  const { api, documents } = setup();

  // Empty public reason -> 400
  await assert.rejects(
    api.handle(
      'POST',
      '/v1/admin/donations/don-1/decide',
      { authorization: 'Bearer wh-a-token' },
      { action: 'reject', publicMessage: '' }
    ),
    (err) => err.status === 400
  );

  // Valid rejection with publicMessage and optional internalNote
  const res = await api.handle(
    'POST',
    '/v1/admin/donations/don-1/decide',
    { authorization: 'Bearer wh-a-token' },
    { action: 'reject', publicMessage: 'Vật phẩm đã sờn rách, không đạt tiêu chuẩn tiếp nhận.', internalNote: 'Đã gọi điện giải thích cho donor.' }
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.donation.status, 'rejected');
  assert.equal(res.body.donation.statusNote, 'Vật phẩm đã sờn rách, không đạt tiêu chuẩn tiếp nhận.');
  assert.equal(res.body.donation.internalNote, 'Đã gọi điện giải thích cho donor.');
});

test('US10: Staff from wrong warehouse or unauthorized role is rejected with 403', async () => {
  const { api } = setup();

  // Worker B cố tình thẩm định đơn ở Kho A -> 403
  await assert.rejects(
    api.handle(
      'POST',
      '/v1/admin/donations/don-1/decide',
      { authorization: 'Bearer wh-b-token' },
      { action: 'approve' }
    ),
    (err) => err.status === 403
  );

  // Donor thường cố tình gọi API thẩm định -> 403
  await assert.rejects(
    api.handle(
      'POST',
      '/v1/admin/donations/don-1/decide',
      { authorization: 'Bearer donor-token' },
      { action: 'approve' }
    ),
    (err) => err.status === 403
  );

  // Không có auth token -> 401
  await assert.rejects(
    api.handle(
      'POST',
      '/v1/admin/donations/don-1/decide',
      {},
      { action: 'approve' }
    ),
    (err) => err.status === 401
  );
});

test('US10: Concurrent conflicting decision on already decided donation returns 409 Conflict', async () => {
  const { api } = setup();

  // Nhân sự 1 duyệt đơn trước -> Thành công
  const res1 = await api.handle(
    'POST',
    '/v1/admin/donations/don-1/decide',
    { authorization: 'Bearer wh-a-token' },
    { action: 'approve', expectedVersion: 1 }
  );
  assert.equal(res1.status, 200);

  // Nhân sự 2 cùng lúc bấm duyệt hoặc từ chối đơn đó -> Bị xung đột 409
  await assert.rejects(
    api.handle(
      'POST',
      '/v1/admin/donations/don-1/decide',
      { authorization: 'Bearer wh-a-token' },
      { action: 'reject', publicMessage: 'Từ chối muộn', expectedVersion: 1 }
    ),
    (err) => err.status === 409
  );
});
