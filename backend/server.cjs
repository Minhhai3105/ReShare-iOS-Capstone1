const http = require('node:http');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const cloudinary = require('cloudinary').v2;
const { ApiError, createImageApi } = require('./image-api.cjs');
const { createStaffApi } = require('./staff-api.cjs');
const { ApiError: ContactApiError, createContactApi } = require('./contact-api.cjs');
const { createDonationReviewApi } = require('./donation-review-api.cjs');
const { createDonationResubmitApi } = require('./donation-resubmit-api.cjs');
const { createReceiptApi } = require('./receipt-api.cjs');
const { createStockIntakeApi } = require('./stock-intake-api.cjs');
const { createInventoryApi } = require('./inventory-api.cjs');
const { createInventoryEvents } = require('./inventory-events.cjs');
const { createDistributionHistoryApi } = require('./distribution-history-api.cjs');
const { createDistributionApi } = require('./distribution-api.cjs');
const { createReportsApi } = require('./reports-api.cjs');
const { createBeneficiariesApi } = require('./beneficiaries-api.cjs');
const { createDashboardApi } = require('./dashboard-api.cjs');
const { createCampaignsApi } = require('./campaigns-api.cjs');
const { createAccountApi } = require('./account-api.cjs');
const { cloudinaryCatalogImageDeleter, createImageCleanupJobs } = require('./image-cleanup-jobs.cjs');
const { errorBody } = require('./error-body.cjs');
const { createReservationExpiry } = require('./p2p-reservation-expiry.cjs');

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
const donationResubmitApi = createDonationResubmitApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const receiptApi = createReceiptApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const stockIntakeApi = createStockIntakeApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const inventoryApi = createInventoryApi({ db, auth: getAuth(), verifyToken });
const inventoryEvents = createInventoryEvents({ db, verifyToken });
const distributionHistoryApi = createDistributionHistoryApi({ db, auth: getAuth(), verifyToken });
const distributionApi = createDistributionApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const reportsApi = createReportsApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const beneficiariesApi = createBeneficiariesApi({ db, auth: getAuth(), verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const dashboardApi = createDashboardApi({ db, verifyToken });
const campaignsApi = createCampaignsApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const deleteCatalogImage = cloudinaryCatalogImageDeleter(cloudinary);
const accountApi = createAccountApi({ db, auth: getAuth(), verifyToken, deleteCatalogImage });
const adminWebOrigins = new Set((process.env.ADMIN_WEB_ORIGINS || '')
  .split(',').map(origin => origin.trim()).filter(Boolean));

const server = http.createServer(async (request, response) => {
  let pathname;
  try {
    pathname = new URL(request.url, 'http://localhost').pathname;
  } catch {
    response.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ message: 'Invalid request URL' }));
    return;
  }
  const isAdminApi = pathname.startsWith('/v1/admin/');
  const isDonationAdminPath = pathname.startsWith('/v1/admin/donations');
  const isDonationResubmitPath = /^\/v1\/donations\/[^/]+\/resubmit$/.test(pathname);
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
  // Neo chính xác như beneficiaries để route có tiền tố trùng sau này không bị nuốt.
  const isCampaignPath = pathname === '/v1/admin/campaigns' ||
    /^\/v1\/admin\/campaigns\/[^/]+(\/(update|status))?$/.test(pathname);
  const isAdminImageRead = pathname === '/v1/images/read-access';
  const isContactPath = pathname === '/v1/contact';
  const isAccountPath = pathname === '/v1/account/delete';
  const origin = request.headers.origin;
  const allowedAdminOrigin = origin && (adminWebOrigins.has(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(origin));
  const allowedContactOrigin = CONTACT_ALLOWED_ORIGIN?.trim();
  // /v1/contact phục vụ cả form landing (POST) lẫn hộp thư của System Admin trên Web Admin (GET),
  // nên nhận origin của landing và các origin quản trị. Đọc hộp thư vẫn bắt buộc token System Admin.
  const contactOriginAllowed = Boolean(origin) && (origin === allowedContactOrigin || allowedAdminOrigin);
  const responseHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (((isAdminApi || isAdminImageRead) && allowedAdminOrigin) || (isContactPath && contactOriginAllowed)) {
    responseHeaders['Access-Control-Allow-Origin'] = origin;
    responseHeaders['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    responseHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    responseHeaders.Vary = 'Origin';
  }

  try {
    if ((isAdminApi || isAdminImageRead) && origin && !allowedAdminOrigin) throw new ApiError(403, 'Origin is not allowed');
    if (isContactPath && origin && allowedContactOrigin && !contactOriginAllowed) {
      throw new ContactApiError(403, 'Origin is not allowed');
    }
    if (isContactPath && request.method === 'OPTIONS' && !contactOriginAllowed) {
      throw new ContactApiError(403, 'Origin is not allowed');
    }
    if ((isAdminApi || isAdminImageRead || isContactPath) && request.method === 'OPTIONS') {
      response.writeHead(204, responseHeaders);
      response.end();
      return;
    }
    if (request.method === 'GET' && pathname === '/v1/admin/inventory/events') {
      await inventoryEvents.open(request, response, responseHeaders);
      return;
    }

    let raw = '';
    for await (const chunk of request) {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > ((isContactPath || isDonationResubmitPath) ? 32 * 1024 : 8192)) {
        throw new ApiError(413, 'Request too large');
      }
    }
    let body = null;
    if (raw) {
      try { body = JSON.parse(raw); }
      catch { throw new ApiError(400, 'Invalid JSON body'); }
    }
    // Thứ tự quan trọng: receipt và stock-in là path con của /v1/admin/donations nên
    // phải đứng trước isDonationAdminPath; isAdminApi là nhánh bắt tất cả cuối cùng.
    const handler = isContactPath ? contactApi
      : isDonationResubmitPath ? donationResubmitApi
      : isAccountPath ? accountApi
      : isReceiptPath ? receiptApi
      : isStockIntakePath ? stockIntakeApi
      : isInventoryPath ? inventoryApi
      : isDistributionHistoryPath ? distributionHistoryApi
      : isDistributionPath ? distributionApi
      : isReportsPath ? reportsApi
      : isBeneficiaryPath ? beneficiariesApi
      : isDashboardPath ? dashboardApi
      : isCampaignPath ? campaignsApi
      : isDonationAdminPath ? donationReviewApi
      : isAdminApi ? staffApi
      : api;
    const result = await handler.handle(request.method, pathname, request.headers, body, request.url);
    response.writeHead(result.status, responseHeaders);
    response.end(JSON.stringify(result.body));
  } catch (error) {
    const status = error instanceof ApiError || error instanceof ContactApiError ? error.status : 500;
    if (status === 500) console.error('ReShare API failure:', error);
    response.writeHead(status, responseHeaders);
    response.end(JSON.stringify(errorBody(error, status)));
  }
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
// Chỉ chạy khi backend được vận hành; cold start/sleep phải được kiểm chứng ở môi trường demo.
const reservationExpiry = createReservationExpiry({ db });
reservationExpiry.start();
// Dọn tiếp ảnh Cloudinary còn sót sau khi xoá tài khoản (mỗi 15 phút khi server đang chạy).
const imageCleanupJobs = createImageCleanupJobs({ db, deleteCatalogImage });
imageCleanupJobs.start();
server.on('close', () => { reservationExpiry.stop(); imageCleanupJobs.stop(); });
