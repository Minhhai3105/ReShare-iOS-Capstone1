const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createDonationReviewApi } = require('../donation-review-api.cjs');

test('US10: Concurrent appraisal decisions in Firestore Emulator produce exactly one state transition', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'donation-review-emulator-test');
  try {
    const db = getFirestore(app);

    // Setup staff
    await db.doc('staff_assignments/staff-1').set({
      role: 'warehouse_admin',
      active: true,
      warehouseIds: ['kho-emulator-1'],
    });

    const verifyToken = async (token) => {
      if (token === 'staff-token') return { uid: 'staff-1' };
      throw new Error('Unauthorized');
    };

    const api = createDonationReviewApi({
      db,
      verifyToken,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    const donationId = 'don-emulator-concurrent';
    await db.doc(`donations/${donationId}`).set({
      id: donationId,
      donorId: 'donor-1',
      hubId: 'illustration-only',
      warehouseId: 'kho-emulator-1',
      title: 'Đơn quyên góp thử nghiệm',
      status: 'pending',
      version: 1,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2 nhân sự gửi quyết định duyệt và từ chối đồng thời
    const [res1, res2] = await Promise.allSettled([
      api.handle(
        'POST',
        `/v1/admin/donations/${donationId}/decide`,
        { authorization: 'Bearer staff-token' },
        { action: 'approve', internalNote: 'Ghi chú chỉ dành cho nhân sự' }
      ),
      api.handle(
        'POST',
        `/v1/admin/donations/${donationId}/decide`,
        { authorization: 'Bearer staff-token' },
        { action: 'reject', publicMessage: 'Từ chối do thừa', internalNote: 'Ghi chú chỉ dành cho nhân sự' }
      ),
    ]);

    // Phải có đúng 1 request thành công và 1 request bị từ chối do xung đột (409)
    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Chỉ được có đúng 1 quyết định thành công');
    assert.equal(rejected.length, 1, 'Quyết định cạnh tranh phải bị từ chối');
    assert.equal(rejected[0].reason.status, 409, 'Lỗi xung đột phải trả về mã 409 Conflict');

    // Kiểm tra trạng thái cuối cùng trong Firestore
    const finalDoc = await db.doc(`donations/${donationId}`).get();
    assert.notEqual(finalDoc.data().status, 'pending', 'Trạng thái đơn phải không còn là pending');
    assert.equal(finalDoc.data().version, 2, 'Version phải tăng lên 2');
    assert.equal(Object.hasOwn(finalDoc.data(), 'internalNote'), false);
    assert.equal(Object.hasOwn(finalDoc.data(), 'reviewedBy'), false);
    assert.equal(finalDoc.data().history[0].internalNote, undefined);
    const privateReview = await db.doc(`donation_reviews/${donationId}`).get();
    assert.equal(privateReview.data().internalNote, 'Ghi chú chỉ dành cho nhân sự');

    // AC5: Inventory không được phép tăng hoặc bị sửa đổi
    const inventorySnapshot = await db.collection('inventory').get();
    assert.equal(inventorySnapshot.size, 0, 'Inventory không bị thay đổi sau quyết định duyệt');
  } finally {
    try {
      const db = getFirestore(app);
      await db.doc('staff_assignments/staff-1').delete();
      await db.doc('donations/don-emulator-concurrent').delete();
      await db.doc('donation_reviews/don-emulator-concurrent').delete();
    } catch {
      // ignore
    }
    await deleteApp(app);
  }
});

test('US07: staff confirmation persists privately and contributes to scoped agreement in Firestore Emulator', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'donation-ai-review-emulator-test');
  const donationId = 'don-emulator-ai-review';
  try {
    const db = getFirestore(app);
    await db.doc('staff_assignments/ai-staff').set({
      role: 'warehouse_admin', active: true, warehouseIds: ['kho-ai'],
    });
    await db.doc(`donations/${donationId}`).set({
      id: donationId, donorId: 'donor-ai', warehouseId: 'kho-ai',
      title: 'Áo khoác', category: 'clothing', donorConfirmedCategory: 'clothing',
      aiPredictedCategory: 'clothing', aiConfidence: 0.91,
      aiModelVersion: 'ReShare_v8_baseline_01', status: 'pending', version: 1,
    });
    const api = createDonationReviewApi({
      db,
      verifyToken: async token => token === 'ai-staff-token' ? { uid: 'ai-staff' } : null,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });
    const headers = { authorization: 'Bearer ai-staff-token' };
    const saved = await api.handle('POST', `/v1/admin/donations/${donationId}/confirm-category`, headers,
      { category: 'clothing', expectedVersion: 0 });
    assert.equal(saved.body.donation.staffConfirmedCategory, 'clothing');
    assert.equal((await db.doc(`donations/${donationId}`).get()).data().staffConfirmedCategory, undefined);
    const review = (await db.doc(`donation_reviews/${donationId}`).get()).data();
    assert.equal(review.staffConfirmedCategory, 'clothing');
    assert.equal(review.staffConfirmationVersion, 1);
    const summary = await api.handle('GET', '/v1/admin/donations/ai-summary', headers);
    assert.equal(summary.body.sampleCount, 1);
    assert.equal(summary.body.matchingCount, 1);
  } finally {
    const db = getFirestore(app);
    await Promise.all([
      db.doc('staff_assignments/ai-staff').delete(),
      db.doc(`donations/${donationId}`).delete(),
      db.doc(`donation_reviews/${donationId}`).delete(),
    ]);
    await deleteApp(app);
  }
});

