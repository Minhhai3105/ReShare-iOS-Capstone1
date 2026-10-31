const http = require('node:http');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const cloudinary = require('cloudinary').v2;
const { ApiError, createImageApi } = require('./image-api.cjs');
const { createStaffApi } = require('./staff-api.cjs');
const { ApiError: ContactApiError, createContactApi } = require('./contact-api.cjs');
const { createDonationReviewApi } = require('./donation-review-api.cjs');
const { createReceiptApi } = require('./receipt-api.cjs');
const { createStockIntakeApi } = require('./stock-intake-api.cjs');
const { createInventoryApi } = require('./inventory-api.cjs');
const { createDistributionApi } = require('./distribution-api.cjs');
const { createReportsApi } = require('./reports-api.cjs');

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
const donationReviewApi = createDonationReviewApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const receiptApi = createReceiptApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const stockIntakeApi = createStockIntakeApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const inventoryApi = createInventoryApi({ db, verifyToken });
const distributionApi = createDistributionApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const reportsApi = createReportsApi({ db, verifyToken, serverTimestamp: () => FieldValue.serverTimestamp() });
const adminWebOrigins = new Set((process.env.ADMIN_WEB_ORIGINS || '')
  .split(',').map(origin => origin.trim()).filter(Boolean));

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const isAdminApi = pathname.startsWith('/v1/admin/');
  const isDonationAdminPath = pathname.startsWith('/v1/admin/donations');
  const isReceiptPath = /^\/v1\/admin\/donations\/[^/]+\/receipt$/.test(pathname);
  const isStockIntakePath = /^\/v1\/admin\/donations\/[^/]+\/stock-in$/.test(pathname) ||
    /^\/v1\/admin\/stock-entries\/[^/]+$/.test(pathname);
  const isInventoryPath = pathname === '/v1/admin/inventory' ||
    /^\/v1\/admin\/inventory\/[^/]+$/.test(pathname);
  // Neo chính xác, KHÔNG dùng startsWith: '/v1/admin/distribution' là tiền tố của
  // '/v1/admin/distributions' (US17), nên startsWith sẽ nuốt route đó và trả 404.
  const isDistributionPath = pathname === '/v1/admin/distribution' ||
    pathname === '/v1/admin/distribution/options';
  const isReportsPath = pathname === '/v1/admin/reports' || pathname === '/v1/admin/reports/';
  const isAdminImageRead = pathname === '/v1/images/read-access';
  const isContactPath = pathname === '/v1/contact';
  const origin = request.headers.origin;
  const allowedAdminOrigin = origin && (adminWebOrigins.has(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(origin));
  const allowedContactOrigin = CONTACT_ALLOWED_ORIGIN?.trim();
  const responseHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (((isAdminApi || isAdminImageRead) && allowedAdminOrigin) || (isContactPath && origin && origin === allowedContactOrigin)) {
    responseHeaders['Access-Control-Allow-Origin'] = origin;
    responseHeaders['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    responseHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    responseHeaders.Vary = 'Origin';
  }

  try {
    if ((isAdminApi || isAdminImageRead) && origin && !allowedAdminOrigin) throw new ApiError(403, 'Origin is not allowed');
    if (isContactPath && origin && allowedContactOrigin && origin !== allowedContactOrigin) {
      throw new ContactApiError(403, 'Origin is not allowed');
    }
    if (isContactPath && request.method === 'OPTIONS' && (!origin || origin !== allowedContactOrigin)) {
      throw new ContactApiError(403, 'Origin is not allowed');
    }
    if ((isAdminApi || isAdminImageRead || isContactPath) && request.method === 'OPTIONS') {
      response.writeHead(204, responseHeaders);
      response.end();
      return;
    }

    let raw = '';
    for await (const chunk of request) {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > (isContactPath ? 32 * 1024 : 8192)) {
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
      : isReceiptPath ? receiptApi
      : isStockIntakePath ? stockIntakeApi
      : isInventoryPath ? inventoryApi
      : isDistributionPath ? distributionApi
      : isReportsPath ? reportsApi
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
    const errBody = { message: status === 500 ? 'Internal server error' : error.message };
    if (error.code) errBody.code = error.code;
    if (error.details) errBody.details = error.details;
    response.end(JSON.stringify(errBody));
  }
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
