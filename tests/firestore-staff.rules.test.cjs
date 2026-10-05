const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('US02: staff rights come from trusted assignment and are limited to assigned warehouses', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });

  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc('warehouses/kho-a').set({ name: 'Kho A', status: 'active' });
      await db.doc('warehouses/kho-b').set({ name: 'Kho B', status: 'active' });
      await db.doc('staff_assignments/worker').set({ uid: 'worker', role: 'warehouse_admin', active: true, warehouseIds: ['kho-a'] });
      await db.doc('staff_assignments/admin').set({ uid: 'admin', role: 'system_admin', active: true, warehouseIds: [] });
      await db.doc('staff_assignment_audit/event-1').set({ actorUid: 'bootstrap', targetUid: 'worker' });
    });

    const donor = env.authenticatedContext('donor').firestore();
    const anonymous = env.unauthenticatedContext().firestore();
    const worker = env.authenticatedContext('worker').firestore();
    const admin = env.authenticatedContext('admin').firestore();
    const fakeClaim = env.authenticatedContext('impostor', { role: 'system_admin', warehouseIds: ['kho-b'] }).firestore();

    await assertSucceeds(worker.doc('staff_assignments/worker').get());
    await assertFails(worker.doc('staff_assignments/admin').get());
    await assertFails(worker.doc('staff_assignments/worker').update({ role: 'system_admin' }));
    await assertFails(donor.doc('staff_assignments/donor').set({ uid: 'donor', role: 'system_admin', active: true }));
    await assertSucceeds(worker.doc('warehouses/kho-a').get());
    await assertFails(worker.doc('warehouses/kho-b').get());
    await assertFails(worker.collection('warehouses').get());
    await assertFails(fakeClaim.doc('warehouses/kho-b').get());
    await assertFails(fakeClaim.doc('staff_assignments/worker').get());
    await assertFails(anonymous.doc('warehouses/kho-a').get());
    await assertSucceeds(admin.doc('warehouses/kho-b').get());
    await assertSucceeds(admin.collection('warehouses').get());
    await assertSucceeds(admin.collection('staff_assignments').get());
    await assertSucceeds(admin.doc('staff_assignment_audit/event-1').get());
    await assertFails(worker.doc('staff_assignment_audit/event-1').get());

    await env.withSecurityRulesDisabled(async context => {
      await context.firestore().doc('staff_assignments/worker').update({ warehouseIds: ['kho-b'] });
    });
    await assertFails(worker.doc('warehouses/kho-a').get());
    await assertSucceeds(worker.doc('warehouses/kho-b').get());

    await env.withSecurityRulesDisabled(async context => {
      await context.firestore().doc('staff_assignments/worker').update({ active: false });
      await context.firestore().doc('staff_assignments/admin').update({ active: false });
    });
    await assertFails(worker.doc('warehouses/kho-b').get());
    await assertFails(admin.doc('warehouses/kho-a').get());
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});
