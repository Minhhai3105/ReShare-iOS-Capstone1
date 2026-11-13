// Chạy tay việc dọn ảnh Cloudinary còn sót (image_cleanup_jobs), bằng service account — không cần
// tài khoản của người đã xoá. Server cũng tự chạy việc này mỗi 15 phút khi đang hoạt động.
//
// Chạy:  FIREBASE_PROJECT_ID=<project> GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
//        CLOUDINARY_CLOUD_NAME=… CLOUDINARY_API_KEY=… CLOUDINARY_API_SECRET=… \
//        node scripts/retry-image-cleanup.cjs [--dry-run]
//
// --dry-run chỉ đếm số bản ghi và số ảnh đang chờ, không gọi Cloudinary.
const { cloudinaryCatalogImageDeleter, createImageCleanupJobs, COLLECTION } = require('../image-cleanup-jobs.cjs');

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();

  if (process.argv.includes('--dry-run')) {
    const snapshot = await db.collection(COLLECTION).limit(500).get();
    const images = snapshot.docs.reduce((total, doc) => total + (doc.data().publicIds || []).length, 0);
    console.log(`Đang chờ: ${snapshot.size} bản ghi, ${images} ảnh.`);
    return;
  }

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) throw new Error('Cloudinary configuration is required');
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
  const jobs = createImageCleanupJobs({ db, deleteCatalogImage: cloudinaryCatalogImageDeleter(cloudinary), batchSize: 100 });
  const result = await jobs.runOnce();
  console.log(`Đã xử lý ${result.jobs} bản ghi; còn ${result.pending} ảnh chờ lần sau.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
