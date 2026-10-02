const http = require('node:http');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const cloudinary = require('cloudinary').v2;
const { ApiError, createImageApi } = require('./image-api.cjs');

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, FIREBASE_PROJECT_ID } = process.env;
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !FIREBASE_PROJECT_ID) {
  throw new Error('Missing Cloudinary or Firebase environment configuration');
}

initializeApp({ credential: applicationDefault(), projectId: FIREBASE_PROJECT_ID });
cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });

const api = createImageApi({
  db: getFirestore(),
  verifyToken: token => getAuth().verifyIdToken(token, true),
  cloudinary,
  cloudName: CLOUDINARY_CLOUD_NAME,
  apiKey: CLOUDINARY_API_KEY,
  apiSecret: CLOUDINARY_API_SECRET
});

const server = http.createServer(async (request, response) => {
  try {
    let raw = '';
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 8192) throw new ApiError(413, 'Request too large');
    }
    let body = null;
    if (raw) {
      try { body = JSON.parse(raw); }
      catch { throw new ApiError(400, 'Invalid JSON body'); }
    }
    const result = await api.handle(request.method, new URL(request.url, 'http://localhost').pathname, request.headers, body);
    response.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(result.body));
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status === 500) console.error('Image API failure:', error);
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ message: status === 500 ? 'Internal server error' : error.message }));
  }
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
