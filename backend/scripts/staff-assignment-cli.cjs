const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { setStaffAssignment, revokeStaffAssignment } = require('../staff-assignment.cjs');

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const auth = getAuth();
  const [command, actorUid, targetUid, role, warehouseList] = process.argv.slice(2);

  if (command === 'bootstrap' && actorUid && !targetUid) {
    await setStaffAssignment({ db, auth, targetUid: actorUid, role: 'system_admin', bootstrap: true });
  } else if (command === 'assign' && actorUid && targetUid && role) {
    const warehouseIds = warehouseList ? warehouseList.split(',') : [];
    await setStaffAssignment({ db, auth, actorUid, targetUid, role, warehouseIds });
  } else if (command === 'revoke' && actorUid && targetUid && !role) {
    await revokeStaffAssignment({ db, actorUid, targetUid });
  } else {
    throw new Error('Usage: bootstrap <uid> | assign <actorUid> <targetUid> <role> [warehouseId,...] | revoke <actorUid> <targetUid>');
  }
  console.log('Staff assignment updated');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
