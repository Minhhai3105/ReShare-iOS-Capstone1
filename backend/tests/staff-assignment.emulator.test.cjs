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
    assert.equal((await db.collection('staff_assignment_audit').get()).size, 3);
  } finally {
    await deleteApp(app);
  }
});
