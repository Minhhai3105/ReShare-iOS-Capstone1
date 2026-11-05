const test = require('node:test');
const assert = require('node:assert/strict');
const { inventoryRevision, readInventoryRevision } = require('../inventory-revision.cjs');
const doc = (id, revision, seconds = 1) => ({ id, exists: true, data: () => ({ revision }), updateTime: { seconds, nanoseconds: 20 } });

test('Inventory fingerprints survive reconnect/order changes but detect writes, deletion and recreation', () => {
  const a = doc('wh_a', 7), b = doc('wh_b', 9);
  const first = inventoryRevision('all_warehouses', { docs: [a, b] });
  assert.equal(first, inventoryRevision('all_warehouses', { docs: [b, a] }));
  assert.notEqual(first, inventoryRevision('all_warehouses', { docs: [a, doc('wh_b', 10)] }));
  assert.notEqual(first, inventoryRevision('all_warehouses', { docs: [a] }));
  assert.notEqual(inventoryRevision('wh_a', a), inventoryRevision('wh_a', doc('wh_a', 7, 2)));
  assert.notEqual(inventoryRevision('wh_a', { exists: false }), inventoryRevision('wh_b', { exists: false }));
});

test('Warehouse Admin aggregate metadata reads only assigned warehouse documents', async () => {
  const reads = [];
  const db = { collection: () => ({
    get: async () => assert.fail('Do not scan other warehouses'),
    doc: id => ({ get: async () => { reads.push(id); return doc(id, 1) } }),
  }) };
  await readInventoryRevision(db, '', ['b', 'a', 'a']);
  assert.deepEqual(reads, ['wh_a', 'wh_b']);
});
