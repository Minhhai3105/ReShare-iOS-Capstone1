const { randomUUID } = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');

const STAFF_ROLES = new Set(['system_admin', 'warehouse_admin']);
const WAREHOUSE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

async function setStaffAssignment({ db, auth, actorUid, targetUid, role, warehouseIds = [], bootstrap = false }) {
  if (typeof targetUid !== 'string' || !targetUid || targetUid.includes('/')) throw new Error('Invalid target UID');
  if (!STAFF_ROLES.has(role)) throw new Error('Invalid staff role');
  if (!Array.isArray(warehouseIds) || warehouseIds.length > 10 ||
      new Set(warehouseIds).size !== warehouseIds.length ||
      !warehouseIds.every(id => typeof id === 'string' && WAREHOUSE_ID.test(id))) {
    throw new Error('Invalid warehouse IDs');
  }
  if ((role === 'system_admin' && warehouseIds.length !== 0) ||
      (role === 'warehouse_admin' && warehouseIds.length === 0)) {
    throw new Error('Warehouse assignment does not match role');
  }
  if (bootstrap && (role !== 'system_admin' || actorUid)) throw new Error('Invalid bootstrap request');
  if (!bootstrap && (typeof actorUid !== 'string' || !actorUid || actorUid.includes('/'))) {
    throw new Error('Actor UID required');
  }
  if (!bootstrap && actorUid === targetUid) throw new Error('System Admin cannot change own assignment');

  const user = await auth.getUser(targetUid);
  if (user.disabled) throw new Error('Disabled account cannot receive staff access');

  const targetRef = db.collection('staff_assignments').doc(targetUid);
  const actorRef = bootstrap ? null : db.collection('staff_assignments').doc(actorUid);
  const markerRef = bootstrap ? db.collection('staff_bootstrap').doc('initial_system_admin') : null;
  const warehouseRefs = warehouseIds.map(id => db.collection('warehouses').doc(id));
  const auditRef = db.collection('staff_assignment_audit').doc(randomUUID());

  await db.runTransaction(async transaction => {
    const [target, actor, marker, ...warehouses] = await Promise.all([
      transaction.get(targetRef),
      actorRef ? transaction.get(actorRef) : Promise.resolve(null),
      markerRef ? transaction.get(markerRef) : Promise.resolve(null),
      ...warehouseRefs.map(ref => transaction.get(ref))
    ]);

    if (bootstrap) {
      if (marker.exists || target.exists) throw new Error('System Admin already bootstrapped');
    } else if (!actor.exists || actor.data().active !== true || actor.data().role !== 'system_admin') {
      throw new Error('Only an active System Admin may assign staff access');
    }
    if (warehouses.some(snapshot => !snapshot.exists || snapshot.data().status !== 'active')) {
      throw new Error('Warehouse is not active or verified');
    }

    const before = target.exists ? target.data() : null;
    const after = { uid: targetUid, role, warehouseIds, active: true, updatedAt: FieldValue.serverTimestamp() };
    transaction.set(targetRef, after);
    transaction.set(auditRef, { actorUid: actorUid || 'bootstrap', targetUid, before, after, createdAt: FieldValue.serverTimestamp() });
    if (markerRef) transaction.set(markerRef, { uid: targetUid, createdAt: FieldValue.serverTimestamp() });
  });
}

async function revokeStaffAssignment({ db, actorUid, targetUid }) {
  if (typeof actorUid !== 'string' || !actorUid || actorUid.includes('/') ||
      typeof targetUid !== 'string' || !targetUid || targetUid.includes('/')) {
    throw new Error('Valid actor and target UIDs required');
  }
  if (actorUid === targetUid) throw new Error('System Admin cannot revoke own assignment');
  const actorRef = db.collection('staff_assignments').doc(actorUid);
  const targetRef = db.collection('staff_assignments').doc(targetUid);
  const auditRef = db.collection('staff_assignment_audit').doc(randomUUID());

  await db.runTransaction(async transaction => {
    const [actor, target] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);
    if (!actor.exists || actor.data().active !== true || actor.data().role !== 'system_admin') {
      throw new Error('Only an active System Admin may revoke staff access');
    }
    if (!target.exists || target.data().active !== true) throw new Error('Active staff assignment not found');
    const before = target.data();
    const after = { ...before, active: false, warehouseIds: [], updatedAt: FieldValue.serverTimestamp() };
    transaction.set(targetRef, after);
    transaction.set(auditRef, { actorUid, targetUid, before, after, createdAt: FieldValue.serverTimestamp() });
  });
}

module.exports = { setStaffAssignment, revokeStaffAssignment };
