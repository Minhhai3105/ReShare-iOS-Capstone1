const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('US15: hồ sơ riêng tư chỉ đi qua trusted API, mọi client đều bị chặn', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc('staff_assignments/beneficiary-worker').set({
        active: true, role: 'warehouse_admin', warehouseIds: ['beneficiary-warehouse'],
      });
      await db.doc('staff_assignments/beneficiary-admin').set({
        active: true, role: 'system_admin', warehouseIds: [],
      });
      await db.doc('beneficiaries/private-profile').set({
        name: 'Người nhận', warehouseId: 'beneficiary-warehouse',
        phone: '0901234567', notes: 'Thông tin riêng tư', status: 'approved',
      });
      await db.doc('beneficiary_audit/private-profile_v2').set({
        beneficiaryId: 'private-profile', actorUid: 'beneficiary-admin',
        changes: { phone: { before: '0901234567', after: '000' } },
      });
    });

    for (const uid of ['beneficiary-worker', 'beneficiary-admin', 'beneficiary-donor']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(db.doc('beneficiaries/private-profile').get());
      await assertFails(db.collection('beneficiaries').get());
      await assertFails(db.doc('beneficiaries/new-profile').set({ name: 'Tự tạo' }));
      await assertFails(db.doc('beneficiaries/private-profile').update({ phone: '000' }));
      await assertFails(db.doc('beneficiaries/private-profile').delete());
      await assertFails(db.doc('beneficiary_audit/private-profile_v2').get());
      await assertFails(db.doc('beneficiary_audit/private-profile_v3').set({ action: 'approved' }));
    }
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});
