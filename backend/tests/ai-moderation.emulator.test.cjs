const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createAiModerationJobs, CHECKS_COLLECTION } = require('../ai-moderation-jobs.cjs');
const { createP2pListingsApi } = require('../p2p-listings-api.cjs');
const { createAiModerator } = require('../ai-moderation.cjs');

const options = { skip: !process.env.FIRESTORE_EMULATOR_HOST };
const base = '/v1/admin/p2p/listings';
const headers = uid => ({ authorization: `Bearer ${uid}` });
const result = (status = 'flagged') => ({ status, categories: status === 'flagged' ? ['scam_or_sale'] : [], reason: 'Gợi ý kiểm tra', model: 'test-vision' });
const severe = { ...result(), categories: ['weapons'], confidence: 0.95 };
const autoRemoveConfig = { enabled: true, threshold: 0.9 };
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
      db.doc('users/donor').set({ suspended: false }),
      db.doc('catalog_items/item').set(listing()),
    ]);
    await run(db);
  } finally {
    const collections = ['staff_assignments', 'warehouses', 'users', 'catalog_items', 'reports', 'p2p_listing_audit', CHECKS_COLLECTION];
    await Promise.all(collections.map(name => db.recursiveDelete(db.collection(name))));
    await deleteApp(app);
  }
}
function apiFor(db, jobs) {
  return createP2pListingsApi({ db, verifyToken: async token => ({ uid: token }), aiChecks: jobs });
}
function gateModerator(verdict = result()) {
  let release, started;
  const waiting = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  let calls = 0;
  return { enabled: true, entered, release,
    get calls() { return calls; },
    async check() { calls += 1; started(); await waiting; return verdict; },
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

test('AI kiểm duyệt: giữ khoá sau mốc cooldown nếu lượt kiểm dài vẫn đang chạy', options, () => fixture(async db => {
  let now = new Date('2026-11-17T10:00:00Z');
  const moderator = gateModerator();
  const first = apiFor(db, createAiModerationJobs({ db, moderator, clock: () => now, timeoutMs: 120000 }));
  const second = apiFor(db, createAiModerationJobs({ db, moderator, clock: () => now }));
  const pending = first.handle('POST', `${base}/item/ai-check`, headers('hc'), {});
  await moderator.entered;
  try {
    now = new Date(now.getTime() + 60001);
    await assert.rejects(second.handle('POST', `${base}/item/ai-check`, headers('sa'), {}), { status: 429 });
    assert.equal(moderator.calls, 1);
  } finally {
    moderator.release();
    await pending;
  }
  assert.equal((await db.doc('catalog_items/item').get()).data().aiModeration.status, 'flagged');
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

test('AI kiểm duyệt nền: xét cả các bài sau mốc 200 và bỏ bài đã có nhãn', options, () => fixture(async db => {
  await db.doc('catalog_items/item').delete();
  const batch = db.batch();
  for (let i = 0; i < 212; i += 1) {
    batch.set(db.doc(`catalog_items/item-${String(i).padStart(3, '0')}`), listing(i < 200 ? { aiModeration: result('error') } : {}));
  }
  batch.set(db.doc('catalog_items/reserved'), listing({ status: 'reserved' }));
  await batch.commit();
  let calls = 0;
  const jobs = createAiModerationJobs({ db, moderator: { enabled: true, check: async () => { calls += 1; return result('safe'); } } });
  assert.equal((await jobs.runOnce()).checked, 13, 'tìm đủ bài chưa kiểm, kể cả bài đã có người hẹn');
  assert.equal((await jobs.runOnce()).checked, 0);
  assert.equal(calls, 13);
  assert.equal((await db.doc('catalog_items/reserved').get()).data().aiModeration.status, 'safe');
  assert.equal((await db.doc('catalog_items/item-211').get()).data().status, 'available');
  assert.equal((await db.doc('catalog_items/item-000').get()).data().aiModeration.status, 'error');
}));


test('AI kiểm duyệt nền: nhận bài mở lưu trạng thái tiếng Việt và giữ nguyên trạng thái', options, () => fixture(async db => {
  await db.doc('catalog_items/item').update({ status: 'Sẵn sàng nhận đồ' });
  const jobs = createAiModerationJobs({ db, moderator: { enabled: true, check: async () => result('safe') } });
  assert.equal((await jobs.runOnce()).checked, 1);
  const item = (await db.doc('catalog_items/item').get()).data();
  assert.equal(item.aiModeration.status, 'safe');
  assert.equal(item.status, 'Sẵn sàng nhận đồ');
  assert.equal(item.moderation, undefined);
}));

test('Listener kiểm bù bài có sẵn và tự gắn nhãn bài mới mà không chờ lượt quét tiếp theo', options, () => fixture(async db => {
  await db.doc('catalog_items/initial').set(listing({ title: 'Bài trước khi bật server', status: 'completed' }));
  const calls = [];
  const jobs = createAiModerationJobs({ db, batchSize: 1, intervalMs: 180000, moderator: {
    enabled: true, check: async ({ title }) => { calls.push(title); return result('safe'); },
  } });

  async function waitForLabel(id) {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const [item, lock] = await db.getAll(db.doc(`catalog_items/${id}`), db.doc(`${CHECKS_COLLECTION}/${id}`));
      if (item.data()?.aiModeration?.status === 'safe' && lock.data()?.checkId === null) return item.data();
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.fail(`Listener chưa hoàn tất gắn nhãn cho ${id}`);
  }

  jobs.start();
  try {
    const initial = await waitForLabel('initial');
    assert.equal(initial.status, 'completed');
    await waitForLabel('item');
    await db.doc('catalog_items/new-post').set(listing({ title: 'Bài đăng mới' }));
    assert.equal((await waitForLabel('new-post')).status, 'available');
    assert.deepEqual(calls.sort(), ['Bài trước khi bật server', 'Áo mới', 'Bài đăng mới'].sort());
  } finally {
    jobs.stop();
  }
}));

test('AI kiểm duyệt nền: lỗi từ lần thứ tư thử lại sau một giờ, bỏ safe/flagged và lỗi còn mới', options, () => fixture(async db => {
  const now = new Date('2026-11-17T10:00:00Z');
  const old = new Date(now.getTime() - 3600001);
  const atHour = new Date(now.getTime() - 3600000);
  const tooNew = new Date(now.getTime() - 3599999);
  const seed = [
    ['error-old', 'error', old], ['error-hour', 'error', atHour], ['error-epoch', 'error', new Date(0)], ['error-new', 'error', tooNew],
    ['safe-old', 'safe', old], ['flagged-old', 'flagged', old], ['error-invalid', 'error', 'không phải thời gian'],
  ];
  await Promise.all(seed.map(([id, status, checkedAt]) => db.doc(`catalog_items/${id}`).set(listing({
    title: id, aiModeration: { ...result(status), checkedAt, ...(status === 'error' ? { errorCount: 4 } : {}) },
  }))));
  const calls = [];
  const jobs = createAiModerationJobs({ db, clock: () => now, moderator: { enabled: true, check: async input => {
    calls.push(input.title); return result(input.title.startsWith('error-') ? 'error' : 'safe');
  } } });
  assert.equal((await jobs.runOnce()).checked, 4, 'bài chưa kiểm và ba bài error đủ một giờ');
  assert.deepEqual(calls.sort(), ['error-hour', 'error-old', 'error-epoch', 'Áo mới'].sort());
  const retried = (await db.doc('catalog_items/error-old').get()).data();
  assert.equal(retried.aiModeration.checkedAt.toMillis(), now.getTime());
  assert.equal(retried.aiModeration.errorCount, 5);
  assert.equal(retried.status, 'available');
  assert.equal(retried.moderation, undefined);
  assert.equal((await jobs.runOnce()).checked, 0, 'lỗi vừa thử lại phải chờ đủ một giờ nữa');
  assert.equal((await jobs.checkListing('error-old', { onlyUnseen: true })).skipped, true, 'kiểm điều kiện lại trong transaction');
  assert.equal((await db.doc('catalog_items/safe-old').get()).data().aiModeration.status, 'safe');
  assert.equal((await db.doc('catalog_items/flagged-old').get()).data().aiModeration.status, 'flagged');
}));

test('AI kiểm duyệt API: ảnh thành base64 và JSON có fence được lưu; ảnh không tải được giữ bài mở', options, () => fixture(async db => {
  const cloudImage = 'https://res.cloudinary.com/demo/image/upload/v123/catalog_items/test.jpg';
  await db.doc('catalog_items/item').update({ images: [cloudImage] });
  await db.doc('catalog_items/broken').set(listing({ images: ['http://image.test/broken.jpg'] }));
  let modelCalls = 0;
  const moderator = createAiModerator({ baseUrl: 'https://ai.example/v1', apiKey: 'test-only-key', model: 'test-vision',
    fetchImpl: async (url, options) => {
      if (url.startsWith('https://res.cloudinary.com/')) {
        assert.ok(url.includes('/upload/w_768,c_limit,q_auto,f_jpg/v123/'));
        assert.equal(options.headers?.Authorization, undefined);
        return new Response(Buffer.from('anh-gia'), { headers: { 'content-type': 'image/jpeg' } });
      }
      assert.equal(url, 'https://ai.example/v1/chat/completions');
      modelCalls += 1;
      const image = JSON.parse(options.body).messages[1].content[1].image_url.url;
      assert.equal(image, `data:image/jpeg;base64,${Buffer.from('anh-gia').toString('base64')}`);
      return { ok: true, json: async () => ({ choices: [{ message: {
        content: '```json\n' + JSON.stringify({ verdict: 'flagged', categories: ['scam_or_sale'], reason: 'Cần nhân sự xem xét' }) + '\n```',
      } }] }) };
    },
  });
  const api = apiFor(db, createAiModerationJobs({ db, moderator }));
  const checked = await api.handle('POST', `${base}/item/ai-check`, headers('hc'), {});
  assert.equal(checked.body.aiModeration.status, 'flagged');
  assert.equal((await db.doc('catalog_items/item').get()).data().aiModeration.status, 'flagged');
  const failed = await api.handle('POST', `${base}/broken/ai-check`, headers('hc'), {});
  assert.equal(failed.body.aiModeration.status, 'error');
  assert.equal(modelCalls, 1, 'ảnh hỏng không được gửi request chỉ có chữ cho model');
  const item = (await db.doc('catalog_items/broken').get()).data();
  assert.equal(item.aiModeration.status, 'error');
  assert.equal(item.status, 'available');
  assert.equal(item.moderation, undefined);
}));

test('AI tự gỡ bài mở, ghi audit và cho Warehouse Admin đúng quận khôi phục', options, () => fixture(async db => {
  let now = new Date('2026-11-18T08:00:00Z');
  await Promise.all([
    db.doc('reports/open').set({ targetId: 'item', targetType: 'listing', status: 'open' }),
    db.doc('reports/pending').set({ targetId: 'item', targetType: 'listing', status: 'open', pendingAction: 'suspend_user' }),
    db.doc('catalog_items/legacy').set(listing({ status: 'Sẵn sàng nhận đồ' })),
  ]);
  let calls = 0;
  const jobs = createAiModerationJobs({ db, autoRemoveConfig, clock: () => now,
    moderator: { enabled: true, check: async () => { calls += 1; return severe; } },
  });
  const api = apiFor(db, jobs);
  const ref = db.doc('catalog_items/item');
  const audit = db.collection('p2p_listing_audit').where('listingId', '==', 'item');

  const checked = await api.handle('POST', `${base}/item/ai-check`, headers('hc'), {});
  assert.equal(checked.body.removed, true);
  const removed = (await ref.get()).data();
  assert.equal(removed.status, 'removed');
  assert.equal(removed.aiModeration.confidence, 0.95);
  assert.deepEqual(removed.moderation, {
    source: 'ai', action: 'remove', previousStatus: 'available', moderatedBy: 'ai-moderation',
    reason: severe.reason, categories: severe.categories, model: severe.model, confidence: severe.confidence,
    moderatedAt: removed.moderation.moderatedAt,
  });
  assert.equal(removed.moderation.moderatedAt.toMillis(), now.getTime());
  const open = (await db.doc('reports/open').get()).data();
  assert.equal(open.status, 'resolved');
  assert.equal(open.resolution, 'remove_listing');
  assert.equal(open.resolutionNote, `Gỡ tự động bởi AI: ${severe.reason}`);
  const pending = (await db.doc('reports/pending').get()).data();
  assert.equal(pending.status, 'open');
  assert.equal(pending.pendingAction, 'suspend_user');
  const [removal] = (await audit.get()).docs.map(doc => doc.data());
  assert.equal(removal.action, 'remove');
  assert.equal(removal.actorUid, 'ai-moderation');
  assert.equal(removal.actorRole, 'ai');
  assert.equal(removal.actorEmail, null);
  assert.deepEqual(removal.resolvedReportIds, ['open']);

  const list = await api.handle('GET', base, headers('hc'), null);
  const detail = await api.handle('GET', `${base}/item`, headers('hc'), null);
  assert.deepEqual(list.body.aiAutoRemove, autoRemoveConfig);
  assert.deepEqual(detail.body.aiAutoRemove, autoRemoveConfig);
  assert.equal(detail.body.listing.aiModeration.confidence, 0.95);
  assert.equal(detail.body.listing.restoreBlocker, null);
  const restoreBody = { expectedStatus: 'removed' };
  await assert.rejects(api.handle('POST', `${base}/item/restore`, headers('lc'), restoreBody), { status: 403 });
  assert.equal((await api.handle('POST', `${base}/item/restore`, headers('hc'), restoreBody)).body.status, 'available');
  const reopened = (await ref.get()).data();
  assert.equal(reopened.status, 'available');
  const override = reopened.aiModeration.staffOverride;
  assert.equal(override.by, 'hc');
  assert.ok(override.at.toMillis() > 0);

  now = new Date(now.getTime() + 60001);
  assert.equal((await jobs.runOnce()).checked, 1, 'chỉ kiểm bài mở lưu giá trị tiếng Việt');
  const legacy = (await db.doc('catalog_items/legacy').get()).data();
  assert.equal(legacy.status, 'removed');
  assert.equal(legacy.moderation.previousStatus, 'available');
  const rechecked = await api.handle('POST', `${base}/item/ai-check`, headers('hc'), {});
  assert.equal(rechecked.body.removed, false);
  const final = (await ref.get()).data();
  assert.equal(final.status, 'available');
  assert.equal(final.moderation.action, 'restore');
  assert.deepEqual(final.aiModeration.staffOverride, override);
  assert.equal(calls, 3);
  assert.deepEqual((await audit.get()).docs.map(doc => doc.data().action).sort(), ['remove', 'restore']);
}));

test('AI tự gỡ đang bật: chỉ ghi nhãn bài đang hẹn, đã trao hoặc kết quả không đủ điều kiện', options, () => fixture(async db => {
  await db.doc('catalog_items/item').delete();
  const cases = [
    ['reserved', 'reserved', severe, { reservedChatId: 'chat-1' }],
    ['reserved-old', 'Đã có người hẹn', severe, { reservedChatId: 'chat-2' }],
    ['completed', 'completed', severe, { donorHandoverConfirmed: true }],
    ['completed-old', 'Đã trao tặng', severe, { donorHandoverConfirmed: true }],
    ['low', 'available', { ...severe, confidence: 0.85 }],
    ['mild', 'available', { ...result(), confidence: 0.99 }],
    ['safe', 'available', result('safe')],
    ['error', 'available', result('error')],
    ['missing-confidence', 'available', { ...severe, confidence: undefined }],
  ];
  const verdicts = new Map(cases.map(([id, , verdict]) => [id, verdict]));
  await Promise.all(cases.map(([id, status, , fields]) =>
    db.doc(`catalog_items/${id}`).set(listing({ title: id, status, ...fields }))));
  const jobs = createAiModerationJobs({ db, autoRemoveConfig,
    moderator: { enabled: true, check: async ({ title }) => verdicts.get(title) },
  });
  assert.equal((await jobs.runOnce()).checked, cases.length);
  for (const [id, status, verdict, fields] of cases) {
    const item = (await db.doc(`catalog_items/${id}`).get()).data();
    assert.equal(item.aiModeration.status, verdict.status, id);
    assert.equal(item.aiModeration.confidence, verdict.confidence ?? 0, id);
    assert.equal(item.status, status, id);
    assert.equal(item.moderation, undefined, id);
    for (const [key, value] of Object.entries(fields || {})) assert.equal(item[key], value, id);
  }
  assert.equal((await db.collection('p2p_listing_audit').get()).size, 0);
}));

test('AI tự gỡ mặc định tắt, dù bài mở có cờ nặng và đủ ngưỡng', options, () => fixture(async db => {
  const jobs = createAiModerationJobs({ db, moderator: { enabled: true, check: async () => severe } });
  const api = apiFor(db, jobs);
  assert.equal((await jobs.runOnce()).checked, 1);
  const item = (await db.doc('catalog_items/item').get()).data();
  assert.equal(item.aiModeration.status, 'flagged');
  assert.equal(item.status, 'available');
  assert.equal(item.moderation, undefined);
  assert.deepEqual((await api.handle('GET', base, headers('hc'), null)).body.aiAutoRemove, { enabled: false, threshold: 0.9 });
}));

test('AI đọc lại trạng thái: bài được hẹn trong lúc chờ model chỉ được gắn cờ', options, () => fixture(async db => {
  const moderator = gateModerator(severe);
  const api = apiFor(db, createAiModerationJobs({ db, moderator, autoRemoveConfig }));
  const ref = db.doc('catalog_items/item');
  const pending = api.handle('POST', `${base}/item/ai-check`, headers('hc'), {});
  await moderator.entered;
  try {
    await ref.update({ status: 'reserved', reservedChatId: 'chat-3' });
  } finally {
    moderator.release();
  }
  assert.equal((await pending).body.removed, false);
  const item = (await ref.get()).data();
  assert.equal(item.status, 'reserved');
  assert.equal(item.reservedChatId, 'chat-3');
  assert.equal(item.aiModeration.status, 'flagged');
  assert.equal((await db.collection('p2p_listing_audit').get()).size, 0);
}));
