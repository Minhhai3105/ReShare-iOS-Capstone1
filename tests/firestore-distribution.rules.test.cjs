const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('US17: distribution vouchers are only reachable through the trusted API', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc('staff_assignments/dist-worker').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] });
      await db.doc('staff_assignments/dist-admin').set({ active: true, role: 'system_admin', warehouseIds: [] });
      // Seed đủ trường riêng tư: API lọc chúng, nên Rules phải chặn đọc raw document.
      await db.doc('distribution_vouchers/dist-a').set({
        warehouseId: 'kho-a', beneficiaryId: 'nth-0001',
        beneficiaryPhone: 'private-must-not-leak',
        actor: { email: 'staff-private@example.com' },
      });
      await db.doc('distribution_vouchers/dist-b').set({ warehouseId: 'kho-b' });
    });
    const worker = env.authenticatedContext('dist-worker').firestore();
    const admin = env.authenticatedContext('dist-admin').firestore();
    const donor = env.authenticatedContext('dist-donor').firestore();
    // Ngay cả nhân sự đúng kho cũng không đọc được trực tiếp; mọi đường đọc đi qua API.
    await assertFails(worker.doc('distribution_vouchers/dist-a').get());
    await assertFails(admin.doc('distribution_vouchers/dist-a').get());
    await assertFails(worker.collection('distribution_vouchers').get());
    await assertFails(worker.doc('distribution_vouchers/dist-b').get());
    await assertFails(donor.doc('distribution_vouchers/dist-a').get());
    await assertFails(worker.doc('distribution_vouchers/dist-a').update({ beneficiaryId: 'forged' }));
    await assertFails(admin.doc('distribution_vouchers/forged').set({ warehouseId: 'kho-a' }));
  } finally {
    // Rules test dùng chung emulator với backend test; phải xoá dữ liệu seed.
    await env.clearFirestore();
    await env.cleanup();
  }
});
