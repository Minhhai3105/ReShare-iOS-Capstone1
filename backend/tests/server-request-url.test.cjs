const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const vm = require('node:vm');
const { ApiError } = require('../image-api.cjs');
const { errorBody } = require('../error-body.cjs');

// Load the real entry point with external services replaced; no credentials or port needed.
function loadHandler() {
  let handler;
  const api = { handle: async (_method, path) => ({ status: 200, body: { path } }) };
  const factories = new Proxy({ ApiError }, { get: (target, key) => target[key] || (() => api) });
  vm.runInNewContext(readFileSync(join(__dirname, '../server.cjs'), 'utf8'), {
    URL, Buffer, console,
    process: { env: { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'test', CLOUDINARY_API_SECRET: 'test', FIREBASE_PROJECT_ID: 'demo-reshare' } },
    require(name) {
      if (name === 'node:http') return { createServer(fn) { handler = fn; return { listen() {}, on() {} }; } };
      if (name === 'firebase-admin/app') return { initializeApp() {}, applicationDefault() {} };
      if (name === 'firebase-admin/auth') return { getAuth: () => ({}) };
      if (name === 'firebase-admin/firestore') return { FieldValue: {}, getFirestore: () => ({}) };
      if (name === 'cloudinary') return { v2: { config() {} } };
      if (name === './error-body.cjs') return { errorBody };
      if (name === './p2p-reservation-expiry.cjs') return { createReservationExpiry: () => ({ start() {}, stop() {} }) };
      return factories;
    },
  }, { filename: 'server.cjs' });
  return handler;
}

async function send(handler, url, method = 'GET') {
  const request = Readable.from([]);
  Object.assign(request, { url, method, headers: { origin: 'http://localhost:5173' } });
  const result = {};
  await handler(request, {
    writeHead(status, headers) { Object.assign(result, { status, headers }); },
    end(body) { result.body = body ? JSON.parse(body) : null; },
  });
  return result;
}

test('Malformed URL returns a bounded 400 response; the same entry point handles the next request', async () => {
  const handler = loadHandler();
  for (const url of ['http://[::1', 'http://%zz/']) {
    const result = await send(handler, url);
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { message: 'Invalid request URL' });
    assert.equal(result.headers['Cache-Control'], 'no-store');
    const next = await send(handler, '/v1/admin/inventory');
    assert.equal(next.status, 200);
    assert.equal(next.body.path, '/v1/admin/inventory');
  }
});

test('Encoded-looking path text and valid CORS preflight keep their existing routing', async () => {
  const handler = loadHandler();
  const path = await send(handler, '/%zz');
  assert.equal(path.status, 200);
  assert.equal(path.body.path, '/%zz');
  const preflight = await send(handler, '/v1/admin/inventory', 'OPTIONS');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], 'http://localhost:5173');
});
