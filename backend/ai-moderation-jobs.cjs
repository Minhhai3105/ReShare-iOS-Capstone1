const { createHash, randomUUID } = require('node:crypto');
const { ApiError } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');
const { ERROR_REASON, moderationInput } = require('./ai-moderation.cjs');

// Khoá lượt kiểm tra dùng chung giữa nút bấm, job và các process. Collection không có match block
// trong rules nên client không đọc/ghi được; chỉ chứa mã lượt và thời gian, không lưu nội dung bài.
const CHECKS_COLLECTION = 'p2p_ai_checks';
const ERROR_RETRY_DELAYS_MS = [120000, 600000, 1800000, 3600000];
const COOLDOWN_MS = 60000;
const LISTENER_RETRY_MS = 30000;
const BACKGROUND_STATUSES = ['available', 'Sẵn sàng nhận đồ', 'completed'];
const DEFAULT_CONFIG = { batchSize: 30, concurrency: 3, intervalMs: 180000, timeoutMs: 15000 };
const fingerprint = data => createHash('sha256').update(JSON.stringify(moderationInput(data))).digest('hex');
const millis = value => value?.toMillis?.() ?? new Date(value || 0).getTime();

function boundedInteger(value, fallback, min, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^[+-]?\d+$/.test(text)) return fallback;
  return Math.min(max, Math.max(min, Number(text)));
}

function readAiModerationConfig(env) {
  return {
    batchSize: boundedInteger(env.AI_MODERATION_BATCH_SIZE, DEFAULT_CONFIG.batchSize, 1, 50),
    concurrency: boundedInteger(env.AI_MODERATION_CONCURRENCY, DEFAULT_CONFIG.concurrency, 1, 5),
    intervalMs: boundedInteger(env.AI_MODERATION_INTERVAL_MS, DEFAULT_CONFIG.intervalMs, 60000, 3600000),
    timeoutMs: boundedInteger(env.AI_MODERATION_TIMEOUT_MS, DEFAULT_CONFIG.timeoutMs, 5000, 120000),
  };
}

function consecutiveErrors(label) {
  if (label?.status !== 'error') return 0;
  // Nhãn lỗi tạo trước khi có errorCount được tính là một lần lỗi.
  const count = label.errorCount;
  return Number.isSafeInteger(count) && count > 0 ? count : 1;
}

function needsBackgroundCheck(data, time) {
  if (!Object.hasOwn(data, 'aiModeration')) return true;
  const label = data.aiModeration;
  const errors = consecutiveErrors(label);
  if (!errors || label.checkedAt == null || label.checkedAt === '') return false;
  const checkedAt = millis(label.checkedAt);
  const delay = ERROR_RETRY_DELAYS_MS[Math.min(errors, ERROR_RETRY_DELAYS_MS.length) - 1];
  return Number.isFinite(checkedAt) && time.getTime() - checkedAt >= delay;
}

