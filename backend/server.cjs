const http = require('node:http');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const cloudinary = require('cloudinary').v2;
const { createImageApi } = require('./image-api.cjs');
const { createStaffApi } = require('./staff-api.cjs');
const { createContactApi } = require('./contact-api.cjs');
const { createDonationReviewApi } = require('./donation-review-api.cjs');
const { createReceiptApi } = require('./receipt-api.cjs');
const { createStockIntakeApi } = require('./stock-intake-api.cjs');
const { createInventoryApi } = require('./inventory-api.cjs');
const { createDistributionHistoryApi } = require('./distribution-history-api.cjs');
const { createDistributionApi } = require('./distribution-api.cjs');
const { createReportsApi } = require('./reports-api.cjs');
const { createBeneficiariesApi } = require('./beneficiaries-api.cjs');
const { createDashboardApi } = require('./dashboard-api.cjs');
const { createRequestHandler } = require('./http-handler.cjs');

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CONTACT_ALLOWED_ORIGIN,
  FIREBASE_PROJECT_ID,
} = process.env;
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !FIREBASE_PROJECT_ID) {
  throw new Error('Missing Cloudinary or Firebase environment configuration');
}

initializeApp({ credential: applicationDefault(), projectId: FIREBASE_PROJECT_ID });
cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });

const db = getFirestore();
const verifyToken = token => getAuth().verifyIdToken(token, true);
const api = createImageApi({
  db, verifyToken, cloudinary,
  cloudName: CLOUDINARY_CLOUD_NAME,
  apiKey: CLOUDINARY_API_KEY,
  apiSecret: CLOUDINARY_API_SECRET,
});
const staffApi = createStaffApi({ db, auth: getAuth(), verifyToken });
const contactApi = createContactApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const donationReviewApi = createDonationReviewApi({ db, auth: getAuth(), verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const receiptApi = createReceiptApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const stockIntakeApi = createStockIntakeApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const inventoryApi = createInventoryApi({ db, auth: getAuth(), verifyToken });
const distributionHistoryApi = createDistributionHistoryApi({ db, auth: getAuth(), verifyToken });
const distributionApi = createDistributionApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const reportsApi = createReportsApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const beneficiariesApi = createBeneficiariesApi({ db, auth: getAuth(), verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const dashboardApi = createDashboardApi({ db, verifyToken });
const adminWebOrigins = new Set((process.env.ADMIN_WEB_ORIGINS || '')
  .split(',').map(origin => origin.trim()).filter(Boolean));

function resolveHandler(pathname) {
  const isAdminApi = pathname.startsWith('/v1/admin/');
  const isContactPath = pathname === '/v1/contact';
  const isDonationAdminPath = pathname.startsWith('/v1/admin/donations');
  const isReceiptPath = /^\/v1\/admin\/donations\/[^/]+\/receipt$/.test(pathname);
  const isStockIntakePath = /^\/v1\/admin\/donations\/[^/]+\/stock-in$/.test(pathname) ||
    /^\/v1\/admin\/stock-entries\/[^/]+$/.test(pathname);
  const isInventoryPath = pathname === '/v1/admin/inventory' ||
    /^\/v1\/admin\/inventory\/[^/]+$/.test(pathname);
  // Đặt tên theo đúng handler: US17 đọc lịch sử ở /distributions (số nhiều), còn
  // US16 ghi phiếu ở /distribution (số ít, PR #49). Hai thứ khác nhau nên không
  // dùng chung tên isDistributionPath, tránh resolve conflict sai khi gộp.
  const isDistributionHistoryPath = pathname === '/v1/admin/distributions' ||
    /^\/v1\/admin\/distributions\/[^/]+$/.test(pathname);
  // Neo chính xác, KHÔNG dùng startsWith: '/v1/admin/distribution' là tiền tố của
  // '/v1/admin/distributions' (US17), nên startsWith sẽ nuốt route đó và trả 404.
  const isDistributionPath = pathname === '/v1/admin/distribution' ||
    pathname === '/v1/admin/distribution/options';
  const isReportsPath = pathname === '/v1/admin/reports' || pathname === '/v1/admin/reports/';
  // Cũng neo chính xác thay vì startsWith, để sau này thêm route có tiền tố trùng
  // (ví dụ '/v1/admin/beneficiaries-export') thì không bị nuốt như đã xảy ra với distribution.
  const isBeneficiaryPath = pathname === '/v1/admin/beneficiaries' ||
    /^\/v1\/admin\/beneficiaries\/[^/]+(\/(audit|update|verify))?$/.test(pathname);
  const isDashboardPath = pathname === '/v1/admin/dashboard/metrics';
  // Thứ tự quan trọng: receipt và stock-in là path con của /v1/admin/donations nên
  // phải đứng trước isDonationAdminPath; isAdminApi là nhánh bắt tất cả cuối cùng.
  return isContactPath ? contactApi
    : isReceiptPath ? receiptApi
    : isStockIntakePath ? stockIntakeApi
    : isInventoryPath ? inventoryApi
    : isDistributionHistoryPath ? distributionHistoryApi
    : isDistributionPath ? distributionApi
    : isReportsPath ? reportsApi
    : isBeneficiaryPath ? beneficiariesApi
    : isDashboardPath ? dashboardApi
    : isDonationAdminPath ? donationReviewApi
    : isAdminApi ? staffApi
    : api;
}

const production = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const server = http.createServer(createRequestHandler({
  resolveHandler, adminWebOrigins, contactAllowedOrigin: CONTACT_ALLOWED_ORIGIN?.trim(),
  allowLocalOrigins: !production,
}));
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
