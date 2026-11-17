const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createAiModerationJobs, CHECKS_COLLECTION } = require('../ai-moderation-jobs.cjs');
const { createP2pListingsApi } = require('../p2p-listings-api.cjs');

const options = { skip: !process.env.FIRESTORE_EMULATOR_HOST };
const base = '/v1/admin/p2p/listings';
const headers = uid => ({ authorization: `Bearer ${uid}` });
const result = (status = 'flagged') => ({ status, categories: status === 'flagged' ? ['scam_or_sale'] : [], reason: 'Gợi ý kiểm tra', model: 'test-vision' });
const listing = (extra = {}) => ({ donorId: 'donor', title: 'Áo mới', donorNote: 'Tặng miễn phí', status: 'available', district: 'Hải Châu', images: ['https://image.test/a.jpg'], ...extra });
let appNumber = 0;
async function fixture(run) {
  const app = initializeApp({ projectId: 'demo-reshare-ai-moderation' }, `ai-moderation-${++appNumber}`);
  const db = getFirestore(app);
  try {
    await Promise.all([
      db.doc('staff_assignments/sa').set({ active: true, role: 'system_admin' }),
      db.doc('staff_assignments/hc').set({ active: true, role: 'warehouse_admin', warehouseIds: ['hc'] }),
      db.doc('staff_assignments/lc').set({ active: true, role: 'warehouse_admin', warehouseIds: ['lc'] }),
      db.doc('warehouses/hc').set({ status: 'active', districts: ['Hải Châu'] }),
      db.doc('warehouses/lc').set({ status: 'active', districts: ['Liên Chiểu'] }),
      db.doc('catalog_items/item').set(listing()),
    ]);
    await run(db);
  } finally {
    await Promise.all(['staff_assignments', 'warehouses', 'catalog_items', CHECKS_COLLECTION].map(name => db.recursiveDelete(db.collection(name))));
    await deleteApp(app);
  }
}
function apiFor(db, jobs) {
  return createP2pListingsApi({ db, verifyToken: async token => ({ uid: token }), aiChecks: jobs });
}
function gateModerator() {
  let release, started;
  const waiting = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  let calls = 0;
  return { enabled: true, entered, release,
    get calls() { return calls; },
    async check() { calls += 1; started(); await waiting; return result(); },
  };
}

test('AI kiểm duyệt API: đúng phạm vi, ghi duy nhất nhãn, trả list/detail, cooldown và lỗi không đổi trạng thái', options, () => fixture(async db => {
  let now = new Date('2026-11-17T08:00:00Z');
  let calls = 0;
  const moderator = { enabled: true, check: async () => { calls += 1; return result(calls === 1 ? 'flagged' : 'error'); } };
  const jobs = createAiModerationJobs({ db, moderator, clock: () => now });
  const api = apiFor(db, jobs);
  await assert.rejects(api.handle('POST', `${base}/item/ai-check`, headers('lc'), {}), { status: 403, code: 'OUT_OF_SCOPE' });
  await assert.rejects(api.handle('POST', `${base}/item/ai-check`, {}, {}), { status: 401 });
  await assert.rejects(api.handle('POST', `${base}/item/ai-check`, headers('sa'), { status: 'removed' }), { status: 400 });
  assert.equal(calls, 0);
  const before = (await db.doc('catalog_items/item').get()).data();
  const checked = await api.handle('POST', `${base}/item/ai-check`, headers('hc'), {});
  assert.equal(checked.body.enabled, true);
  assert.equal(checked.body.aiModeration.status, 'flagged');
  const after = (await db.doc('catalog_items/item').get()).data();
  assert.equal(after.aiModeration.status, 'flagged');
  delete after.aiModeration;
  assert.deepEqual(after, before, 'không sửa trạng thái hoặc field nghiệp vụ');
  const list = await api.handle('GET', base, headers('hc'), null);
  assert.equal(list.body.aiEnabled, true);
  assert.equal(list.body.listings[0].aiModeration.status, 'flagged');
  const detail = await api.handle('GET', `${base}/item`, headers('sa'), null);
  assert.equal(detail.body.aiEnabled, true);
  assert.equal(detail.body.listing.aiModeration.checkedAt, now.toISOString());
  await assert.rejects(api.handle('POST', `${base}/item/ai-check`, headers('sa'), {}), { status: 429 });
  assert.equal(calls, 1);
  now = new Date(now.getTime() + 60001);
  await api.handle('POST', `${base}/item/ai-check`, headers('sa'), {});
  const failed = (await db.doc('catalog_items/item').get()).data();
  assert.equal(failed.aiModeration.status, 'error');
  assert.equal(failed.status, 'available');
  assert.equal(failed.moderation, undefined);
}));

