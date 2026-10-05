const http = require('node:http');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const cloudinary = require('cloudinary').v2;
const { ApiError, createImageApi } = require('./image-api.cjs');
const { ApiError: ContactApiError, createContactApi } = require('./contact-api.cjs');

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CONTACT_ALLOWED_ORIGIN,
  FIREBASE_PROJECT_ID
} = process.env;
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !FIREBASE_PROJECT_ID) {
  throw new Error('Missing Cloudinary or Firebase environment configuration');
}

initializeApp({ credential: applicationDefault(), projectId: FIREBASE_PROJECT_ID });
cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });

const db = getFirestore();
const verifyToken = token => getAuth().verifyIdToken(token, true);
const api = createImageApi({
  db,
  verifyToken,
  cloudinary,
  cloudName: CLOUDINARY_CLOUD_NAME,
  apiKey: CLOUDINARY_API_KEY,
  apiSecret: CLOUDINARY_API_SECRET
});
const contactApi = createContactApi({
  db,
  verifyToken,
  serverTimestamp: () => FieldValue.serverTimestamp(),
});

const server = http.createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const isContactPath = path === '/v1/contact';
  const origin = request.headers.origin;
  const allowedContactOrigin = CONTACT_ALLOWED_ORIGIN?.trim();
  const corsHeaders = isContactPath && origin && allowedContactOrigin === origin
    ? {
        'Access-Control-Allow-Origin': allowedContactOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        Vary: 'Origin',
      }
    : {};

  try {
    if (isContactPath && request.method === 'OPTIONS') {
      if (!origin || !allowedContactOrigin || allowedContactOrigin !== origin) {
        response.writeHead(403, { 'Cache-Control': 'no-store' });
      } else {
        response.writeHead(204, corsHeaders);
      }
      response.end();
      return;
    }
    if (isContactPath && origin && allowedContactOrigin && origin !== allowedContactOrigin) {
      response.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ message: 'Origin is not allowed' }));
      return;
    }

    let raw = '';
    for await (const chunk of request) {
      raw += chunk;
      const maxBodyBytes = isContactPath ? 32 * 1024 : 8192;
      if (Buffer.byteLength(raw, 'utf8') > maxBodyBytes) throw new ApiError(413, 'Request too large');
    }
    let body = null;
    if (raw) {
      try { body = JSON.parse(raw); }
      catch { throw new ApiError(400, 'Invalid JSON body'); }
    }
    const result = path === '/v1/contact'
      ? await contactApi.handle(request.method, path, request.headers, body)
      : await api.handle(request.method, path, request.headers, body);
    response.writeHead(result.status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    });
    response.end(JSON.stringify(result.body));
  } catch (error) {
    const status = error instanceof ApiError || error instanceof ContactApiError ? error.status : 500;
    if (status === 500) console.error('API failure:', error);
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(isContactPath && origin && allowedContactOrigin === origin ? corsHeaders : {}),
    });
    response.end(JSON.stringify({ message: status === 500 ? 'Internal server error' : error.message }));
  }
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