function createAiModerationJobs({ db, moderator, clock = () => new Date(),
  batchSize = DEFAULT_CONFIG.batchSize, concurrency = DEFAULT_CONFIG.concurrency,
  intervalMs = DEFAULT_CONFIG.intervalMs, timeoutMs = DEFAULT_CONFIG.timeoutMs,
  onError = () => console.error('Không thể hoàn tất lượt kiểm duyệt AI.') }) {
  const enabled = moderator?.enabled === true;
  // Khóa phải bao phủ timeout gửi model, tối đa 10 giây tải ảnh song song và phần đệm để ghi nhãn.
  const leaseMs = Math.max(COOLDOWN_MS, timeoutMs + 20000);
  const pending = [];
  const queuedIds = new Set();
  let active = 0;
  let timer = null;
  let scanning = false;
  let stopped = false;
  let generation = 0;
  let listener = null;
  let retryTimer = null;
  const backgroundQuery = () => db.collection('catalog_items').where('status', 'in', BACKGROUND_STATUSES);

  async function checkListing(id, { authorize = async () => {}, onlyUnseen = false } = {}) {
    if (!enabled) return { enabled: false, aiEnabled: false, aiModeration: null };
    const ref = db.collection('catalog_items').doc(id);
    const lock = db.collection(CHECKS_COLLECTION).doc(id);
    const checkId = randomUUID();
    const input = await runTransaction(db, async tx => {
      const doc = await tx.get(ref);
      const lease = await tx.get(lock);
      if (!doc.exists) throw new ApiError(404, 'Listing not found');
      const data = doc.data();
      await authorize(tx, data);
      const time = clock();
      if (onlyUnseen && (!BACKGROUND_STATUSES.includes(data.status) || !needsBackgroundCheck(data, time))) return null;
      if ((data.aiModeration?.checkedAt && time.getTime() - millis(data.aiModeration.checkedAt) < COOLDOWN_MS)
        || (lease.exists && (time.getTime() - millis(lease.data().lastAttemptAt) < COOLDOWN_MS
          || millis(lease.data().expiresAt) > time.getTime()))) {
        throw new ApiError(429, 'AI check was requested recently', 'AI_CHECK_RATE_LIMIT');
      }
      tx.set(lock, { checkId, lastAttemptAt: time, expiresAt: new Date(time.getTime() + leaseMs) });
      return { data: moderationInput(data), fingerprint: fingerprint(data), errors: consecutiveErrors(data.aiModeration) };
    });
    if (!input) return { enabled: true, skipped: true };
    try {
      let result;
      try { result = await moderator.check(input.data); }
      catch { result = { status: 'error', categories: [], reason: ERROR_REASON, model: null }; }
      const aiModeration = {
        status: result.status, categories: result.categories, reason: result.reason, model: result.model,
        checkedAt: clock(),
      };
      if (result.status === 'error') aiModeration.errorCount = Math.min(input.errors + 1, Number.MAX_SAFE_INTEGER);
      await runTransaction(db, async tx => {
        const doc = await tx.get(ref);
        const lease = await tx.get(lock);
        if (!doc.exists) throw new ApiError(404, 'Listing not found');
        const data = doc.data();
        // Quyền/quận có thể đổi trong lúc chờ AI: đọc lại trước khi ghi kết quả.
        await authorize(tx, data);
        if (!lease.exists || lease.data().checkId !== checkId || fingerprint(data) !== input.fingerprint) {
          throw new ApiError(409, 'Listing content changed; check again', 'AI_CONTENT_CHANGED');
        }
        // Chỉ cập nhật nhãn; không ghi status, moderation hoặc bất kỳ quyết định nghiệp vụ nào.
        tx.update(ref, { aiModeration });
      });
      return { enabled: true, aiEnabled: true, aiModeration: { ...aiModeration, checkedAt: aiModeration.checkedAt.toISOString() } };
    } finally {
      await runTransaction(db, async tx => {
        const lease = await tx.get(lock);
        if (lease.exists && lease.data().checkId === checkId) tx.update(lock, { checkId: null, expiresAt: clock() });
      }).catch(onError);
    }
  }

  function drain() {
    while (!stopped && active < concurrency && pending.length) {
      const item = pending.shift();
      active += 1;
      processQueued(item);
    }
  }

  async function processQueued({ id, resolve }) {
    let checked = false;
    try {
      const result = await checkListing(id, { onlyUnseen: true });
      checked = !result.skipped;
    } catch {
      onError();
    } finally {
      active -= 1;
      queuedIds.delete(id);
      resolve(checked);
      drain();
    }
  }

  function enqueue(docs, limit = docs.length) {
    const time = clock();
    const candidates = docs.map(doc => {
      const data = doc.data();
      const createdAt = millis(data.createdAt);
      return { id: doc.id, data, createdAt: Number.isFinite(createdAt) ? createdAt : 0 };
    }).sort((a, b) => b.createdAt - a.createdAt);
    const results = [];
    for (const { id, data, createdAt } of candidates) {
      if (results.length >= limit) break;
      if (queuedIds.has(id) || !BACKGROUND_STATUSES.includes(data.status) || !needsBackgroundCheck(data, time)) continue;
      const { promise, resolve } = Promise.withResolvers();
      queuedIds.add(id);
      pending.push({ id, createdAt, resolve });
      results.push(promise);
    }
    // Bài mới từ listener có thể đi trước các bài cũ còn chờ trong hàng.
    if (results.length) pending.sort((a, b) => b.createdAt - a.createdAt);
    drain();
    return results;
  }

  async function runOnce() {
    if (!enabled || stopped || scanning) return { enabled, skipped: true, checked: 0 };
    scanning = true;
    const currentGeneration = generation;
    try {
      // Lượt quét chỉ xét 500 bài đầu trả về từ Firestore, dù có nhiều bài đủ trạng thái hơn.
      const snapshot = await backgroundQuery().limit(500).get();
      if (stopped || generation !== currentGeneration) return { enabled, skipped: true, checked: 0 };
      const outcomes = await Promise.all(enqueue(snapshot.docs, batchSize));
      return { enabled: true, checked: outcomes.filter(Boolean).length };
    } finally { scanning = false; }
  }

  function listen() {
    const subscription = {};
    listener = subscription;
    const retry = () => {
      if (stopped || listener !== subscription) return;
      listener = null;
      subscription.unsubscribe?.();
      onError();
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!stopped) listen();
      }, LISTENER_RETRY_MS);
      retryTimer.unref?.();
    };
    try {
      subscription.unsubscribe = backgroundQuery().onSnapshot(snapshot => {
        if (stopped || listener !== subscription) return;
        const docs = snapshot.docChanges()
          .filter(change => change.type === 'added' || change.type === 'modified')
          .map(change => change.doc);
        enqueue(docs);
      }, retry);
    } catch {
      retry();
    }
  }

  function start() {
    if (!enabled || timer) return;
    stopped = false;
    listen();
    runOnce().catch(onError);
    timer = setInterval(() => runOnce().catch(onError), intervalMs);
    timer.unref?.();
  }

  function stop() {
    stopped = true;
    generation += 1;
    clearInterval(timer);
    timer = null;
    clearTimeout(retryTimer);
    retryTimer = null;
    const subscription = listener;
    listener = null;
    subscription?.unsubscribe?.();
    // Chỉ bỏ bài đang chờ. Lượt đã chạy ghi kết quả và nhả khoá như bình thường.
    for (const { id, resolve } of pending.splice(0)) {
      queuedIds.delete(id);
      resolve(false);
    }
  }

  return { enabled, checkListing, runOnce, start, stop };
}

module.exports = { CHECKS_COLLECTION, createAiModerationJobs, needsBackgroundCheck, readAiModerationConfig };
