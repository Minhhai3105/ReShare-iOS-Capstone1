const test = require('node:test');
const assert = require('node:assert/strict');
const { createDonationReviewApi } = require('../donation-review-api.cjs');

function setup({ auth } = {}) {
  const documents = new Map();
  const collection = (name) => ({
    orderBy(field, direction) {
      return {
        limit(count) {
          return {
            async get() {
              const docs = [...documents.entries()]
                .filter(([key, value]) => key.startsWith(`${name}/`) && value[field] != null)
                .sort((a, b) => (direction === 'desc' ? -1 : 1) *
                  (new Date(a[1][field]).getTime() - new Date(b[1][field]).getTime()))
                .slice(0, count)
                .map(([key, value]) => ({ id: key.slice(name.length + 1), data: () => value }));
              return { docs };
            },
          };
        },
      };
    },
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
        set: (ref, data) => {
          writes.push([ref.key, data]);
        },
      });
      for (const [k, d] of writes) documents.set(k, d);
      return result;
    },
  };

  const verifyToken = async (token) => {
    if (token === 'admin-token') return { uid: 'admin-1' };
    if (token === 'admin-inactive-token') return { uid: 'admin-inactive' };
    if (token === 'wh-a-token') return { uid: 'worker-a' };
    if (token === 'wh-b-token') return { uid: 'worker-b' };
    if (token === 'donor-token') return { uid: 'donor-1' };
    throw new Error('Invalid token');
  };

  const api = createDonationReviewApi({
    db,
    ...(auth ? { auth } : {}),
    verifyToken,
    serverTimestamp: () => 'SERVER_TIMESTAMP',
  });

  // Setup staff
  documents.set('staff_assignments/admin-1', { role: 'system_admin', active: true, warehouseIds: [] });
  documents.set('staff_assignments/admin-inactive', { role: 'system_admin', active: false, warehouseIds: [] });
  documents.set('staff_assignments/worker-a', { role: 'warehouse_admin', active: true, warehouseIds: ['kho-a'] });
  documents.set('staff_assignments/worker-b', { role: 'warehouse_admin', active: true, warehouseIds: ['kho-b'] });

  // Setup warehouses
  documents.set('warehouses/kho-a', { name: 'Kho A', status: 'active' });
  documents.set('warehouses/kho-b', { name: 'Kho B', status: 'active' });
  documents.set('warehouses/kho-inactive', { name: 'Kho Inactive', status: 'inactive' });

  // Setup donations
  documents.set('donations/don-1', {
    id: 'don-1',
    donorId: 'donor-1',
    hubId: 'kho-b',
    warehouseId: 'kho-a',
    title: 'Áo khoác ấm',
    status: 'pending',
    version: 1,
  });

  documents.set('donations/don-2', {
    id: 'don-2',
    donorId: 'donor-1',
    hubId: 'kho-a',
    warehouseId: 'kho-b',
    title: 'Sách vở',
    status: 'pending',
    version: 1,
  });

  documents.set('donations/don-unassigned', {
    id: 'don-unassigned',
    donorId: 'donor-1',
    hubId: 'kho-illustrative',
    title: 'Đồ chơi trẻ em',
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
  assert.equal(Object.hasOwn(stored, 'internalNote'), false);
  assert.equal(Object.hasOwn(stored, 'reviewedBy'), false);
  assert.equal(documents.get('donation_reviews/don-1').reviewedBy, 'worker-a');

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
  assert.equal(Object.hasOwn(documents.get('donations/don-1'), 'internalNote'), false);
  assert.equal(documents.get('donation_reviews/don-1').internalNote, 'Đã gọi điện giải thích cho donor.');
});

