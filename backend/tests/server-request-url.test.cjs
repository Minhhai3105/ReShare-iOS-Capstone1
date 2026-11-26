const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const vm = require('node:vm');
const { ApiError } = require('../image-api.cjs');
const { errorBody } = require('../error-body.cjs');
const { CANCEL_PATH } = require('../donation-cancel-api.cjs');
const { DELETE_PATH } = require('../p2p-owner-delete-api.cjs');
const { PUBLIC_DATA_PATH } = require('../public-data-api.cjs');
const { readAiModerationConfig } = require('../ai-moderation-jobs.cjs');
const { readAiAutoRemoveConfig } = require('../ai-moderation.cjs');

// Load the real entry point with external services replaced; no credentials or port needed.
function loadHandler(extraEnv = {}, aiOptions = {}) {
  let handler;
  const api = { handle: async (_method, path) => ({ status: 200, body: { path } }) };
  const factories = new Proxy({ ApiError }, { get: (target, key) => target[key] || (() => api) });
  vm.runInNewContext(readFileSync(join(__dirname, '../server.cjs'), 'utf8'), {
    URL, Buffer, console,
    process: { env: { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'test', CLOUDINARY_API_SECRET: 'test', FIREBASE_PROJECT_ID: 'demo-reshare', ...extraEnv } },
    require(name) {
      if (name === 'node:http') return { createServer(fn) { handler = fn; return { listen() {}, on() {} }; } };
      if (name === 'firebase-admin/app') return { initializeApp() {}, applicationDefault() {} };
      if (name === 'firebase-admin/auth') return { getAuth: () => ({}) };
      if (name === 'firebase-admin/firestore') return { FieldValue: {}, getFirestore: () => ({}) };
      if (name === 'cloudinary') return { v2: { config() {} } };
      if (name === './error-body.cjs') return { errorBody };
      if (name === './request-guard.cjs') return require('../request-guard.cjs');
      if (name === './donation-cancel-api.cjs') return { CANCEL_PATH, createDonationCancelApi: () => ({
        handle: async (_method, path) => ({ status: 200, body: { path, api: 'cancel' } }),
      }) };
      if (name === './p2p-owner-delete-api.cjs') return { DELETE_PATH, createP2pOwnerDeleteApi: () => ({
        handle: async (_method, path) => ({ status: 200, body: { path, api: 'owner-delete' } }),
      }) };
      if (name === './public-data-api.cjs') return { PUBLIC_DATA_PATH, createPublicDataApi: () => ({
        handle: async (_method, path) => ({ status: 200, body: { path, api: 'public' } }), invalidate() {},
      }) };
      if (name === './p2p-reservation-expiry.cjs') return { createReservationExpiry: () => ({ start() {}, stop() {} }) };
      if (name === './ai-moderation.cjs') return { readAiAutoRemoveConfig, createAiModerator(options) {
        aiOptions.timeoutMs = options.timeoutMs;
        return { enabled: false };
      } };
      if (name === './ai-moderation-jobs.cjs') return { readAiModerationConfig, createAiModerationJobs(options) {
        const { batchSize, concurrency, intervalMs, timeoutMs, autoRemoveConfig } = options;
        aiOptions.job = { batchSize, concurrency, intervalMs, timeoutMs, autoRemoveConfig };
        return { start() {}, stop() {} };
      } };
      if (name === './p2p-listings-api.cjs') return { createP2pListingsApi: () => ({ handle: async (_method, path) => ({ status: 200, body: { path, api: 'p2p' } }) }) };
      if (name === './image-cleanup-jobs.cjs') {
        return { cloudinaryCatalogImageDeleter: () => async () => {}, createImageCleanupJobs: () => ({ start() {}, stop() {} }) };
      }
      return factories;
    },
  }, { filename: 'server.cjs' });
  return handler;
}

test('Cấu hình AI từ env được chuyển đúng vào moderator và job của server', () => {
  const aiOptions = {};
  loadHandler({
    AI_MODERATION_BATCH_SIZE: '25', AI_MODERATION_CONCURRENCY: '9',
    AI_MODERATION_INTERVAL_MS: '60000', AI_MODERATION_TIMEOUT_MS: '120000',
    AI_MODERATION_AUTO_REMOVE: 'on', AI_MODERATION_AUTO_REMOVE_THRESHOLD: '0.93',
  }, aiOptions);
  assert.deepEqual(aiOptions, {
    timeoutMs: 120000, job: { batchSize: 25, concurrency: 5, intervalMs: 60000, timeoutMs: 120000,
      autoRemoveConfig: { enabled: true, threshold: 0.93 } },
  });
});

async function send(handler, url, method = 'GET', origin = 'http://localhost:5173') {
  const request = Readable.from([]);
  Object.assign(request, { url, method, headers: { origin } });
  const result = {};
  await handler(request, {
    writeHead(status, headers) { Object.assign(result, { status, headers }); },
    end(body) { result.body = body ? JSON.parse(body) : null; },
  });
  return result;
}

