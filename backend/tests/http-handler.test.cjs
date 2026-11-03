const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { Readable } = require('node:stream');
const { createRequestHandler } = require('../http-handler.cjs');
const { ApiError } = require('../image-api.cjs');

test('HTTP boundary rejects unsafe requests without leaking credentials or stopping the server', async t => {
  const calls = [];
  const logs = [];
  const server = http.createServer(createRequestHandler({
    adminWebOrigins: new Set(['https://reshare.pages.dev']),
    contactAllowedOrigin: 'https://reshare.pages.dev',
    logger: { error: (...values) => logs.push(values) },
    resolveHandler: () => ({ handle: async (method, path, headers, body) => {
      calls.push({ method, path, body });
      if (path === '/explode') throw Object.assign(new Error('secret-token'), { request: { authorization: 'secret-token' } });
      if (path.startsWith('/v1/') && !headers.authorization) throw new ApiError(401, 'Sign in required');
      return { status: 200, body: { ok: true, body } };
    } }),
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  function request(path, { method = 'GET', headers = {}, chunks = [] } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject);
      for (const chunk of chunks) req.write(chunk);
      req.end();
    });
  }
  assert.equal((await request('http://[')).status, 400);
  assert.equal((await request('/health')).status, 200, 'URL xấu không làm server chết');
  for (const path of ['/v1/admin/staff', '/v1/images/upload-intents', '/v1/images/cleanup', '/v1/images/read-access']) {
    assert.equal((await request(path, { headers: { origin: 'https://evil.test' } })).status, 403);
    assert.equal((await request(path)).status, 401, 'iOS không có Origin vẫn phải xác thực');
  }
  assert.equal((await request('/v1/admin/staff', { headers: { origin: 'http://localhost:5173' } })).status, 403);
  const allowed = await request('/v1/admin/staff', { headers: { origin: 'https://reshare.pages.dev', authorization: 'Bearer test' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://reshare.pages.dev');
  assert.equal(allowed.headers['cache-control'], 'no-store');
  assert.equal(allowed.headers['x-content-type-options'], 'nosniff');
  assert.equal((await request('/v1/images/read-access', { method: 'OPTIONS', headers: {
    origin: 'https://reshare.pages.dev', 'access-control-request-method': 'POST', 'access-control-request-headers': 'Authorization, Content-Type',
  } })).status, 204);
  assert.equal((await request('/v1/images/read-access', { method: 'OPTIONS', headers: {
    origin: 'https://reshare.pages.dev', 'access-control-request-method': 'DELETE',
  } })).status, 403);
  assert.equal((await request('/health', { method: 'DELETE' })).status, 405);
  assert.equal((await request('/health', { method: 'POST', headers: { 'content-type': 'text/plain' }, chunks: ['{}'] })).status, 415);
  assert.equal((await request('/health', { method: 'POST', headers: { 'content-type': 'application/json' }, chunks: ['null'] })).status, 400);
  assert.equal((await request('/health', { method: 'POST', headers: { 'content-type': 'application/json' }, chunks: ['x'.repeat(8200)] })).status, 413);
  const json = Buffer.from(JSON.stringify({ name: 'Áo ấm' }));
  const split = json.indexOf(Buffer.from('Á')) + 1;
  const utf8 = await request('/health', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, chunks: [json.subarray(0, split), json.subarray(split)] });
  assert.equal(JSON.parse(utf8.body).body.name, 'Áo ấm');
  const failed = await request('/explode');
  assert.equal(failed.status, 500);
  assert.equal(failed.body.includes('secret-token'), false);
  assert.equal(JSON.stringify(logs).includes('secret-token'), false);
  assert.equal((await request('/health')).status, 200);
});

test('JSON parser preserves split Vietnamese UTF-8 and rejects malformed UTF-8', async () => {
  const handler = createRequestHandler({ resolveHandler: () => ({ handle: async (_method, _path, _headers, body) =>
    ({ status: 200, body }) }) });
  async function run(chunks) {
    const request = Readable.from(chunks);
    Object.assign(request, { url: '/health', method: 'POST', headers: { 'content-type': 'application/json' } });
    const response = { destroyed: false, writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
    await handler(request, response);
    return response;
  }
  const bytes = Buffer.from('{"name":"Áo ấm"}');
  const split = bytes.indexOf(Buffer.from('Á')) + 1;
  const valid = await run([bytes.subarray(0, split), bytes.subarray(split)]);
  assert.equal(valid.status, 200);
  assert.equal(JSON.parse(valid.body).name, 'Áo ấm');
  assert.equal((await run([Buffer.from([0xff])])).status, 400);
});
