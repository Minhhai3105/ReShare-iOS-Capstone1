const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiModerationJobs, needsBackgroundCheck, readAiModerationConfig } = require('../ai-moderation-jobs.cjs');

test('Cấu hình job AI: mặc định, kẹp hai biên và từ chối chuỗi sai', () => {
  const defaults = { batchSize: 30, concurrency: 3, intervalMs: 180000, timeoutMs: 15000 };
  function read(batch, concurrency, interval, timeout) {
    return readAiModerationConfig({
      AI_MODERATION_BATCH_SIZE: batch, AI_MODERATION_CONCURRENCY: concurrency,
      AI_MODERATION_INTERVAL_MS: interval, AI_MODERATION_TIMEOUT_MS: timeout,
    });
  }
  assert.deepEqual(readAiModerationConfig({}), defaults);
  assert.deepEqual(read('', '2.5', '60000ms', 'NaN'), defaults);
  assert.deepEqual(read('0', '-1', '59999', '4999'), { batchSize: 1, concurrency: 1, intervalMs: 60000, timeoutMs: 5000 });
  assert.deepEqual(read('51', '6', '3600001', '120001'), { batchSize: 50, concurrency: 5, intervalMs: 3600000, timeoutMs: 120000 });
  assert.deepEqual(read(' 40 ', '4', '90000', '45000'), { batchSize: 40, concurrency: 4, intervalMs: 90000, timeoutMs: 45000 });
});

function listingStore(listings) {
  const records = new Map(listings.map(([id, data]) => [`catalog_items/${id}`, data]));
  let listener;
  let subscriptions = 0;
  function snapshot(path) {
    return { id: path.split('/').at(-1), exists: records.has(path), data: () => records.get(path) };
  }
  return {
    collection(name) {
      return {
        doc: id => `${name}/${id}`,
        where(field, operator, statuses) {
          assert.equal(name, 'catalog_items');
          assert.equal(field, 'status');
          assert.equal(operator, 'in');
          assert.deepEqual(statuses, ['available', 'Sẵn sàng nhận đồ', 'completed']);
          return { limit(max) {
            assert.equal(max, 500);
            return { get: async () => ({
              docs: [...records.keys()].filter(path => path.startsWith('catalog_items/')
                && statuses.includes(records.get(path).status)).slice(0, max).map(snapshot),
            }) };
          }, onSnapshot(receive, onError) {
            subscriptions += 1;
            const subscription = { receive, onError };
            listener = subscription;
            return () => { if (listener === subscription) listener = null; };
          } };
        },
      };
    },
    runTransaction: async run => run({
      get: async path => snapshot(path),
      set: (path, data) => records.set(path, data),
      update: (path, data) => records.set(path, { ...records.get(path), ...data }),
    }),
    data: id => records.get(`catalog_items/${id}`),
    emit(changes) {
      listener?.receive({ docChanges: () => changes.map(([type, id]) => ({ type, doc: snapshot(`catalog_items/${id}`) })) });
    },
    failListener: () => listener.onError(new Error('Lỗi thử nghiệm')),
    get listening() { return Boolean(listener); },
    get subscriptions() { return subscriptions; },
  };
}

const listing = (title, createdAt, extra) => ({ title, createdAt, status: 'available', ...extra });
const safe = { status: 'safe', categories: [], reason: 'Nội dung phù hợp', model: 'test' };

test('AI kiểm duyệt nền: thiếu cấu hình không đọc DB, không tạo timer hoặc gọi dịch vụ', async () => {
  const jobs = createAiModerationJobs({ db: { collection() { assert.fail('không được đọc DB'); } }, moderator: { enabled: false } });
  jobs.start();
  assert.deepEqual(await jobs.runOnce(), { enabled: false, skipped: true, checked: 0 });
  assert.equal((await jobs.checkListing('item')).enabled, false);
  jobs.stop();
});

