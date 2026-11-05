const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createInventoryEvents } = require('../inventory-events.cjs');

test('G01: two HTTP viewers receive a real Firestore revision and lose access on revocation',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 20000 }, async () => {
    const app = initializeApp({ projectId: 'demo-reshare' }, `sse-${Date.now()}`);
    const db = getFirestore(app), id = `sse-${Date.now()}`;
    const assignment = db.doc(`staff_assignments/${id}`), revision = db.doc(`warehouse_inventory_updates/wh_${id}`);
    const streams = createInventoryEvents({ db, verifyToken: async token => { if (token !== 'test') throw new Error('invalid'); return { uid: id }; } });
    const { watchInventoryEvents } = await import('../../ReShare-Web/src/admin/inventory/inventory.events.js');
    const server = createServer((request, response) => {
      streams.open(request, response).catch(error => {
        if (!response.headersSent) response.writeHead(error.status || 500);
        response.end();
      });
    });
    const stops = [];
    const eventually = async predicate => {
      const deadline = Date.now() + 8000;
      while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Stream event did not arrive');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    try {
      await assignment.set({ active: true, role: 'warehouse_admin', warehouseIds: [id] });
      await revision.set({ revision: 0 });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const counts = [0, 0], errors = [];
      for (const i of [0, 1]) stops.push(watchInventoryEvents({
        apiBase: `http://127.0.0.1:${server.address().port}`, warehouseId: id,
        getToken: async () => 'test', onChange: () => { counts[i] += 1 }, onError: error => errors.push(error.status),
      }));
      await eventually(() => counts.every(count => count >= 1));
      const before = [...counts], committedAt = Date.now();
      await revision.set({ revision: 1 });
      await eventually(() => counts.every((count, i) => count > before[i]));
      assert.ok(Date.now() - committedAt < 5000, 'Local transport target is 5 seconds; this is not live UI acceptance');
      await assignment.update({ role: 'system_admin' });
      let adminChanges = 0;
      stops.push(watchInventoryEvents({ apiBase: `http://127.0.0.1:${server.address().port}`, warehouseId: '',
        getToken: async () => 'test', onChange: () => { adminChanges += 1 }, onError: error => errors.push(error.status) }));
      await eventually(() => adminChanges >= 1);
      const adminBefore = adminChanges;
      const otherRevision = db.doc(`warehouse_inventory_updates/wh_${id}-other`);
      await otherRevision.set({ revision: 1 });
      await eventually(() => adminChanges > adminBefore);
      await otherRevision.delete();
      await assignment.update({ active: false });
      await eventually(() => errors.length === 3);
      assert.deepEqual(errors, [403, 403, 403]);
    } finally {
      stops.forEach(stop => stop());
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await Promise.allSettled([assignment.delete(), revision.delete()]);
      await deleteApp(app);
    }
  });