test('Cancellation dispatches only the exact donor path', async () => {
  const handler = loadHandler();
  const path = '/v1/donations/don-test/cancel';
  assert.deepEqual((await send(handler, path, 'POST')).body, { path, api: 'cancel' });
  for (const other of [`${path}/extra`, `${path}led`, '/v1/donations/don-test/resubmit']) {
    assert.equal((await send(handler, other, 'POST')).body.api, undefined);
  }
});

test('P2P owner deletion dispatches only the exact non-admin path', async () => {
  const handler = loadHandler();
  const path = '/v1/p2p/listings/cat_test/delete';
  assert.deepEqual((await send(handler, path, 'POST')).body, { path, api: 'owner-delete' });
  assert.equal((await send(handler, `${path}/extra`, 'POST')).body.api, undefined);
  assert.equal((await send(handler, '/v1/admin/p2p/listings/cat_test/remove', 'POST')).body.api, 'p2p');
});

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

test('Contact inbox: admin origins and the landing origin pass CORS; other origins are refused', async () => {
  const handler = loadHandler({ CONTACT_ALLOWED_ORIGIN: 'https://reshare.pages.dev', ADMIN_WEB_ORIGINS: 'https://admin.reshare.test' });
  for (const origin of ['http://localhost:5173', 'https://admin.reshare.test', 'https://reshare.pages.dev']) {
    const preflight = await send(handler, '/v1/contact?limit=20', 'OPTIONS', origin);
    assert.equal(preflight.status, 204, origin);
    assert.equal(preflight.headers['Access-Control-Allow-Origin'], origin);
    const read = await send(handler, '/v1/contact?limit=20', 'GET', origin);
    assert.equal(read.status, 200, origin);
    assert.equal(read.headers['Access-Control-Allow-Origin'], origin);
  }
  const refused = await send(handler, '/v1/contact?limit=20', 'OPTIONS', 'https://evil.example');
  assert.equal(refused.status, 403);
  assert.equal(refused.headers['Access-Control-Allow-Origin'], undefined);
  const refusedRead = await send(handler, '/v1/contact', 'GET', 'https://evil.example');
  assert.equal(refusedRead.status, 403);
});

// Route thật phải tới P2P handler, không rơi sang image-api mặc định.
test('Kho đồ 0đ: route kiểm AI đi tới đúng handler và giữ CORS admin', async () => {
  const response = await send(loadHandler(), '/v1/admin/p2p/listings/item/ai-check', 'POST');
  assert.equal(response.status, 200);
  assert.equal(response.body.api, 'p2p');
  assert.equal(response.headers['Access-Control-Allow-Origin'], 'http://localhost:5173');
});

test('RC1D-144: vượt ngưỡng nhận 429 kèm Retry-After đọc được qua CORS; /health không bị giới hạn', async () => {
  const handler = loadHandler({ RATE_LIMIT_GENERAL_PER_MINUTE: '2' });
  assert.equal((await send(handler, '/v1/admin/hubs')).status, 200);
  assert.equal((await send(handler, '/v1/admin/hubs')).status, 200);
  const limited = await send(handler, '/v1/admin/hubs');
  assert.equal(limited.status, 429);
  assert.deepEqual(limited.body, { message: 'Too many requests' });
  assert.ok(Number(limited.headers['Retry-After']) >= 1);
  assert.equal(limited.headers['Access-Control-Expose-Headers'], 'Retry-After');
  for (let i = 0; i < 5; i += 1) assert.equal((await send(handler, '/health')).status, 200);
});

test('RC1D-144: không đặt env mới thì request bình thường vẫn chạy như cũ', async () => {
  const handler = loadHandler();
  for (let i = 0; i < 30; i += 1) assert.equal((await send(handler, '/v1/admin/hubs')).status, 200);
});

test('RC1D-144: đặt EDGE_SECRET thì request không qua Cloudflare bị 403 trước khi tới handler', async () => {
  const handler = loadHandler({ EDGE_SECRET: 'edge-secret-value' });
  const direct = await send(handler, '/v1/admin/hubs');
  assert.equal(direct.status, 403);
  assert.deepEqual(direct.body, { message: 'Direct access is not allowed' });
  assert.equal((await send(handler, '/health')).status, 200);
});

test('Dữ liệu công khai: chỉ đúng 2 đường dẫn vào handler công khai, không gửi CORS, client không được cache', async () => {
  const handler = loadHandler();
  for (const path of ['/v1/public/campaigns', '/v1/public/hubs']) {
    const result = await send(handler, path, 'GET', undefined);
    assert.deepEqual(result.body, { path, api: 'public' });
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
    const fromWeb = await send(handler, path, 'GET', 'http://localhost:5173');
    assert.equal(fromWeb.headers['Access-Control-Allow-Origin'], undefined, 'trình duyệt không đọc được qua CORS');
  }
  for (const other of ['/v1/public/campaigns/x', '/v1/public/campaignsx', '/v1/public/users']) {
    assert.equal((await send(handler, other)).body.api, undefined);
  }
});
