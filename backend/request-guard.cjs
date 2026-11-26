const { timingSafeEqual } = require('node:crypto');

// RC1D-144: giới hạn request trong bộ nhớ của một instance Node (Render chạy một instance).
// Đếm theo cửa sổ cố định: đơn giản, đủ chặn spam/quá tải; không thay cho WAF/rate limit ở Cloudflare.

function readPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function createRateLimiter({ limit, windowMs, now = Date.now, maxKeys = 10000 }) {
  const hits = new Map();

  function prune(time) {
    for (const [key, entry] of hits) if (entry.resetAt <= time) hits.delete(key);
    // Map giữ thứ tự thêm vào: xoá khoá cũ nhất để bộ nhớ không phình khi bị dội nhiều IP.
    for (const key of hits.keys()) {
      if (hits.size < maxKeys) break;
      hits.delete(key);
    }
  }

  /** @returns {{ allowed: boolean, retryAfterSeconds: number }} */
  function take(key) {
    const time = now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= time) {
      if (!entry && hits.size >= maxKeys) prune(time);
      entry = { count: 0, resetAt: time + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - time) / 1000));
    return { allowed: entry.count <= limit, retryAfterSeconds };
  }

  return { take, size: () => hits.size };
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * IP client. Chỉ tin CF-Connecting-IP khi request đã qua Cloudflare (đúng X-Edge-Secret).
 * Còn lại lấy phần tử thứ `proxyHops` tính từ cuối X-Forwarded-For: phần tử do proxy tin cậy
 * (Render) thêm vào, client không tự giả được; phần đầu chuỗi thì client gửi gì cũng được.
 */
function clientIp(request, { edgeVerified = false, proxyHops = 1, ipHeader = '' } = {}) {
  const headers = request.headers || {};
  if (edgeVerified && typeof headers['cf-connecting-ip'] === 'string' && headers['cf-connecting-ip'].trim()) {
    return headers['cf-connecting-ip'].trim();
  }
  // CLIENT_IP_HEADER: header chứa IP thật do hạ tầng đặt (Render có Cloudflare đứng trước nên gửi True-Client-IP).
  // Đo trên production 26/11: X-Forwarded-For của Render có nhiều proxy đổi theo từng request, đếm hop không ra IP thật.
  const fromHeader = ipHeader && typeof headers[ipHeader] === 'string' ? headers[ipHeader].split(',')[0].trim() : '';
  if (fromHeader) return fromHeader;
  const forwarded = typeof headers['x-forwarded-for'] === 'string'
    ? headers['x-forwarded-for'].split(',').map(part => part.trim()).filter(Boolean)
    : [];
  if (proxyHops > 0 && forwarded.length) return forwarded[Math.max(0, forwarded.length - proxyHops)];
  return request.socket?.remoteAddress || 'unknown';
}

// POST nhưng chỉ đọc và được gọi dày (mỗi trang hàng đợi, mỗi ảnh): chỉ tính vào ngưỡng chung,
// nếu không thì lật vài trang hàng đợi hoặc xem vài đơn có ảnh đã chạm ngưỡng ghi.
const READ_ONLY_POST_PATHS = new Set(['/v1/admin/donations/senders', '/v1/images/read-access']);

/** Endpoint ghi/tốn tài nguyên: POST còn lại (quyết định đơn, nhập kho, xuất kho, upload ảnh, form liên hệ…). */
const isWriteRequest = (method, pathname) => method === 'POST' && !READ_ONLY_POST_PATHS.has(pathname);

function createRequestGuard(env = {}, { now = Date.now } = {}) {
  const windowMs = readPositiveInt(env.RATE_LIMIT_WINDOW_MS, 60000);
  const general = createRateLimiter({ limit: readPositiveInt(env.RATE_LIMIT_GENERAL_PER_MINUTE, 120), windowMs, now });
  const write = createRateLimiter({ limit: readPositiveInt(env.RATE_LIMIT_WRITE_PER_MINUTE, 20), windowMs, now });
  const edgeSecret = typeof env.EDGE_SECRET === 'string' ? env.EDGE_SECRET.trim() : '';
  const proxyHops = Number.isSafeInteger(Number(env.TRUSTED_PROXY_HOPS)) && Number(env.TRUSTED_PROXY_HOPS) >= 0
    ? Number(env.TRUSTED_PROXY_HOPS) : 1;
  const enabled = env.RATE_LIMIT_ENABLED !== 'off';
  const rawIpHeader = typeof env.CLIENT_IP_HEADER === 'string' ? env.CLIENT_IP_HEADER.trim().toLowerCase() : '';
  const ipHeader = /^[a-z0-9-]{1,64}$/.test(rawIpHeader) ? rawIpHeader : '';

  /**
   * Kiểm một request trước khi đọc body. Trả null nếu cho qua,
   * hoặc { status, message, retryAfterSeconds? } nếu phải từ chối.
   * /health luôn qua để job keepalive và health check của Render không bị chặn.
   */
  function check(request, pathname) {
    if (pathname === '/health') return null;
    const edgeVerified = Boolean(edgeSecret) && safeEqual(request.headers?.['x-edge-secret'] || '', edgeSecret);
    // Chỉ bật khi đặt EDGE_SECRET: lúc đó backend chỉ nhận request đi qua Cloudflare.
    if (edgeSecret && !edgeVerified) return { status: 403, message: 'Direct access is not allowed' };
    if (!enabled || request.method === 'OPTIONS') return null;
    const ip = clientIp(request, { edgeVerified, proxyHops, ipHeader });
    const generalResult = general.take(ip);
    if (!generalResult.allowed) return { status: 429, message: 'Too many requests', retryAfterSeconds: generalResult.retryAfterSeconds };
    if (isWriteRequest(request.method, pathname)) {
      const writeResult = write.take(ip);
      if (!writeResult.allowed) return { status: 429, message: 'Too many requests', retryAfterSeconds: writeResult.retryAfterSeconds };
    }
    return null;
  }

  return { check };
}

/** Timeout nhận request: chặn client giữ kết nối bằng cách gửi header/body thật chậm. */
function readServerTimeouts(env = {}) {
  return {
    headersTimeout: readPositiveInt(env.SERVER_HEADERS_TIMEOUT_MS, 15000),
    requestTimeout: readPositiveInt(env.SERVER_REQUEST_TIMEOUT_MS, 30000),
  };
}

module.exports = { clientIp, createRateLimiter, createRequestGuard, readPositiveInt, readServerTimeouts };
