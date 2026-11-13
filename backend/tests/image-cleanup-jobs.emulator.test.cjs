const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createImageCleanupJobs } = require('../image-cleanup-jobs.cjs');

// Review M01 (14/11/2026): worker đọc bản ghi chỉ có ảnh của bài A và đang chờ Cloudinary, thì request
// xoá tài khoản bổ sung ảnh bài B vào cùng bản ghi. Worker xong A không được xoá luôn bản ghi (mất B).
test('Dọn ảnh: ảnh được bổ sung trong lúc worker đang chạy vẫn còn trong hàng đợi và được dọn tiếp', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'image-cleanup-jobs-emulator-test');
  const db = getFirestore(app);
  const ref = db.collection('image_cleanup_jobs').doc('m01-race');
  const imagesA = ['a1', 'a2', 'a3'].map(name => `catalog_items/cat_m01-a/${name}`);
  const imagesB = ['b1', 'b2', 'b3'].map(name => `catalog_items/cat_m01-b/${name}`);
  try {
    await ref.set({ reason: 'account_deletion', publicIds: imagesA });

    // Cloudinary giả lập: lần gọi đầu dừng lại cho tới khi test cho chạy tiếp.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let firstCallStarted;
    const started = new Promise(resolve => { firstCallStarted = resolve; });
    const destroyed = [];
    const deleteCatalogImage = async publicId => {
      if (destroyed.length === 0) { firstCallStarted(); await gate; }
      destroyed.push(publicId);
    };
    const worker = createImageCleanupJobs({ db, deleteCatalogImage });

    const running = worker.processJob(ref);
    await started; // worker đã đọc bản ghi (chỉ có A) và đang chờ Cloudinary
    // Giống account-api.cjs: transaction xoá bài B bổ sung ảnh B bằng arrayUnion vào cùng bản ghi.
    await ref.set({ publicIds: FieldValue.arrayUnion(...imagesB) }, { merge: true });
    release();

    assert.equal(await running, 3, 'còn 3 ảnh B chờ dọn, không báo 0');
    const afterFirst = await ref.get();
    assert.equal(afterFirst.exists, true, 'không xoá bản ghi khi còn ảnh B');
    assert.deepEqual(afterFirst.data().publicIds, imagesB, 'chỉ bỏ ảnh A đã xoá xong');
    assert.deepEqual(destroyed, imagesA);

    assert.equal(await worker.processJob(ref), 0);
    assert.equal((await ref.get()).exists, false, 'dọn xong B thì mới xoá bản ghi');
    assert.deepEqual(destroyed, [...imagesA, ...imagesB]);
  } finally {
    await ref.delete().catch(() => {});
    await deleteApp(app);
  }
});

test('Dọn ảnh: ảnh lỗi giữ lại, bản ghi đã bị bên kia dọn xong thì trả 0', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'image-cleanup-jobs-emulator-test-2');
  const db = getFirestore(app);
  const ref = db.collection('image_cleanup_jobs').doc('m01-partial');
  try {
    await ref.set({ reason: 'account_deletion', publicIds: ['catalog_items/x/ok', 'catalog_items/x/fail'] });
    const flaky = createImageCleanupJobs({ db, deleteCatalogImage: async id => { if (id.endsWith('/fail')) throw new Error('500'); } });
    assert.equal(await flaky.processJob(ref), 1);
    const left = (await ref.get()).data();
    assert.deepEqual(left.publicIds, ['catalog_items/x/fail']);
    assert.equal(left.attempts, 1);

    // Bên kia (request hoặc worker khác) xoá bản ghi trong lúc mình đang gọi Cloudinary.
    const racing = createImageCleanupJobs({ db, deleteCatalogImage: async () => { await ref.delete(); } });
    assert.equal(await racing.processJob(ref), 0);
    assert.equal((await ref.get()).exists, false);
  } finally {
    await ref.delete().catch(() => {});
    await deleteApp(app);
  }
});
