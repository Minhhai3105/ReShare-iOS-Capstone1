const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('US11: Donor can only read own donation history and public feedback; cross-donor access is denied', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });

  try {
    const donor1 = env.authenticatedContext('donor-1').firestore();
    const donor2 = env.authenticatedContext('donor-2').firestore();
    const admin = env.authenticatedContext('admin').firestore();

    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('staff_assignments/admin').set({
        uid: 'admin',
        role: 'system_admin',
        active: true,
        warehouseIds: [],
      });

      // Tạo đơn cho donor-1 (đã bị từ chối kèm public feedback)
      await db.doc('donations/don-1').set({
        id: 'don-1',
        donorId: 'donor-1',
        title: 'Áo phao cũ',
        category: 'clothing',
        condition: 'fair',
        status: 'rejected',
        statusNote: 'Áo bị rách khóa kéo, chưa đạt chuẩn tiếp nhận.',
        createdAt: new Date(),
      });

      // Tạo đơn cho donor-2
      await db.doc('donations/don-2').set({
        id: 'don-2',
        donorId: 'donor-2',
        title: 'Bộ ấm chén',
        category: 'household',
        condition: 'good',
        status: 'approved',
        statusNote: 'Đã duyệt, vui lòng mang đến trạm.',
        createdAt: new Date(),
      });
    });

    // 1. Donor-1 đọc đơn của mình -> Thành công, đọc được public feedback
    const doc1 = await donor1.doc('donations/don-1').get();
    assert.equal(doc1.exists, true);
    assert.equal(doc1.data().status, 'rejected');
    assert.equal(doc1.data().statusNote, 'Áo bị rách khóa kéo, chưa đạt chuẩn tiếp nhận.');

    // 2. Donor-1 cố tình đọc đơn của Donor-2 -> Bị từ chối
    await assertFails(donor1.doc('donations/don-2').get());

    // 3. Donor-2 đọc đơn của mình -> Thành công
    await assertSucceeds(donor2.doc('donations/don-2').get());

    // 4. Donor-2 cố tình đọc đơn của Donor-1 -> Bị từ chối
    await assertFails(donor2.doc('donations/don-1').get());

    // 5. Donor-1 query danh sách đơn của chính mình -> Thành công
    await assertSucceeds(
      donor1.collection('donations').where('donorId', '==', 'donor-1').orderBy('createdAt', 'desc').get()
    );

    // 6. Donor-1 query danh sách đơn của Donor-2 -> Bị từ chối bởi Firestore Rules
    await assertFails(
      donor1.collection('donations').where('donorId', '==', 'donor-2').orderBy('createdAt', 'desc').get()
    );

    // 7. Donor-1 query toàn bộ donations không lọc theo donorId -> Bị từ chối
    await assertFails(donor1.collection('donations').get());
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});
