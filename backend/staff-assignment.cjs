const { randomUUID } = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');

const STAFF_ROLES = new Set(['system_admin', 'warehouse_admin']);
const WAREHOUSE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

class StaffAssignmentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function setStaffAssignment({ db, auth, actorUid, targetUid, role, warehouseIds = [], bootstrap = false }) {
  if (typeof targetUid !== 'string' || !targetUid || targetUid.includes('/')) throw new StaffAssignmentError(400, 'Invalid target UID');
  if (!STAFF_ROLES.has(role)) throw new StaffAssignmentError(400, 'Invalid staff role');
  if (!Array.isArray(warehouseIds) || warehouseIds.length > 10 ||
      new Set(warehouseIds).size !== warehouseIds.length ||
      !warehouseIds.every(id => typeof id === 'string' && WAREHOUSE_ID.test(id))) {
    throw new StaffAssignmentError(400, 'Invalid warehouse IDs');
  }
  if ((role === 'system_admin' && warehouseIds.length !== 0) ||
      (role === 'warehouse_admin' && warehouseIds.length === 0)) {
    throw new StaffAssignmentError(400, 'Warehouse assignment does not match role');
  }
  if (bootstrap && (role !== 'system_admin' || actorUid)) throw new StaffAssignmentError(400, 'Invalid bootstrap request');
  if (!bootstrap && (typeof actorUid !== 'string' || !actorUid || actorUid.includes('/'))) {
    throw new StaffAssignmentError(400, 'Actor UID required');
  }
  if (!bootstrap && actorUid === targetUid) throw new StaffAssignmentError(400, 'System Admin cannot change own assignment');

  const user = await auth.getUser(targetUid);
  if (user.disabled) throw new StaffAssignmentError(409, 'Disabled account cannot receive staff access');

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
      if (marker.exists || target.exists) throw new StaffAssignmentError(409, 'System Admin already bootstrapped');
    } else if (!actor.exists || actor.data().active !== true || actor.data().role !== 'system_admin') {
      throw new StaffAssignmentError(403, 'Only an active System Admin may assign staff access');
    }
    if (warehouses.some(snapshot => !snapshot.exists || snapshot.data().status !== 'active')) {
      throw new StaffAssignmentError(409, 'Warehouse is not active or verified');
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
    throw new StaffAssignmentError(400, 'Valid actor and target UIDs required');
  }
  if (actorUid === targetUid) throw new StaffAssignmentError(400, 'System Admin cannot revoke own assignment');
  const actorRef = db.collection('staff_assignments').doc(actorUid);
  const targetRef = db.collection('staff_assignments').doc(targetUid);
  const auditRef = db.collection('staff_assignment_audit').doc(randomUUID());

  await db.runTransaction(async transaction => {
    const [actor, target] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);
    if (!actor.exists || actor.data().active !== true || actor.data().role !== 'system_admin') {
      throw new StaffAssignmentError(403, 'Only an active System Admin may revoke staff access');
    }
    if (!target.exists || target.data().active !== true) throw new StaffAssignmentError(404, 'Active staff assignment not found');
    const before = target.data();
    const after = { ...before, active: false, warehouseIds: [], updatedAt: FieldValue.serverTimestamp() };
    transaction.set(targetRef, after);
    transaction.set(auditRef, { actorUid, targetUid, before, after, createdAt: FieldValue.serverTimestamp() });
  });
}

module.exports = { StaffAssignmentError, setStaffAssignment, revokeStaffAssignment };
