const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('US12: receipt documents cannot be written by clients; staff can only read receipts for their assigned warehouse', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });

  try {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('warehouses/kho-a').set({ name: 'Kho Hải Châu', status: 'active' });
      await db.doc('warehouses/kho-b').set({ name: 'Kho Sơn Trà', status: 'active' });

      await db.doc('staff_assignments/worker-a').set({
        uid: 'worker-a',
        role: 'warehouse_admin',
        active: true,
        warehouseIds: ['kho-a'],
      });

      await db.doc('staff_assignments/admin').set({
        uid: 'admin',
        role: 'system_admin',
        active: true,
        warehouseIds: [],
      });

      // Receipt documents
      await db.doc('receipts/rcp-kho-a').set({
        id: 'rcp-kho-a',
        donationId: 'don-1',
        warehouseId: 'kho-a',
        quantity: 5,
        unitId: 'piece',
        conditionId: 'good',
        actorUid: 'worker-a',
        createdAt: new Date(),
      });

      await db.doc('receipts/rcp-kho-b').set({
        id: 'rcp-kho-b',
        donationId: 'don-2',
        warehouseId: 'kho-b',
        quantity: 10,
        unitId: 'kg',
        conditionId: 'minor-wear',
        actorUid: 'worker-b',
        createdAt: new Date(),
      });

      // Donations
      await db.doc('donations/don-kho-a').set({
        id: 'don-kho-a',
        donorId: 'donor-1',
        warehouseId: 'kho-a',
        status: 'approved',
        title: 'Áo ấm',
      });

      await db.doc('donations/don-kho-b').set({
        id: 'don-kho-b',
        donorId: 'donor-2',
        warehouseId: 'kho-b',
        status: 'approved',
        title: 'Bàn ghế',
      });
    });

    const workerA = env.authenticatedContext('worker-a').firestore();
    const admin = env.authenticatedContext('admin').firestore();
    const donor = env.authenticatedContext('donor-1').firestore();

    // 1. Direct writes to receipts from clients are strictly blocked (must use backend Admin SDK)
    await assertFails(workerA.doc('receipts/rcp-new').set({
      id: 'rcp-new',
      donationId: 'don-1',
      warehouseId: 'kho-a',
      quantity: 5,
    }));
    await assertFails(admin.doc('receipts/rcp-new').set({
      id: 'rcp-new',
      donationId: 'don-1',
      warehouseId: 'kho-a',
      quantity: 5,
    }));
    await assertFails(workerA.doc('receipts/rcp-kho-a').update({ quantity: 100 }));
    await assertFails(workerA.doc('receipts/rcp-kho-a').delete());

    // 2. Worker assigned to kho-a CAN read receipts at kho-a
    await assertSucceeds(workerA.doc('receipts/rcp-kho-a').get());

    // 3. Worker assigned to kho-a CANNOT read receipts at kho-b
    await assertFails(workerA.doc('receipts/rcp-kho-b').get());

    // 4. System admin CAN read receipts from any warehouse
    await assertSucceeds(admin.doc('receipts/rcp-kho-a').get());
    await assertSucceeds(admin.doc('receipts/rcp-kho-b').get());

    // 5. Donor CANNOT read receipt documents directly
    await assertFails(donor.doc('receipts/rcp-kho-a').get());

    // 6. Worker assigned to kho-a CAN read donations at kho-a
    await assertSucceeds(workerA.doc('donations/don-kho-a').get());

    // 7. Worker assigned to kho-a CANNOT read donations at kho-b
    await assertFails(workerA.doc('donations/don-kho-b').get());
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});
