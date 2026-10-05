const { ApiError } = require('./image-api.cjs');
const { StaffAssignmentError, setStaffAssignment, revokeStaffAssignment } = require('./staff-assignment.cjs');

function createStaffApi({ db, auth, verifyToken }) {
  if (!db || !auth || !verifyToken) throw new Error('Staff API configuration is incomplete');

  async function requireSystemAdmin(headers) {
    const match = /^Bearer (\S+)$/.exec(headers.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try { claims = await verifyToken(match[1]); }
    catch { throw new ApiError(401, 'Invalid session'); }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');
    const assignment = await db.collection('staff_assignments').doc(claims.uid).get();
    if (!assignment.exists || assignment.data().role !== 'system_admin' || assignment.data().active !== true) {
      throw new ApiError(403, 'System Admin access required');
    }
    return claims.uid;
  }

  function assignmentData(snapshot) {
    if (!snapshot?.exists) return null;
    const data = snapshot.data();
    return {
      uid: data.uid || snapshot.id,
      role: data.role,
      active: data.active === true,
      warehouseIds: Array.isArray(data.warehouseIds) ? data.warehouseIds : [],
      updatedAt: data.updatedAt?.toDate?.().toISOString() || null,
    };
  }

  async function accountData(uid) {
    try {
      const user = await auth.getUser(uid);
      return { uid: user.uid, email: user.email || '', displayName: user.displayName || '', disabled: user.disabled === true };
    } catch (error) {
      if (error.code === 'auth/user-not-found') return { uid, email: '', displayName: '', disabled: true };
      throw error;
    }
  }

  async function handle(method, path, headers, body) {
    const routes = {
      'GET /v1/admin/staff': async () => {
        const snapshot = await db.collection('staff_assignments').limit(100).get();
        return { staff: await Promise.all(snapshot.docs.map(async doc => ({
          ...await accountData(doc.id), assignment: assignmentData(doc),
        }))) };
      },
      'GET /v1/admin/warehouses': async () => {
        const snapshot = await db.collection('warehouses').where('status', '==', 'active').limit(100).get();
        return { warehouses: snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id })) };
      },
      'GET /v1/admin/staff/audit': async () => {
        const snapshot = await db.collection('staff_assignment_audit').orderBy('createdAt', 'desc').limit(50).get();
        return { events: snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id, actorUid: data.actorUid, targetUid: data.targetUid,
            before: data.before ? assignmentData({ exists: true, id: data.targetUid, data: () => data.before }) : null,
            after: data.after ? assignmentData({ exists: true, id: data.targetUid, data: () => data.after }) : null,
            createdAt: data.createdAt?.toDate?.().toISOString() || null,
          };
        }) };
      },
      'POST /v1/admin/staff/lookup': async () => {
        const email = body?.email?.trim()?.toLowerCase();
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new ApiError(400, 'Valid staff email required');
        }
        let user;
        try { user = await auth.getUserByEmail(email); }
        catch (error) {
          if (error.code === 'auth/user-not-found') throw new ApiError(404, 'Account not found');
          throw error;
        }
        if (user.disabled) throw new ApiError(409, 'Firebase account is disabled');
        const assignment = await db.collection('staff_assignments').doc(user.uid).get();
        return { account: { ...await accountData(user.uid), assignment: assignmentData(assignment) } };
      },
      'POST /v1/admin/staff/assign': async actorUid => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Invalid request');
        try {
          await setStaffAssignment({
            db, auth, actorUid,
            targetUid: body.targetUid, role: body.role, warehouseIds: body.warehouseIds,
          });
        } catch (error) {
          if (error instanceof StaffAssignmentError) throw new ApiError(error.status, error.message);
          if (error.code === 'auth/user-not-found') throw new ApiError(404, 'Account not found');
          throw error;
        }
        const assignment = await db.collection('staff_assignments').doc(body.targetUid).get();
        return { assignment: assignmentData(assignment) };
      },
      'POST /v1/admin/staff/revoke': async actorUid => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Invalid request');
        try { await revokeStaffAssignment({ db, actorUid, targetUid: body.targetUid }); }
        catch (error) {
          if (error instanceof StaffAssignmentError) throw new ApiError(error.status, error.message);
          throw error;
        }
        const assignment = await db.collection('staff_assignments').doc(body.targetUid).get();
        return { assignment: assignmentData(assignment) };
      },
    };
    const route = routes[`${method} ${path}`];
    if (!route) throw new ApiError(404, 'Not found');
    const actorUid = await requireSystemAdmin(headers);
    return { status: 200, body: await route(actorUid) };
  }

  return { handle };
}

module.exports = { createStaffApi };
