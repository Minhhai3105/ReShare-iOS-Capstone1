const { ApiError } = require('./image-api.cjs');

// Một listener revision cho mỗi phạm vi đang có người xem, chia sẻ giữa các kết nối.
function createInventoryEvents({ db, verifyToken, heartbeatMs = 15000, recheckMs = 60000 }) {
  const sources = new Map();

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
        source.revision = scope === 'all_warehouses' ? (source.revision || 0) + 1 : snapshot.exists ? snapshot.data().revision || 0 : 0;
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
    const scope = warehouseId ? `wh_${warehouseId}` : 'all_warehouses';
    response.writeHead(200, { ...responseHeaders, 'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    response.flushHeaders?.();
    let stopped = false, unsubscribeSource, unsubscribeAssignment, heartbeat, recheck;
    const close = () => {
      if (stopped) return;
      stopped = true;
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
