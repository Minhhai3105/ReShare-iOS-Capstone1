const test = require('node:test');
const assert = require('node:assert/strict');
const { clientIp, createRateLimiter, createRequestGuard, readServerTimeouts } = require('../request-guard.cjs');

const request = (method = 'GET', headers = {}, remoteAddress = '10.0.0.1') => ({ method, headers, socket: { remoteAddress } });

test('Rate limiter cho qua đúng ngưỡng, chặn lượt vượt kèm Retry-After và mở lại khi hết cửa sổ', () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 60000, now: () => time });
  assert.equal(limiter.take('a').allowed, true);
  assert.equal(limiter.take('a').allowed, true);
  const blocked = limiter.take('a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
  assert.equal(limiter.take('b').allowed, true, 'mỗi khoá đếm riêng');
  time = 60000;
  assert.equal(limiter.take('a').allowed, true);
});

test('Rate limiter không giữ quá maxKeys khoá khi bị dội nhiều IP', () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 60000, now: () => time, maxKeys: 3 });
  for (const key of ['a', 'b', 'c', 'd', 'e']) limiter.take(key);
  assert.ok(limiter.size() <= 3);
});

test('IP client lấy từ phần tử X-Forwarded-For do proxy tin cậy thêm, không tin phần client tự gửi', () => {
  const spoofed = request('GET', { 'x-forwarded-for': '1.1.1.1, 203.0.113.9' });
  assert.equal(clientIp(spoofed), '203.0.113.9');
  assert.equal(clientIp(request()), '10.0.0.1', 'không có header thì dùng IP socket');
  assert.equal(clientIp(spoofed, { proxyHops: 0 }), '10.0.0.1');
  const viaEdge = request('GET', { 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '1.1.1.1' });
  assert.equal(clientIp(viaEdge, { edgeVerified: true }), '198.51.100.7');
  assert.equal(clientIp(viaEdge), '1.1.1.1', 'CF-Connecting-IP chỉ được tin khi đã xác minh edge secret');
});

test('Guard trả 429 khi vượt ngưỡng chung, POST có ngưỡng riêng chặt hơn; /health và OPTIONS không bị đếm', () => {
  const guard = createRequestGuard({ RATE_LIMIT_GENERAL_PER_MINUTE: '5', RATE_LIMIT_WRITE_PER_MINUTE: '2' }, { now: () => 0 });
  for (let i = 0; i < 10; i += 1) assert.equal(guard.check(request('GET'), '/health'), null);
  for (let i = 0; i < 10; i += 1) assert.equal(guard.check(request('OPTIONS'), '/v1/contact'), null);
  assert.equal(guard.check(request('POST'), '/v1/contact'), null);
  assert.equal(guard.check(request('POST'), '/v1/contact'), null);
  const write = guard.check(request('POST'), '/v1/contact');
  assert.equal(write.status, 429);
  assert.ok(write.retryAfterSeconds >= 1);
  assert.equal(guard.check(request('GET'), '/v1/admin/inventory'), null);
  assert.equal(guard.check(request('GET'), '/v1/admin/inventory'), null);
  assert.equal(guard.check(request('GET'), '/v1/admin/inventory').status, 429, 'tổng 6 request > ngưỡng chung 5');
  assert.equal(guard.check(request('GET', {}, '10.0.0.2'), '/v1/admin/inventory'), null, 'IP khác không bị ảnh hưởng');
});

test('Ngưỡng mặc định khi không đặt env: 120 request/phút chung, 20 POST/phút', () => {
  const guard = createRequestGuard({}, { now: () => 0 });
  for (let i = 0; i < 20; i += 1) assert.equal(guard.check(request('POST'), '/v1/contact'), null);
  assert.equal(guard.check(request('POST'), '/v1/contact').status, 429);
  const other = createRequestGuard({}, { now: () => 0 });
  for (let i = 0; i < 120; i += 1) assert.equal(other.check(request('GET'), '/v1/admin/hubs'), null);
  assert.equal(other.check(request('GET'), '/v1/admin/hubs').status, 429);
});

test('POST chỉ đọc (người gửi của hàng đợi, quyền xem ảnh) không bị tính vào ngưỡng ghi', () => {
  const guard = createRequestGuard({ RATE_LIMIT_WRITE_PER_MINUTE: '2' }, { now: () => 0 });
  for (let i = 0; i < 10; i += 1) {
    assert.equal(guard.check(request('POST'), '/v1/admin/donations/senders'), null);
    assert.equal(guard.check(request('POST'), '/v1/images/read-access'), null);
  }
  assert.equal(guard.check(request('POST'), '/v1/images/upload-intents'), null);
  assert.equal(guard.check(request('POST'), '/v1/images/upload-intents'), null);
  assert.equal(guard.check(request('POST'), '/v1/images/upload-intents').status, 429);
});