test('AI kiểm duyệt nền: ưu tiên createdAt mới nhất và dừng ở batchSize', async () => {
  const db = listingStore([
    ['a-old', listing('Cũ', new Date('2026-11-16'))],
    ['b-checked', listing('Đã kiểm', new Date('2026-11-19'), { aiModeration: safe })],
    ['c-mid', listing('Giữa', '2026-11-17T00:00:00Z')],
    ['d-new', listing('Mới', { toMillis: () => Date.parse('2026-11-18') })],
    ['e-invalid', listing('Ngày sai', 'ngày không hợp lệ')],
  ]);
  const calls = [];
  const jobs = createAiModerationJobs({ db, batchSize: 2, concurrency: 1,
    moderator: { enabled: true, check: async input => { calls.push(input.title); return safe; } } });
  assert.equal((await jobs.runOnce()).checked, 2);
  assert.deepEqual(calls, ['Mới', 'Giữa']);
  assert.equal(db.data('a-old').aiModeration, undefined);
  assert.equal(db.data('e-invalid').aiModeration, undefined);
});

test('AI kiểm duyệt nền: giới hạn song song và tiếp tục sau lỗi của một bài', async () => {
  const db = listingStore(Array.from({ length: 8 }, (_, i) => [String(i), listing(String(i), i + 1)]));
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const jobs = createAiModerationJobs({ db, concurrency: 2, moderator: { enabled: true, async check({ title }) {
    calls.push(title);
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      await new Promise(resolve => setImmediate(resolve));
      if (title === '7') throw new Error('Lỗi kiểm tra thử nghiệm');
      return safe;
    } finally { active -= 1; }
  } } });
  const first = jobs.runOnce();
  assert.deepEqual(await jobs.runOnce(), { enabled: true, skipped: true, checked: 0 });
  assert.equal((await first).checked, 8);
  assert.equal(maxActive, 2);
  assert.equal(new Set(calls).size, 8);
  assert.equal(db.data('7').aiModeration.status, 'error');
  assert.equal(db.data('7').status, 'available');
  assert.equal(db.data('0').aiModeration.status, 'safe');
});

test('Lượt quét bù: 100 bài mới được kiểm qua 4 lượt với cấu hình mặc định', async () => {
  const db = listingStore(Array.from({ length: 100 }, (_, i) => [String(i), listing(String(i), i + 1)]));
  const jobs = createAiModerationJobs({ db, moderator: { enabled: true, check: async () => safe } });
  const checked = [];
  for (let i = 0; i < 5; i += 1) checked.push((await jobs.runOnce()).checked);
  assert.deepEqual(checked, [30, 30, 30, 10, 0]);
});

test('AI kiểm duyệt nền: thử lại lỗi ở đúng mốc 2, 10, 30 và 60 phút', () => {
  const checkedAt = new Date('2026-11-17T10:00:00Z');
  for (const [errorCount, minutes] of [[undefined, 2], [1, 2], [2, 10], [3, 30], [4, 60], [8, 60]]) {
    const data = { aiModeration: { status: 'error', checkedAt, errorCount } };
    const due = checkedAt.getTime() + minutes * 60000;
    assert.equal(needsBackgroundCheck(data, new Date(due - 1)), false, `lỗi lần ${errorCount}`);
    assert.equal(needsBackgroundCheck(data, new Date(due)), true, `lỗi lần ${errorCount}`);
  }
  assert.equal(needsBackgroundCheck({ aiModeration: { status: 'safe', checkedAt } }, new Date()), false);
  assert.equal(needsBackgroundCheck({ aiModeration: { status: 'flagged', checkedAt } }, new Date()), false);
});

test('AI kiểm duyệt nền: lỗi liên tiếp tăng errorCount, thành công xoá errorCount', async () => {
  const db = listingStore([['item', listing('Bài thử', 1)]]);
  let now = new Date('2026-11-17T10:00:00Z');
  let calls = 0;
  const jobs = createAiModerationJobs({ db, clock: () => now, moderator: {
    enabled: true, check: async () => (++calls < 3 ? { ...safe, status: 'error' } : safe),
  } });
  assert.equal((await jobs.runOnce()).checked, 1);
  assert.equal(db.data('item').aiModeration.errorCount, 1);
  now = new Date(now.getTime() + 120000);
  assert.equal((await jobs.runOnce()).checked, 1);
  assert.equal(db.data('item').aiModeration.errorCount, 2);
  now = new Date(now.getTime() + 600000);
  assert.equal((await jobs.runOnce()).checked, 1);
  assert.equal(db.data('item').aiModeration.status, 'safe');
  assert.equal(Object.hasOwn(db.data('item').aiModeration, 'errorCount'), false);
});