test('AI kiểm duyệt: tắt cấu hình vẫn kiểm phạm vi, không gọi AI và API báo tắt', options, () => fixture(async db => {
  const jobs = createAiModerationJobs({ db, moderator: { enabled: false, check() { assert.fail('không gọi AI'); } } });
  const api = apiFor(db, jobs);
  assert.equal((await api.handle('GET', base, headers('sa'), null)).body.aiEnabled, false);
  const response = await api.handle('POST', `${base}/item/ai-check`, headers('hc'), {});
  assert.equal(response.body.enabled, false);
  await assert.rejects(api.handle('POST', `${base}/item/ai-check`, headers('lc'), {}), { status: 403 });
  assert.equal((await db.doc('catalog_items/item').get()).data().aiModeration, undefined);
  assert.equal((await db.collection(CHECKS_COLLECTION).get()).size, 0);
}));

for (const change of ['revoke', 'district']) {
  test(`AI kiểm duyệt: đọc lại quyền/phạm vi khi ghi sau thay đổi ${change}`, options, () => fixture(async db => {
    const moderator = gateModerator();
    const api = apiFor(db, createAiModerationJobs({ db, moderator }));
    const pending = api.handle('POST', `${base}/item/ai-check`, headers('hc'), {});
    await moderator.entered;
    if (change === 'revoke') await db.doc('staff_assignments/hc').update({ active: false });
    else await db.doc('warehouses/hc').update({ districts: ['Liên Chiểu'] });
    moderator.release();
    await assert.rejects(pending, { status: 403 });
    const item = (await db.doc('catalog_items/item').get()).data();
    assert.equal(item.aiModeration, undefined);
    assert.equal(item.status, 'available');
  }));
}

test('AI kiểm duyệt: hai process dùng chung khoá lượt, không gọi AI trùng', options, () => fixture(async db => {
  const moderator = gateModerator();
  const first = apiFor(db, createAiModerationJobs({ db, moderator }));
  const second = apiFor(db, createAiModerationJobs({ db, moderator }));
  const pending = first.handle('POST', `${base}/item/ai-check`, headers('hc'), {});
  await moderator.entered;
  await assert.rejects(second.handle('POST', `${base}/item/ai-check`, headers('sa'), {}), { status: 429 });
  assert.equal(moderator.calls, 1);
  moderator.release();
  await pending;
  await assert.rejects(second.handle('POST', `${base}/item/ai-check`, headers('sa'), {}), { status: 429 });
}));

test('AI kiểm duyệt: nội dung đổi trong lúc quét thì không ghi nhãn cũ', options, () => fixture(async db => {
  const moderator = gateModerator();
  const api = apiFor(db, createAiModerationJobs({ db, moderator }));
  const pending = api.handle('POST', `${base}/item/ai-check`, headers('sa'), {});
  await moderator.entered;
  await db.doc('catalog_items/item').update({ title: 'Nội dung mới' });
  moderator.release();
  await assert.rejects(pending, { status: 409, code: 'AI_CONTENT_CHANGED' });
  assert.equal((await db.doc('catalog_items/item').get()).data().aiModeration, undefined);
}));

test('AI kiểm duyệt nền: tối đa 10 bài, bỏ bài đã kiểm và đi qua 200 bài đầu', options, () => fixture(async db => {
  await db.doc('catalog_items/item').delete();
  const batch = db.batch();
  for (let i = 0; i < 212; i += 1) {
    batch.set(db.doc(`catalog_items/item-${String(i).padStart(3, '0')}`), listing(i < 200 ? { aiModeration: result('error') } : {}));
  }
  batch.set(db.doc('catalog_items/reserved'), listing({ status: 'reserved' }));
  await batch.commit();
  let calls = 0;
  const jobs = createAiModerationJobs({ db, moderator: { enabled: true, check: async () => { calls += 1; return result('safe'); } } });
  assert.equal((await jobs.runOnce()).checked, 0, '200 bài đầu đều đã kiểm');
  assert.equal((await jobs.runOnce()).checked, 10);
  assert.equal((await jobs.runOnce()).checked, 2);
  assert.equal(calls, 12);
  assert.equal((await db.doc('catalog_items/reserved').get()).data().aiModeration, undefined);
  assert.equal((await db.doc('catalog_items/item-211').get()).data().status, 'available');
  assert.equal((await db.doc('catalog_items/item-000').get()).data().aiModeration.status, 'error');
}));
