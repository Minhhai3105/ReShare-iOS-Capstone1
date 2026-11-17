const { createHash, randomUUID } = require('node:crypto');
const { ApiError } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');
const { ERROR_REASON, moderationInput } = require('./ai-moderation.cjs');

// Khoá lượt kiểm tra dùng chung giữa nút bấm, job và các process. Collection không có match block
// trong rules nên client không đọc/ghi được; chỉ chứa mã lượt và thời gian, không lưu nội dung bài.
const CHECKS_COLLECTION = 'p2p_ai_checks';
const fingerprint = data => createHash('sha256').update(JSON.stringify(moderationInput(data))).digest('hex');
const millis = value => value?.toMillis?.() ?? new Date(value || 0).getTime();

function createAiModerationJobs({ db, moderator, clock = () => new Date(), intervalMs = 10 * 60 * 1000,
  onError = () => console.error('Không thể hoàn tất lượt kiểm duyệt AI.') }) {
  const enabled = moderator?.enabled === true;
  let timer = null;
  let running = false;
  let cursor = null;

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
      if (onlyUnseen && (data.status !== 'available' || Object.hasOwn(data, 'aiModeration'))) return null;
      const time = clock();
      if ((data.aiModeration?.checkedAt && time.getTime() - millis(data.aiModeration.checkedAt) < 60000)
        || (lease.exists && (time.getTime() - millis(lease.data().lastAttemptAt) < 60000
          || millis(lease.data().expiresAt) > time.getTime()))) {
        throw new ApiError(429, 'AI check was requested recently', 'AI_CHECK_RATE_LIMIT');
      }
      tx.set(lock, { checkId, lastAttemptAt: time, expiresAt: new Date(time.getTime() + 60000) });
      return { data: moderationInput(data), fingerprint: fingerprint(data) };
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

  async function runOnce() {
    if (!enabled || running) return { enabled, skipped: true, checked: 0 };
    running = true;
    try {
      let query = db.collection('catalog_items').where('status', '==', 'available').limit(200);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      const candidates = snapshot.docs.filter(doc => !Object.hasOwn(doc.data(), 'aiModeration'));
      const batch = candidates.slice(0, 10);
      // Chỉ đi qua phần đã xử lý. Lượt sau tiếp tục trang kế, rồi vòng lại để thấy bài mới ở đầu.
      cursor = candidates.length > 10 ? batch.at(-1) : snapshot.size === 200 ? snapshot.docs.at(-1) : null;
      let checked = 0;
      for (const doc of batch) {
        try {
          const result = await checkListing(doc.id, { onlyUnseen: true });
          if (!result.skipped) checked += 1;
        } catch { onError(); }
      }
      return { enabled: true, checked };
    } finally { running = false; }
  }

  function start() {
    if (!enabled || timer) return;
    runOnce().catch(onError);
    timer = setInterval(() => runOnce().catch(onError), intervalMs);
    timer.unref?.();
  }

  return { enabled, checkListing, runOnce, start, stop() { clearInterval(timer); timer = null; } };
}

module.exports = { CHECKS_COLLECTION, createAiModerationJobs };