test('US10: malformed message types are rejected before writing a review', async () => {
  const { api, documents } = setup();
  for (const body of [
    { action: 'reject', publicMessage: { text: 'wrong type' } },
    { action: 'approve', internalNote: ['wrong type'] },
  ]) {
    await assert.rejects(
      api.handle('POST', '/v1/admin/donations/don-1/decide', { authorization: 'Bearer wh-a-token' }, body),
      (error) => error.status === 400,
    );
  }
  assert.equal(documents.get('donations/don-1').status, 'pending');
  assert.equal(documents.has('donation_reviews/don-1'), false);
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

test('US10: illustrative hub cannot authorize an unassigned donation', async () => {
  const { api, documents } = setup();
  const donation = documents.get('donations/don-1');
  delete donation.warehouseId;
  await assert.rejects(
    api.handle('GET', '/v1/admin/donations/don-1', { authorization: 'Bearer wh-b-token' }),
    { status: 403 },
  );
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-1/decide', { authorization: 'Bearer wh-b-token' }, { action: 'approve' }),
    { status: 403 },
  );
  assert.equal((await api.handle('GET', '/v1/admin/donations/don-1', { authorization: 'Bearer admin-token' })).status, 200);
});

test('US10: awaiting donor information blocks further decisions until a separate update', async () => {
  const { api } = setup();
  const headers = { authorization: 'Bearer wh-a-token' };
  await api.handle('POST', '/v1/admin/donations/don-1/decide', headers,
    { action: 'information', publicMessage: 'Vui lòng bổ sung ảnh.' });
  await assert.rejects(api.handle('POST', '/v1/admin/donations/don-1/decide', headers,
    { action: 'approve', expectedVersion: 2 }), { status: 409 });
});

test('US07: staff confirmation preserves AI and donor choices and rejects wrong warehouse or stale edits', async () => {
  const { api, documents } = setup();
  Object.assign(documents.get('donations/don-1'), {
    aiPredictedCategory: 'books', aiConfidence: 0.82,
    aiModelVersion: 'ReShare_v8_baseline_01', donorConfirmedCategory: 'clothing', category: 'clothing',
  });
  const path = '/v1/admin/donations/don-1/confirm-category';
  const body = { category: 'clothing', expectedVersion: 0 };
  await assert.rejects(api.handle('POST', path, { authorization: 'Bearer wh-b-token' }, body), { status: 403 });
  await assert.rejects(api.handle('POST', path, { authorization: 'Bearer donor-token' }, body), { status: 403 });
  await assert.rejects(api.handle('POST', path, { authorization: 'Bearer wh-a-token' },
    { category: 'other', expectedVersion: 0 }), { status: 400 });

  const saved = await api.handle('POST', path, { authorization: 'Bearer wh-a-token' }, body);
  assert.equal(saved.body.donation.staffConfirmedCategory, 'clothing');
  assert.equal(saved.body.donation.staffConfirmedBy, 'worker-a');
  assert.equal(saved.body.donation.staffConfirmationVersion, 1);
  assert.equal(documents.get('donations/don-1').aiPredictedCategory, 'books');
  assert.equal(documents.get('donations/don-1').donorConfirmedCategory, 'clothing');
  assert.equal(Object.hasOwn(documents.get('donations/don-1'), 'staffConfirmedCategory'), false);
  await assert.rejects(api.handle('POST', path, { authorization: 'Bearer wh-a-token' }, body), { status: 409 });

  await api.handle('POST', '/v1/admin/donations/don-1/decide',
    { authorization: 'Bearer wh-a-token' }, { action: 'approve' });
  assert.equal(documents.get('donation_reviews/don-1').staffConfirmedCategory, 'clothing');
});

test('US07: agreement summary counts only real paired labels within staff warehouse', async () => {
  const { api, documents } = setup();
  Object.assign(documents.get('donations/don-1'), { aiPredictedCategory: 'books' });
  await api.handle('POST', '/v1/admin/donations/don-1/confirm-category',
    { authorization: 'Bearer wh-a-token' }, { category: 'books', expectedVersion: 0 });
  await api.handle('POST', '/v1/admin/donations/don-2/confirm-category',
    { authorization: 'Bearer wh-b-token' }, { category: 'clothing', expectedVersion: 0 });
  const a = await api.handle('GET', '/v1/admin/donations/ai-summary', { authorization: 'Bearer wh-a-token' });
  assert.equal(a.body.confirmedCount, 1);
  assert.equal(a.body.sampleCount, 1);
  assert.equal(a.body.matchingCount, 1);
  const b = await api.handle('GET', '/v1/admin/donations/ai-summary', { authorization: 'Bearer wh-b-token' });
  assert.equal(b.body.confirmedCount, 1);
  assert.equal(b.body.sampleCount, 0);
  const all = await api.handle('GET', '/v1/admin/donations/ai-summary', { authorization: 'Bearer admin-token' });
  assert.equal(all.body.confirmedCount, 2);
  assert.equal(all.body.sampleCount, 1);
});

test('Manual assignment: System Admin successfully assigns warehouse, increments version, and writes audit to donation_reviews', async () => {
  const { api, documents } = setup();
  const path = '/v1/admin/donations/don-unassigned/assign-warehouse';
  const headers = { authorization: 'Bearer admin-token' };

  const res = await api.handle('POST', path, headers, { warehouseId: 'kho-a', expectedVersion: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.body.donation.warehouseId, 'kho-a');
  assert.equal(res.body.donation.version, 2);
  assert.equal(res.body.donation.warehouseAssignedBy, 'admin-1');
  assert.equal(res.body.donation.warehouseAssignedAt, 'SERVER_TIMESTAMP');

  // Verify internal storage separation: donations doc has NO audit fields
  const donationDoc = documents.get('donations/don-unassigned');
  assert.equal(donationDoc.warehouseId, 'kho-a');
  assert.equal(donationDoc.version, 2);
  assert.equal(Object.hasOwn(donationDoc, 'warehouseAssignedBy'), false);
  assert.equal(Object.hasOwn(donationDoc, 'warehouseAssignedAt'), false);

  // Verify internal review record holds audit data
  const reviewDoc = documents.get('donation_reviews/don-unassigned');
  assert.equal(reviewDoc.warehouseId, 'kho-a');
  assert.equal(reviewDoc.warehouseAssignedBy, 'admin-1');
  assert.equal(reviewDoc.warehouseAssignedAt, 'SERVER_TIMESTAMP');
});

test('Manual assignment: rejects non-System Admin, inactive account, or unauthenticated callers', async () => {
  const { api } = setup();
  const path = '/v1/admin/donations/don-unassigned/assign-warehouse';
  const body = { warehouseId: 'kho-a', expectedVersion: 1 };

  // Warehouse admin cannot assign
  await assert.rejects(
    api.handle('POST', path, { authorization: 'Bearer wh-a-token' }, body),
    { status: 403 }
  );

  // Donor cannot assign
  await assert.rejects(
    api.handle('POST', path, { authorization: 'Bearer donor-token' }, body),
    { status: 403 }
  );

  // Inactive System Admin cannot assign
  await assert.rejects(
    api.handle('POST', path, { authorization: 'Bearer admin-inactive-token' }, body),
    { status: 403 }
  );

  // Unauthenticated caller cannot assign
  await assert.rejects(
    api.handle('POST', path, {}, body),
    { status: 401 }
  );
});

test('Manual assignment: rejects non-existent warehouse, inactive warehouse, non-existent donation, and invalid payload', async () => {
  const { api } = setup();
  const headers = { authorization: 'Bearer admin-token' };

  // Non-existent warehouse returns 404
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-unassigned/assign-warehouse', headers,
      { warehouseId: 'kho-nonexistent', expectedVersion: 1 }),
    { status: 404 }
  );

  // Inactive warehouse returns 400
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-unassigned/assign-warehouse', headers,
      { warehouseId: 'kho-inactive', expectedVersion: 1 }),
    { status: 400 }
  );

  // Non-existent donation returns 404
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-missing/assign-warehouse', headers,
      { warehouseId: 'kho-a', expectedVersion: 1 }),
    { status: 404 }
  );

  // Invalid body parameters return 400
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-unassigned/assign-warehouse', headers,
      { warehouseId: '', expectedVersion: 1 }),
    { status: 400 }
  );
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-unassigned/assign-warehouse', headers,
      { warehouseId: 'kho-a', expectedVersion: -1 }),
    { status: 400 }
  );
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-unassigned/assign-warehouse', headers,
      { warehouseId: 'kho-a' }),
    { status: 400 }
  );
});

