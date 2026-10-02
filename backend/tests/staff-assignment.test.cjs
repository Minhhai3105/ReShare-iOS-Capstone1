const test = require('node:test');
const assert = require('node:assert/strict');
const { setStaffAssignment, revokeStaffAssignment } = require('../staff-assignment.cjs');

function setup() {
  const documents = new Map();
  const db = {
    collection(name) {
      return { doc(id) { return { key: `${name}/${id}` }; } };
    },
    async runTransaction(work) {
      const writes = [];
      const result = await work({
        get: async reference => {
          const data = documents.get(reference.key);
          return { exists: data !== undefined, data: () => data };
        },
        set: (reference, data) => writes.push([reference.key, data])
      });
      for (const [key, data] of writes) documents.set(key, data);
      return result;
    }
  };
  const auth = { async getUser(uid) { return { uid, disabled: false }; } };
  return { db, auth, documents };
}

test('bootstrap is single-use and assignment changes have an audit entry', async () => {
  const { db, auth, documents } = setup();
  await setStaffAssignment({ db, auth, targetUid: 'admin', role: 'system_admin', bootstrap: true });
  assert.equal(documents.get('staff_assignments/admin').role, 'system_admin');
  assert.equal(documents.get('staff_bootstrap/initial_system_admin').uid, 'admin');
  await assert.rejects(setStaffAssignment({ db, auth, targetUid: 'other', role: 'system_admin', bootstrap: true }), /already bootstrapped/);

  documents.set('warehouses/kho-a', { status: 'active' });
  await setStaffAssignment({ db, auth, actorUid: 'admin', targetUid: 'worker', role: 'warehouse_admin', warehouseIds: ['kho-a'] });
  assert.deepEqual(documents.get('staff_assignments/worker').warehouseIds, ['kho-a']);
  assert.equal([...documents.keys()].filter(key => key.startsWith('staff_assignment_audit/')).length, 2);
});

test('inactive warehouses, warehouse admins and disabled users cannot grant access', async () => {
  const { db, auth, documents } = setup();
  documents.set('staff_assignments/admin', { role: 'system_admin', active: true });
  documents.set('staff_assignments/worker', { role: 'warehouse_admin', active: true, warehouseIds: ['kho-a'] });
  documents.set('warehouses/kho-a', { status: 'active' });
  documents.set('warehouses/kho-b', { status: 'inactive' });

  await assert.rejects(setStaffAssignment({ db, auth, actorUid: 'worker', targetUid: 'other', role: 'system_admin' }), /Only an active System Admin/);
  await assert.rejects(setStaffAssignment({ db, auth, actorUid: 'admin', targetUid: 'admin', role: 'warehouse_admin', warehouseIds: ['kho-a'] }), /cannot change own/);
  await assert.rejects(setStaffAssignment({ db, auth, actorUid: 'admin', targetUid: 'other', role: 'warehouse_admin', warehouseIds: ['kho-b'] }), /not active/);
  await assert.rejects(setStaffAssignment({ db, auth, actorUid: 'admin', targetUid: 'other', role: 'warehouse_admin', warehouseIds: [] }), /does not match role/);
  await assert.rejects(setStaffAssignment({ db, auth: { getUser: async () => ({ disabled: true }) }, actorUid: 'admin', targetUid: 'other', role: 'system_admin' }), /Disabled account/);
  assert.equal(documents.has('staff_assignments/other'), false);
});

test('revocation removes access and cannot be performed by warehouse admin', async () => {
  const { db, documents } = setup();
  documents.set('staff_assignments/admin', { role: 'system_admin', active: true, warehouseIds: [] });
  documents.set('staff_assignments/worker', { role: 'warehouse_admin', active: true, warehouseIds: ['kho-a'] });
  await assert.rejects(revokeStaffAssignment({ db, actorUid: 'worker', targetUid: 'admin' }), /Only an active System Admin/);
  await assert.rejects(revokeStaffAssignment({ db, actorUid: 'admin', targetUid: 'admin' }), /cannot revoke own/);
  await revokeStaffAssignment({ db, actorUid: 'admin', targetUid: 'worker' });
  assert.equal(documents.get('staff_assignments/worker').active, false);
  assert.deepEqual(documents.get('staff_assignments/worker').warehouseIds, []);
  await assert.rejects(revokeStaffAssignment({ db, actorUid: 'admin', targetUid: 'worker' }), /not found/);
});
