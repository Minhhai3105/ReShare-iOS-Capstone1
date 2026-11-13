const { FieldValue } = require('firebase-admin/firestore');
const { runTransaction } = require('./firestore-transaction.cjs');

// Việc dọn ảnh Cloudinary còn dở (hiện dùng khi xoá tài khoản). Public ID được ghi vào
// `image_cleanup_jobs` TRONG CÙNG transaction xoá bài, nên Cloudinary lỗi hay process dừng giữa chừng
// thì vẫn còn bản ghi để thử lại bằng service account, không cần phiên của người đã xoá tài khoản.
// Collection không có match block trong firestore.rules ⇒ client không đọc/ghi được.

const COLLECTION = 'image_cleanup_jobs';

// Chỉ xoá ảnh bài Kho đồ 0đ (prefix catalog_items/), đúng loại delivery 'upload' như image-api.
function cloudinaryCatalogImageDeleter(cloudinary) {
  return async publicId => {
    if (typeof publicId !== 'string' || !publicId.startsWith('catalog_items/')) return;
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'upload', invalidate: true });
    if (!['ok', 'not found'].includes(result.result)) throw new Error('Cloudinary cleanup failed');
  };
}

function createImageCleanupJobs({ db, deleteCatalogImage, batchSize = 20, intervalMs = 15 * 60 * 1000,
  onError = error => console.error('Image cleanup failed:', error.message) }) {
  let timer = null;
  let running = false;

  // Thử xoá từng ảnh; xong hết thì xoá bản ghi, còn sót thì giữ lại phần sót. Trả về số ảnh còn chờ.
  async function processJob(ref) {
    const snapshot = await ref.get();
    if (!snapshot.exists) return 0;
    const publicIds = (snapshot.data().publicIds || []).filter(id => typeof id === 'string');
    if (!deleteCatalogImage) return publicIds.length;
    const done = [];
    for (const publicId of publicIds) {
      try {
        await deleteCatalogImage(publicId);
        done.push(publicId);
      } catch {
        // Giữ lại để lần sau thử tiếp.
      }
    }
    // Đọc lại bản ghi trong transaction trước khi ghi: trong lúc đang gọi Cloudinary, request xoá tài
    // khoản có thể vừa bổ sung ảnh của bài kế tiếp (arrayUnion vào cùng bản ghi). Chỉ bỏ những ảnh đã
    // xoá xong; chỉ xoá bản ghi khi danh sách MỚI thực sự rỗng; số còn chờ tính từ dữ liệu mới.
    // Worker và request cùng xử lý một bản ghi: bên kia đã xoá xong thì bản ghi không còn, trả 0.
    const doneIds = new Set(done);
    return runTransaction(db, async tx => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return 0;
      const left = (fresh.data().publicIds || []).filter(id => typeof id === 'string' && !doneIds.has(id));
      if (left.length === 0) tx.delete(ref);
      else tx.update(ref, { publicIds: left, attempts: FieldValue.increment(1), lastAttemptAt: FieldValue.serverTimestamp() });
      return left.length;
    });
  }

  async function runOnce() {
    if (running) return { skipped: true, jobs: 0, pending: 0 };
    running = true;
    try {
      const snapshot = await db.collection(COLLECTION).limit(batchSize).get();
      let pending = 0;
      for (const doc of snapshot.docs) pending += await processJob(doc.ref);
      return { jobs: snapshot.size, pending };
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer || !deleteCatalogImage) return;
    runOnce().catch(onError);
    timer = setInterval(() => runOnce().catch(onError), intervalMs);
    timer.unref?.();
  }

  return { processJob, runOnce, start, stop() { clearInterval(timer); timer = null; } };
}

module.exports = { COLLECTION, cloudinaryCatalogImageDeleter, createImageCleanupJobs };