test('Manual assignment: rejects already assigned, non-pending, awaiting information, or stale expectedVersion', async () => {
  const { api, documents } = setup();
  const headers = { authorization: 'Bearer admin-token' };

  // Already assigned donation (don-1 has warehouseId: 'kho-a')
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-1/assign-warehouse', headers,
      { warehouseId: 'kho-b', expectedVersion: 1 }),
    { status: 409 }
  );

  // Non-pending status (approved, rejected, etc.)
  documents.set('donations/don-approved', {
    id: 'don-approved', donorId: 'donor-1', title: 'Đã duyệt', status: 'approved', version: 1,
  });
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-approved/assign-warehouse', headers,
      { warehouseId: 'kho-a', expectedVersion: 1 }),
    { status: 409 }
  );

  // Awaiting information (reviewState === 'needs_information')
  documents.set('donations/don-needs-info', {
    id: 'don-needs-info', donorId: 'donor-1', title: 'Chờ bổ sung', status: 'pending',
    reviewState: 'needs_information', version: 1,
  });
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-needs-info/assign-warehouse', headers,
      { warehouseId: 'kho-a', expectedVersion: 1 }),
    { status: 409 }
  );

  // Stale expectedVersion
  await assert.rejects(
    api.handle('POST', '/v1/admin/donations/don-unassigned/assign-warehouse', headers,
      { warehouseId: 'kho-a', expectedVersion: 99 }),
    { status: 409 }
  );
});

