const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('US13: inventory and movements are read by warehouse scope and never written by clients', async () => {
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
      await db.doc('inventory_movements/mov-a').set({ warehouseId: 'kho-a', type: 'in', quantity: 3 });
      await db.doc('inventory_movements/mov-b').set({ warehouseId: 'kho-b', type: 'in', quantity: 2 });
      await db.doc('stock_entries/entry-a').set({ warehouseId: 'kho-a', receiptId: 'receipt-a' });
      await db.doc('stock_entries/entry-b').set({ warehouseId: 'kho-b', receiptId: 'receipt-b' });
    });
    const worker = env.authenticatedContext('worker-a').firestore();
    const admin = env.authenticatedContext('admin').firestore();
    const donor = env.authenticatedContext('donor').firestore();
    await assertSucceeds(worker.doc('inventory/item-a').get());
    await assertSucceeds(worker.doc('inventory_movements/mov-a').get());
    await assertSucceeds(worker.doc('stock_entries/entry-a').get());
    await assertFails(worker.doc('inventory/item-b').get());
    await assertFails(worker.doc('inventory_movements/mov-b').get());
    await assertFails(worker.doc('stock_entries/entry-b').get());
    await assertFails(worker.collection('inventory').get());
    await assertSucceeds(admin.doc('inventory/item-b').get());
    await assertFails(donor.doc('inventory/item-a').get());
    await assertFails(worker.doc('inventory/item-a').update({ quantityAvailable: 300 }));
    await assertFails(admin.doc('inventory_movements/forged').set({ warehouseId: 'kho-a', type: 'in', quantity: 100 }));
    await assertFails(admin.doc('stock_entries/forged').set({ warehouseId: 'kho-a', receiptId: 'receipt-a' }));
  } finally {
    await env.cleanup();
  }
});