test('RATE_LIMIT_ENABLED=off tắt giới hạn để quay lại hành vi cũ khi cần', () => {
  const guard = createRequestGuard({ RATE_LIMIT_ENABLED: 'off', RATE_LIMIT_GENERAL_PER_MINUTE: '1' }, { now: () => 0 });
  for (let i = 0; i < 5; i += 1) assert.equal(guard.check(request('POST'), '/v1/contact'), null);
});

test('EDGE_SECRET: chỉ khi đã đặt mới chặn request không đi qua Cloudflare; /health vẫn mở', () => {
  const open = createRequestGuard({}, { now: () => 0 });
  assert.equal(open.check(request('GET'), '/v1/admin/hubs'), null, 'chưa đặt secret thì không đổi hành vi');
  const guard = createRequestGuard({ EDGE_SECRET: 'edge-secret-value' }, { now: () => 0 });
  assert.deepEqual(guard.check(request('GET'), '/v1/admin/hubs'), { status: 403, message: 'Direct access is not allowed' });
  assert.equal(guard.check(request('GET', { 'x-edge-secret': 'wrong' }), '/v1/admin/hubs').status, 403);
  assert.equal(guard.check(request('GET', { 'x-edge-secret': 'edge-secret-value' }), '/v1/admin/hubs'), null);
  assert.equal(guard.check(request('GET'), '/health'), null);
});

test('Timeout nhận request có mặc định và đọc được từ env', () => {
  assert.deepEqual(readServerTimeouts({}), { headersTimeout: 15000, requestTimeout: 30000 });
  assert.deepEqual(readServerTimeouts({ SERVER_HEADERS_TIMEOUT_MS: '5000', SERVER_REQUEST_TIMEOUT_MS: 'x' }), { headersTimeout: 5000, requestTimeout: 30000 });
});

test('CLIENT_IP_HEADER: lấy IP thật từ header hạ tầng đặt (Render: True-Client-IP), mỗi IP một hạn mức', () => {
  const headers = ip => ({ 'true-client-ip': ip, 'x-forwarded-for': `${ip}, 10.0.0.${Math.floor(Math.random() * 200)}` });
  assert.equal(clientIp(request('GET', headers('203.0.113.7')), { ipHeader: 'true-client-ip' }), '203.0.113.7');
  // Không đặt header thì quay về X-Forwarded-For như cũ.
  assert.equal(clientIp(request('GET', { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }), { ipHeader: 'true-client-ip' }), '2.2.2.2');
  const guard = createRequestGuard({ CLIENT_IP_HEADER: 'True-Client-IP', RATE_LIMIT_GENERAL_PER_MINUTE: '2' }, { now: () => 0 });
  assert.equal(guard.check(request('GET', headers('203.0.113.7')), '/v1/public/hubs'), null);
  assert.equal(guard.check(request('GET', headers('203.0.113.7')), '/v1/public/hubs'), null);
  assert.equal(guard.check(request('GET', headers('203.0.113.7')), '/v1/public/hubs').status, 429);
  assert.equal(guard.check(request('GET', headers('198.51.100.9')), '/v1/public/hubs'), null, 'người dùng khác không bị chặn lây');
  // Tên header không hợp lệ thì bỏ qua, không đọc header lạ.
  const bad = createRequestGuard({ CLIENT_IP_HEADER: 'x y', RATE_LIMIT_GENERAL_PER_MINUTE: '1' }, { now: () => 0 });
  assert.equal(bad.check(request('GET', { 'x y': 'a' }, '10.0.0.5'), '/v1/public/hubs'), null);
});

test('CLIENT_IP_DEBUG=on: chỉ ghi log request thăm dò (có X-ReShare-IP-Probe), tối đa 40 dòng; tắt thì không ghi', () => {
  const lines = [];
  const guard = createRequestGuard({ CLIENT_IP_DEBUG: 'on', RATE_LIMIT_ENABLED: 'off' }, { log: line => lines.push(line) });
  guard.check(request('GET', { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }), '/v1/public/hubs');
  assert.equal(lines.length, 0, 'request thường không bị ghi');
  for (let i = 0; i < 45; i += 1) guard.check(request('GET', { 'x-reshare-ip-probe': 'v4', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }), '/v1/public/hubs');
  assert.equal(lines.length, 40);
  assert.deepEqual(JSON.parse(lines[0].replace('[client-ip] ', '')).xff, '1.1.1.1, 2.2.2.2');
  const off = [];
  createRequestGuard({}, { log: line => off.push(line) }).check(request('GET', { 'x-reshare-ip-probe': 'v4' }), '/v1/public/hubs');
  assert.equal(off.length, 0);
});