test('AI kiểm duyệt nền: tự kiểm completed, bỏ removed và bài đã có nhãn', async () => {
  const db = listingStore([
    ['completed', listing('Đã trao', 3, { status: 'completed' })],
    ['removed', listing('Đã gỡ', 2, { status: 'removed' })],
    ['safe', listing('Đã có nhãn', 1, { status: 'completed', aiModeration: safe })],
  ]);
  const calls = [];
  const jobs = createAiModerationJobs({ db, moderator: {
    enabled: true, check: async ({ title }) => { calls.push(title); return safe; },
  } });
  await jobs.runOnce();
  assert.deepEqual(calls, ['Đã trao']);
  assert.equal(db.data('completed').status, 'completed');
  assert.equal(db.data('completed').aiModeration.status, 'safe');
  assert.equal(db.data('removed').aiModeration, undefined);
});

test('Listener và lượt quét dùng chung hàng đợi, bỏ trùng cả bài đang chạy', { timeout: 3000 }, async t => {
  const listings = ['a', 'b', 'c', 'd'].map((id, i) => [id, listing(id, i + 1)]);
  const db = listingStore(listings);
  const started = Promise.withResolvers();
  const finished = Promise.withResolvers();
  const gate = Promise.withResolvers();
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const jobs = createAiModerationJobs({ db, batchSize: 1, concurrency: 2, moderator: {
    enabled: true, async check({ title }) {
      calls.push(title);
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (calls.length === 2) started.resolve();
      await gate.promise;
      active -= 1;
      if (calls.length === 4 && active === 0) finished.resolve();
      return safe;
    },
  } });
  t.after(() => { jobs.stop(); gate.resolve(); });
  jobs.start();
  // Để lần quét đưa d vào trước khi listener phát lại d cùng ba bài khác.
  await new Promise(resolve => setImmediate(resolve));
  db.emit(listings.map(([id]) => ['added', id]));
  await started.promise;
  db.emit(listings.map(([id]) => ['modified', id]));
  gate.resolve();
  await finished.promise;
  assert.equal(maxActive, 2);
  assert.deepEqual(calls, ['d', 'c', 'b', 'a']);
});

test('Dừng job huỷ listener và bỏ bài còn chờ', { timeout: 3000 }, async t => {
  const db = listingStore([['a', listing('a', 2)], ['b', listing('b', 1)]]);
  const started = Promise.withResolvers();
  const gate = Promise.withResolvers();
  const calls = [];
  const jobs = createAiModerationJobs({ db, concurrency: 1, moderator: { enabled: true, async check({ title }) {
    calls.push(title);
    started.resolve();
    await gate.promise;
    return safe;
  } } });
  t.after(() => { jobs.stop(); gate.resolve(); });
  jobs.start();
  db.emit([['added', 'a'], ['added', 'b']]);
  await started.promise;
  jobs.stop();
  assert.equal(db.listening, false);
  gate.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['a']);
  assert.equal(db.data('a').aiModeration.status, 'safe');
  assert.equal(db.data('b').aiModeration, undefined);
  assert.equal((await jobs.runOnce()).skipped, true);
});

test('Listener thử mở lại sau 30 giây, stop huỷ lịch mở lại', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const db = listingStore([]);
  let errors = 0;
  const jobs = createAiModerationJobs({ db, moderator: { enabled: true }, onError: () => { errors += 1; } });
  t.after(() => jobs.stop());
  jobs.start();
  db.failListener();
  assert.equal(errors, 1);
  assert.equal(db.listening, false);
  t.mock.timers.tick(29999);
  assert.equal(db.subscriptions, 1);
  t.mock.timers.tick(1);
  assert.equal(db.subscriptions, 2);
  db.failListener();
  jobs.stop();
  t.mock.timers.tick(30000);
  assert.equal(db.subscriptions, 2);
});
