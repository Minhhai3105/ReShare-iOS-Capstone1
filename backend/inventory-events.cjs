const { ApiError } = require('./image-api.cjs');
const { inventoryRevision } = require('./inventory-revision.cjs');
const { createRateLimiter } = require('./request-guard.cjs');

function tooManyConnections(retryAfterSeconds) {
  return Object.assign(new ApiError(429, 'Too many inventory stream connections'), { retryAfterSeconds });
}

// Một listener revision cho mỗi phạm vi đang có người xem, chia sẻ giữa các kết nối.
// RC1D-144: mỗi tài khoản giữ tối đa maxConnectionsPerUser luồng cùng lúc và mở lại tối đa
// reconnectsPerMinute lần/phút, để một tab lỗi hay script không giữ hết kết nối của server.
function createInventoryEvents({
  db, verifyToken, heartbeatMs = 15000, recheckMs = 60000,
  maxConnectionsPerUser = 3, reconnectsPerMinute = 10, now = Date.now,
}) {
  const sources = new Map();
  const openByUser = new Map();
  const reconnects = createRateLimiter({ limit: reconnectsPerMinute, windowMs: 60000, now });

  function subscribe(scope, onChange, onError) {
    let source = sources.get(scope);
    if (!source) {
      source = { clients: new Set(), revision: null, unsubscribe: null };
      sources.set(scope, source);
    }
    const client = { onChange, onError };
    source.clients.add(client);
    if (!source.unsubscribe) {
      const updates = db.collection('warehouse_inventory_updates');
      const reference = scope === 'all_warehouses' ? updates : updates.doc(scope);
      source.unsubscribe = reference.onSnapshot(snapshot => {
        const revision = inventoryRevision(scope, snapshot);
        if (revision === source.revision) return;
        source.revision = revision;
        for (const subscriber of [...source.clients]) subscriber.onChange(source.revision);
      }, error => {
        for (const subscriber of [...source.clients]) subscriber.onError(error);
      });
    } else if (source.revision !== null) onChange(source.revision);
    return () => {
      source.clients.delete(client);
      if (!source.clients.size) { source.unsubscribe?.(); sources.delete(scope); }
    };
  }

  async function open(request, response, responseHeaders = {}) {
    const token = /^Bearer (\S+)$/.exec(request.headers.authorization || '');
    let claims;
    try { if (token) claims = await verifyToken(token[1]); } catch { /* No session details are exposed. */ }
    if (!claims?.uid) throw new ApiError(401, 'Sign in required');
    const uid = claims.uid;
    const attempt = reconnects.take(uid);
    if (!attempt.allowed) throw tooManyConnections(attempt.retryAfterSeconds);
    if ((openByUser.get(uid) || 0) >= maxConnectionsPerUser) throw tooManyConnections(30);
    const warehouseId = new URL(request.url, 'http://localhost').searchParams.get('warehouseId') || '';
    if (warehouseId && !/^[A-Za-z0-9_-]{1,64}$/.test(warehouseId)) throw new ApiError(400, 'Invalid warehouse');
    const assignmentRef = db.collection('staff_assignments').doc(claims.uid);
    const assignment = await assignmentRef.get();
    const allowed = snapshot => {
      if (!snapshot.exists) return false;
      const data = snapshot.data();
      return data.active === true && (data.role === 'system_admin' ||
        (data.role === 'warehouse_admin' && warehouseId && Array.isArray(data.warehouseIds) && data.warehouseIds.includes(warehouseId)));
    };
    if (!allowed(assignment)) throw new ApiError(403, 'Warehouse access denied');
    // Kiểm lại sau await: hai lần mở đồng thời của cùng tài khoản không được cùng lọt qua.
    if ((openByUser.get(uid) || 0) >= maxConnectionsPerUser) throw tooManyConnections(30);
    openByUser.set(uid, (openByUser.get(uid) || 0) + 1);
    const scope = warehouseId ? `wh_${warehouseId}` : 'all_warehouses';
    response.writeHead(200, { ...responseHeaders, 'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    response.flushHeaders?.();
    let stopped = false, unsubscribeSource, unsubscribeAssignment, heartbeat, recheck;
    const close = () => {
      if (stopped) return;
      stopped = true;
      const remaining = (openByUser.get(uid) || 1) - 1;
      if (remaining > 0) openByUser.set(uid, remaining); else openByUser.delete(uid);
      unsubscribeSource?.(); unsubscribeAssignment?.();
      clearInterval(heartbeat); clearInterval(recheck);
      response.end();
    };
    const send = (event, data) => {
      if (stopped) return;
      if (response.writableLength > 65536) { close(); return; }
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const accessLost = () => { send('access_lost', {}); close(); };
    response.once('close', close);
    unsubscribeAssignment = assignmentRef.onSnapshot(snapshot => { if (!allowed(snapshot)) accessLost(); }, close);
    unsubscribeSource = subscribe(scope, revision => send('inventory', { revision }), close);
    heartbeat = setInterval(() => { if (!stopped) response.write(': heartbeat\n\n'); }, heartbeatMs);
    let checking = false;
    recheck = setInterval(async () => {
      if (checking || stopped) return;
      checking = true;
      try { await verifyToken(token[1]); } catch { accessLost(); }
      finally { checking = false; }
    }, recheckMs);
    heartbeat.unref?.(); recheck.unref?.();
    if (stopped) { unsubscribeSource?.(); unsubscribeAssignment?.(); clearInterval(heartbeat); clearInterval(recheck); }
  }

  return { open };
}

module.exports = { createInventoryEvents };
