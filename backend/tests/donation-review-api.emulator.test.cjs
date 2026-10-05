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
      hubId: 'kho-emulator-1',
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
        { action: 'approve' }
      ),
      api.handle(
        'POST',
        `/v1/admin/donations/${donationId}/decide`,
        { authorization: 'Bearer staff-token' },
        { action: 'reject', publicMessage: 'Từ chối do thừa' }
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

    // AC5: Inventory không được phép tăng hoặc bị sửa đổi
    const inventorySnapshot = await db.collection('inventory').get();
    assert.equal(inventorySnapshot.size, 0, 'Inventory không bị thay đổi sau quyết định duyệt');
  } finally {
    try {
      const db = getFirestore(app);
      await db.doc('staff_assignments/staff-1').delete();
      await db.doc('donations/don-emulator-concurrent').delete();
    } catch {
      // ignore
    }
    await deleteApp(app);
  }
});
