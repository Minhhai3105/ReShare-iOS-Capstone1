const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createInventoryEvents } = require('../inventory-events.cjs');
const { createInventoryApi } = require('../inventory-api.cjs');

test('HTTP snapshot and SSE share a persistent revision across reconnect and update without redundant GETs', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 20000,
}, async () => {
  const { watchInventoryEvents } = await import('../../ReShare-Web/src/admin/inventory/inventory.events.js');
  const { createInventorySyncState } = await import('../../ReShare-Web/src/admin/inventory/inventory.sync.js');
  const id = `sync-${randomUUID()}`, app = initializeApp({ projectId: 'demo-reshare' }, id), db = getFirestore(app);
  const paths = [`staff_assignments/${id}`, `warehouse_inventory_updates/wh_${id}`, `inventory/${id}`];
  const verifyToken = async token => { if (token !== 'test-token') throw new Error('Invalid'); return { uid: id }; };
  const config = { db, verifyToken }, inventory = createInventoryApi(config);
  let events = createInventoryEvents(config), server, stop = () => {}, reads = 0, resolveChange;
  try {
    await db.doc(paths[0]).set({ active: true, role: 'warehouse_admin', warehouseIds: [id] });
    await db.doc(paths[1]).set({ revision: 1 });
    await db.doc(paths[2]).set({ warehouseId: id, quantityAvailable: 2, unitId: 'piece', createdAt: new Date() });
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const task = url.pathname.endsWith('/events') ? events.open(req, res) : (async () => {
        reads++;
        const reply = await inventory.handle('GET', url.pathname, req.headers, null, req.url);
        res.writeHead(reply.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(reply.body));
      })();
      task.catch(error => { res.writeHead(error.status || 500); res.end('{}'); });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const apiBase = `http://127.0.0.1:${server.address().port}`, state = createInventorySyncState();
    const load = async () => {
      const response = await fetch(`${apiBase}/v1/admin/inventory?warehouseId=${id}`, { headers: { Authorization: 'Bearer test-token' } });
      assert.equal(response.status, 200); const body = await response.json(); state.acknowledge(body.revision); return body;
    };
    const first = await load();
    assert.equal(first.items[0].quantityAvailable, 2);
    const connect = () => new Promise((resolve, reject) => {
      stop = watchInventoryEvents({ apiBase, warehouseId: id, getToken: async () => 'test-token', onError: reject,
        onChange(revision) {
          if (!state.observe(revision)) { resolve(revision); return; }
          load().then(body => { resolveChange?.(body); resolve(revision); }, reject);
        },
      });
    });
    assert.equal(await connect(), first.revision);
    assert.equal(reads, 1, 'SSE baseline does not cause a second GET');
    stop(); events = createInventoryEvents(config);
    assert.equal(await connect(), first.revision);
    assert.equal(reads, 1, 'A fresh backend event instance preserves the same persisted revision');
    const changed = new Promise(resolve => { resolveChange = resolve; });
    const batch = db.batch(); batch.update(db.doc(paths[1]), { revision: FieldValue.increment(1) });
    batch.update(db.doc(paths[2]), { quantityAvailable: 3 }); await batch.commit();
    const next = await changed;
    assert.equal(next.items[0].quantityAvailable, 3);
    assert.notEqual(next.revision, first.revision);
    assert.equal(reads, 2, 'A committed change causes one new GET');
  } finally {
    stop(); if (server) await new Promise(resolve => server.close(resolve));
    await Promise.allSettled(paths.map(path => db.doc(path).delete())); await deleteApp(app);
  }
});
