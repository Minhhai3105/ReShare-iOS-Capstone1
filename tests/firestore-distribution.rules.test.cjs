const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('US17: only assigned staff read distribution vouchers; client cannot write', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc('staff_assignments/dist-worker').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] });
      await db.doc('distribution_vouchers/dist-a').set({ warehouseId: 'kho-a' });
      await db.doc('distribution_vouchers/dist-b').set({ warehouseId: 'kho-b' });
    });
    const worker = env.authenticatedContext('dist-worker').firestore();
    const donor = env.authenticatedContext('dist-donor').firestore();
    await assertSucceeds(worker.doc('distribution_vouchers/dist-a').get());
    await assertFails(worker.doc('distribution_vouchers/dist-b').get());
    await assertFails(donor.doc('distribution_vouchers/dist-a').get());
    await assertFails(worker.doc('distribution_vouchers/dist-a').update({ beneficiaryId: 'forged' }));
  } finally {
    await env.cleanup();
  }
});