test('Sprint 2: System Admin assigns a pending donation and only its warehouse can appraise it', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'donation-warehouse-assignment-emulator-test');
  const db = getFirestore(app);
  const donationId = 'don-emulator-warehouse-assignment';
  const donationPath = `/v1/admin/donations/${donationId}`;
  const headers = token => ({ authorization: `Bearer ${token}` });
  try {
    await Promise.all([
      db.doc('staff_assignments/assignment-admin').set({ role: 'system_admin', active: true, warehouseIds: [] }),
      db.doc('staff_assignments/assignment-a').set({ role: 'warehouse_admin', active: true, warehouseIds: ['assignment-kho-a'] }),
      db.doc('staff_assignments/assignment-b').set({ role: 'warehouse_admin', active: true, warehouseIds: ['assignment-kho-b'] }),
      db.doc('warehouses/assignment-kho-a').set({ name: 'Kho A', status: 'active' }),
      db.doc('warehouses/assignment-kho-b').set({ name: 'Kho B', status: 'active' }),
      db.doc(`donations/${donationId}`).set({
        id: donationId, donorId: 'assignment-donor', hubId: 'illustration-only',
        title: 'Đơn thử phân kho', status: 'pending', version: 1,
      }),
    ]);
    const tokenUids = {
      admin: 'assignment-admin', warehouseA: 'assignment-a',
      warehouseB: 'assignment-b', donor: 'assignment-donor',
    };
    const api = createDonationReviewApi({
      db,
      verifyToken: async token => tokenUids[token] ? { uid: tokenUids[token] } : null,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    await assert.rejects(api.handle('GET', donationPath, headers('warehouseA')), { status: 403 });
    const assigned = await api.handle('POST', `${donationPath}/assign-warehouse`, headers('admin'),
      { warehouseId: 'assignment-kho-a', expectedVersion: 1 });
    assert.equal(assigned.body.donation.warehouseId, 'assignment-kho-a');
    assert.equal(assigned.body.donation.version, 2);

    const donation = (await db.doc(`donations/${donationId}`).get()).data();
    const review = (await db.doc(`donation_reviews/${donationId}`).get()).data();
    assert.equal(donation.warehouseId, 'assignment-kho-a');
    assert.equal(donation.version, 2);
    assert.equal(Object.hasOwn(donation, 'warehouseAssignedBy'), false);
    assert.equal(Object.hasOwn(donation, 'warehouseAssignedAt'), false);
    assert.equal(review.warehouseAssignedBy, 'assignment-admin');
    assert.ok(review.warehouseAssignedAt);

    assert.equal((await api.handle('GET', donationPath, headers('warehouseA'))).status, 200);
    await assert.rejects(api.handle('GET', donationPath, headers('warehouseB')), { status: 403 });
    await assert.rejects(api.handle('POST', `${donationPath}/decide`, headers('warehouseB'),
      { action: 'approve', expectedVersion: 2 }), { status: 403 });
    await assert.rejects(api.handle('GET', donationPath, headers('donor')), { status: 403 });

    const approved = await api.handle('POST', `${donationPath}/decide`, headers('warehouseA'),
      { action: 'approve', expectedVersion: 2, internalNote: 'Ghi chú nội bộ' });
    assert.equal(approved.body.donation.status, 'approved');
    assert.equal(approved.body.donation.version, 3);
    const finalDonation = (await db.doc(`donations/${donationId}`).get()).data();
    const finalReview = (await db.doc(`donation_reviews/${donationId}`).get()).data();
    assert.equal(finalDonation.status, 'approved');
    assert.equal(finalDonation.history[0].internalNote, undefined);
    assert.equal(finalReview.warehouseAssignedBy, 'assignment-admin');
    assert.equal(finalReview.reviewedBy, 'assignment-a');
    assert.equal(finalReview.internalNote, 'Ghi chú nội bộ');
    assert.equal((await db.collection('inventory').get()).size, 0);
  } finally {
    await Promise.all([
      db.doc('staff_assignments/assignment-admin').delete(),
      db.doc('staff_assignments/assignment-a').delete(),
      db.doc('staff_assignments/assignment-b').delete(),
      db.doc('warehouses/assignment-kho-a').delete(),
      db.doc('warehouses/assignment-kho-b').delete(),
      db.doc(`donations/${donationId}`).delete(),
      db.doc(`donation_reviews/${donationId}`).delete(),
    ]);
    await deleteApp(app);
  }
});
