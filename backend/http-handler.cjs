const { ApiError } = require('./image-api.cjs');
const { ApiError: ContactApiError } = require('./contact-api.cjs');
const { errorBody } = require('./error-body.cjs');

function createRequestHandler({ resolveHandler, adminWebOrigins = new Set(), contactAllowedOrigin = '', allowLocalOrigins = false, logger = console }) {
  return async (request, response) => {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    };
    try {
      // Mọi thao tác phân tích request đều phải nằm trong try: URL sai không được làm chết server.
      if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw new ApiError(400, 'Invalid request URL');
      let url;
      try { url = new URL(request.url, 'http://localhost'); }
      catch { throw new ApiError(400, 'Invalid request URL'); }
      if (url.hash) throw new ApiError(400, 'Invalid request URL');
      const path = url.pathname;
      const isContact = path === '/v1/contact';
      const protectedOrigin = path.startsWith('/v1/admin/') || path.startsWith('/v1/images/');
      const origin = request.headers.origin;
      const allowedOrigin = isContact
        ? Boolean(origin && contactAllowedOrigin && origin === contactAllowedOrigin)
        : Boolean(origin && (adminWebOrigins.has(origin) ||
          (allowLocalOrigins && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(origin))));
      if (protectedOrigin || isContact) {
        headers.Vary = 'Origin';
        // Native iOS không có Origin; quyền của nó vẫn do Firebase token/API quyết định.
        if (origin && !allowedOrigin) throw new ApiError(403, 'Origin is not allowed');
        if (allowedOrigin) {
          headers['Access-Control-Allow-Origin'] = origin;
          headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
          headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        }
      }
      if (request.method === 'OPTIONS') {
        const method = request.headers['access-control-request-method'];
        const requestedHeaders = (request.headers['access-control-request-headers'] || '')
          .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
        if (!allowedOrigin || !['GET', 'POST'].includes(method) ||
            requestedHeaders.some(name => !['authorization', 'content-type'].includes(name))) {
          throw new ApiError(403, 'Preflight is not allowed');
        }
        response.writeHead(204, headers);
        response.end();
        return;
      }
      if (!['GET', 'POST'].includes(request.method)) throw new ApiError(405, 'Method is not allowed');
      if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') {
        throw new ApiError(415, 'Content encoding is not supported');
      }
      const maximum = isContact ? 32 * 1024 : 8192;
      if (Number(request.headers['content-length']) > maximum) throw new ApiError(413, 'Request too large');
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > maximum) throw new ApiError(413, 'Request too large');
        chunks.push(chunk);
      }
      let body = null;
      if (bytes) {
        if (request.method !== 'POST') throw new ApiError(400, 'Unexpected request body');
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
          throw new ApiError(415, 'Content-Type must be application/json');
        }
        try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
        catch { throw new ApiError(400, 'Invalid JSON body'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'JSON object required');
      }
      const handler = resolveHandler(path);
      const result = await handler.handle(request.method, path, request.headers, body, request.url);
      response.writeHead(result.status, headers);
      response.end(JSON.stringify(result.body));
    } catch (error) {
      const status = error instanceof ApiError || error instanceof ContactApiError ? error.status : 500;
      if (status === 413) headers.Connection = 'close';
      // Không log request, Authorization hoặc object lỗi từ nhà cung cấp (có thể chứa URL ký).
      if (status === 500) logger.error('ReShare API failure', { name: error?.name || 'Error' });
      if (!response.destroyed) {
        response.writeHead(status, headers);
        response.end(JSON.stringify(errorBody(error, status)));
      }
    }
  };
}

module.exports = { createRequestHandler };
