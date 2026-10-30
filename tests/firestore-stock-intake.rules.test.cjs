const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('US13: stock documents are only accessible through the trusted API', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc('staff_assignments/worker-a').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] });
      await db.doc('staff_assignments/admin').set({ active: true, role: 'system_admin', warehouseIds: [] });
      await db.doc('inventory/item-a').set({ warehouseId: 'kho-a', quantityAvailable: 3 });
      await db.doc('inventory/item-b').set({ warehouseId: 'kho-b', quantityAvailable: 2 });
      await db.doc('inventory_movements/mov-a').set({ warehouseId: 'kho-a', type: 'in', quantity: 3, actorEmail: 'private@example.com' });
      await db.doc('inventory_movements/mov-b').set({ warehouseId: 'kho-b', type: 'in', quantity: 2 });
      await db.doc('stock_entries/entry-a').set({ warehouseId: 'kho-a', receiptId: 'receipt-a', createdByEmail: 'private@example.com' });
      await db.doc('stock_entries/entry-b').set({ warehouseId: 'kho-b', receiptId: 'receipt-b' });
    });
    const worker = env.authenticatedContext('worker-a').firestore();
    const admin = env.authenticatedContext('admin').firestore();
    const donor = env.authenticatedContext('donor').firestore();
    for (const [collection, id] of [
      ['inventory', 'item-a'],
      ['inventory_movements', 'mov-a'],
      ['stock_entries', 'entry-a'],
    ]) {
      await assertFails(worker.doc(`${collection}/${id}`).get());
      await assertFails(admin.doc(`${collection}/${id}`).get());
      await assertFails(donor.doc(`${collection}/${id}`).get());
      await assertFails(worker.collection(collection).get());
      await assertFails(admin.collection(collection).get());
      await assertFails(worker.doc(`${collection}/${id}`).update({ quantityAvailable: 300 }));
      await assertFails(admin.doc(`${collection}/forged`).set({ warehouseId: 'kho-a' }));
    }
  } finally {
    // Rules test dùng chung emulator với backend test; không xoá dữ liệu seed thì
    // inventory/staff_assignments còn sót sẽ phá các test chạy sau.
    await env.clearFirestore();
    await env.cleanup();
  }
});