test('Manual assignment: queue scoping unlocks only for assigned warehouse; donor cannot access audit data', async () => {
  const { api, documents } = setup();

  // Before assignment: unassigned donation cannot be viewed by warehouse staff
  await assert.rejects(
    api.handle('GET', '/v1/admin/donations/don-unassigned', { authorization: 'Bearer wh-a-token' }),
    { status: 403 }
  );
  await assert.rejects(
    api.handle('GET', '/v1/admin/donations/don-unassigned', { authorization: 'Bearer wh-b-token' }),
    { status: 403 }
  );

  // System admin assigns to kho-a
  await api.handle(
    'POST',
    '/v1/admin/donations/don-unassigned/assign-warehouse',
    { authorization: 'Bearer admin-token' },
    { warehouseId: 'kho-a', expectedVersion: 1 }
  );

  // Now staff of kho-a CAN view the donation
  const staffRes = await api.handle('GET', '/v1/admin/donations/don-unassigned', { authorization: 'Bearer wh-a-token' });
  assert.equal(staffRes.status, 200);
  assert.equal(staffRes.body.donation.warehouseId, 'kho-a');
  assert.equal(staffRes.body.donation.warehouseAssignedBy, 'admin-1');

  // Staff of kho-b is still forbidden (cannot view donations assigned to kho-a)
  await assert.rejects(
    api.handle('GET', '/v1/admin/donations/don-unassigned', { authorization: 'Bearer wh-b-token' }),
    { status: 403 }
  );

  // Donor calling admin review API is forbidden
  await assert.rejects(
    api.handle('GET', '/v1/admin/donations/don-unassigned', { authorization: 'Bearer donor-token' }),
    { status: 403 }
  );

  // Directly verify donations doc in DB: donor-readable document has no internal audit fields
  const rawDonation = documents.get('donations/don-unassigned');
  assert.equal(rawDonation.warehouseId, 'kho-a');
  assert.equal(rawDonation.warehouseAssignedBy, undefined);
  assert.equal(rawDonation.warehouseAssignedAt, undefined);
});

test('Chi tiết đơn trả email người phân kho / xác nhận danh mục, vẫn giữ UID gốc', async () => {
  const auth = { async getUsers(ids) {
    return { users: ids.filter(({ uid }) => uid === 'admin-1').map(({ uid }) => ({ uid, email: 'admin@reshare.vn' })) };
  } };
  const { api } = setup({ auth });
  const headers = { authorization: 'Bearer admin-token' };
  const assigned = await api.handle('POST', '/v1/admin/donations/don-unassigned/assign-warehouse', headers,
    { warehouseId: 'kho-a', expectedVersion: 1 });
  assert.equal(assigned.body.donation.warehouseAssignedBy, 'admin-1');
  assert.equal(assigned.body.donation.warehouseAssignedByEmail, 'admin@reshare.vn');
  const confirmed = await api.handle('POST', '/v1/admin/donations/don-unassigned/confirm-category', headers,
    { category: 'books', expectedVersion: 0 });
  assert.equal(confirmed.body.donation.staffConfirmedByEmail, 'admin@reshare.vn');
  const decided = await api.handle('POST', '/v1/admin/donations/don-unassigned/decide', headers, { action: 'approve' });
  const entry = decided.body.donation.history.at(-1);
  assert.equal(entry.actorUid, 'admin-1');
  assert.equal(entry.actorEmail, 'admin@reshare.vn', 'lịch sử trạng thái cũng hiện email người thao tác');

  const { api: withoutAuth } = setup();
  const plain = await withoutAuth.handle('POST', '/v1/admin/donations/don-unassigned/assign-warehouse', headers,
    { warehouseId: 'kho-a', expectedVersion: 1 });
  assert.equal(plain.body.donation.warehouseAssignedByEmail, null, 'không có Auth thì web hiện UID như cũ');
});
