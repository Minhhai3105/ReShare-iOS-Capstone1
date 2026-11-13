const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

// Đơn lưu kèm tên điểm tiếp nhận lúc gửi (hubName) để lịch sử vẫn đúng tên khi điểm đổi tên hoặc
// ngừng hoạt động. Tên phải khớp hubs/{hubId}; client không tự đặt tên tuỳ ý.
test('Tên điểm lưu kèm đơn phải đúng tên trong hubs; đơn không có tên (app cũ) vẫn tạo được', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  try {
    const ids = [];
    const records = ['hubname-ok', 'hubname-legacy'];
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc('hubs/hub-haichau').set({ name: 'Hải Châu', status: 'active', isDemo: true });
      await db.doc('hubs/hub-cu').set({ name: 'Điểm cũ', status: 'inactive', isDemo: false });
      for (const recordId of [...records, 'hubname-bad']) {
        const publicIds = [1, 2, 3].map(n => `donations/${recordId}/00000000-0000-4000-8000-00000000000${n}`);
        ids.push(publicIds);
        await db.doc(`image_upload_batches/donation_${recordId}`).set({
          ownerUid: 'donor', assets: { a: publicIds[0], b: publicIds[1], c: publicIds[2] },
        });
      }
    });
    const donor = env.authenticatedContext('donor').firestore();
    const donation = (recordId, index, extra) => ({
      id: recordId, donorId: 'donor', title: 'Sách giáo khoa', description: 'Còn dùng tốt',
      category: 'books', condition: 'good', status: 'pending', createdAt: new Date(),
      imageProvider: 'cloudinary', imagePublicIds: ids[index], ...extra,
    });

    const bad = (extra, why) => assertFails(donor.doc('donations/hubname-bad').set(donation('hubname-bad', 2, extra)), why);
    await bad({ hubId: 'hub-haichau', hubName: 'Trạm Lớn Nhất Đà Nẵng' }, 'tên không khớp điểm');
    await bad({ hubName: 'Hải Châu' }, 'có tên mà không có mã điểm');
    await bad({ hubId: 'hub-khong-co', hubName: 'Hải Châu' }, 'điểm không tồn tại');
    await bad({ hubId: 'hub-haichau', hubName: 42 }, 'tên phải là chuỗi');
    await bad({ hubId: 'hub/../x', hubName: 'Hải Châu' }, 'mã điểm không hợp lệ');

    await assertSucceeds(donor.doc('donations/hubname-ok').set(donation('hubname-ok', 0, { hubId: 'hub-haichau', hubName: 'Hải Châu' })));
    await assertSucceeds(donor.doc('donations/hubname-legacy').set(donation('hubname-legacy', 1, { hubId: 'hub-haichau' })),
      'app cũ chưa gửi hubName vẫn tạo đơn được');
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});
