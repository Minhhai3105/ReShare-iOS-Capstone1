const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { setStaffAssignment, revokeStaffAssignment } = require('../staff-assignment.cjs');

test('staff assignment and audit commit atomically in Firestore Emulator', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'staff-assignment-emulator-test');
  try {
    const db = getFirestore(app);
    const auth = { async getUser(uid) { return { uid, disabled: false }; } };
    await db.doc('warehouses/kho-a').set({ status: 'active' });

    await setStaffAssignment({ db, auth, targetUid: 'admin', role: 'system_admin', bootstrap: true });
    await setStaffAssignment({ db, auth, actorUid: 'admin', targetUid: 'worker', role: 'warehouse_admin', warehouseIds: ['kho-a'] });
    assert.deepEqual((await db.doc('staff_assignments/worker').get()).data().warehouseIds, ['kho-a']);

    await revokeStaffAssignment({ db, actorUid: 'admin', targetUid: 'worker' });
    assert.equal((await db.doc('staff_assignments/worker').get()).data().active, false);
    const audit = await db.collection('staff_assignment_audit').get();
    assert.equal(audit.size, 3);
    const revocation = audit.docs.map(doc => doc.data()).find(event => event.after?.active === false);
    assert.equal(revocation.actorUid, 'admin');
    assert.equal(revocation.targetUid, 'worker');
    assert.equal(revocation.before.active, true);
    assert.deepEqual(revocation.after.warehouseIds, []);
    assert.ok(revocation.createdAt.toDate() instanceof Date);
  } finally {
    await deleteApp(app);
  }
});
