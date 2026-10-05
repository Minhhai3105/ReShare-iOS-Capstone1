const test = require('node:test');
const assert = require('node:assert/strict');
const { createStaffApi } = require('../staff-api.cjs');

function setup() {
  const documents = new Map([
    ['staff_assignments/admin', { uid: 'admin', role: 'system_admin', active: true, warehouseIds: [] }],
    ['staff_assignments/second-admin', { uid: 'second-admin', role: 'system_admin', active: true, warehouseIds: [] }],
    ['staff_assignments/worker', { uid: 'worker', role: 'warehouse_admin', active: true, warehouseIds: ['kho-a'] }],
    ['warehouses/kho-a', { name: 'Kho A', status: 'active' }],
    ['warehouses/kho-closed', { name: 'Kho đóng', status: 'inactive' }],
  ]);
  const users = new Map([
    ['admin', { uid: 'admin', email: 'admin@example.com', disabled: false }],
    ['second-admin', { uid: 'second-admin', email: 'admin2@example.com', disabled: false }],
    ['worker', { uid: 'worker', email: 'worker@example.com', disabled: false }],
    ['donor', { uid: 'donor', email: 'donor@example.com', disabled: false }],
  ]);
  const snapshot = (id, data) => ({ id, exists: data !== undefined, data: () => data });
  const docsFor = collection => [...documents.entries()]
    .filter(([key]) => key.startsWith(`${collection}/`))
    .map(([key, data]) => snapshot(key.slice(collection.length + 1), data));
  const db = {
    collection(name) {
      return {
        doc(id) {
          return { key: `${name}/${id}`, id, async get() { return snapshot(id, documents.get(this.key)); } };
        },
        limit(count) { return { async get() { return { docs: docsFor(name).slice(0, count) }; } }; },
        where(field, operator, value) {
          assert.equal(operator, '==');
          return { limit(count) { return { async get() {
            return { docs: docsFor(name).filter(doc => doc.data()[field] === value).slice(0, count) };
          } }; } };
        },
        orderBy() { return { limit(count) { return { async get() { return { docs: docsFor(name).slice(0, count) }; } }; } }; },
      };
    },
    async runTransaction(work) {
      const writes = [];
      const result = await work({
        get: async ref => snapshot(ref.id, documents.get(ref.key)),
        set: (ref, data) => writes.push([ref.key, data]),
      });
      for (const [key, data] of writes) documents.set(key, data);
      return result;
    },
  };
  const auth = {
    async getUser(uid) {
      if (!users.has(uid)) throw Object.assign(new Error('Not found'), { code: 'auth/user-not-found' });
      return users.get(uid);
    },
    async getUserByEmail(email) {
      const user = [...users.values()].find(item => item.email === email);
      if (!user) throw Object.assign(new Error('Not found'), { code: 'auth/user-not-found' });
      return user;
    },
  };
  const api = createStaffApi({ db, auth, verifyToken: async token => {
    if (token === 'expired') throw new Error('Expired token');
    return { uid: token };
  } });
  const call = (method, path, uid, body) => api.handle(method, path,
    uid ? { authorization: `Bearer ${uid}` } : {}, body);
  return { call, documents };
}

test('only an active System Admin can list and change staff', async () => {
  const { call, documents } = setup();
  await assert.rejects(call('GET', '/v1/admin/staff'), { status: 401 });
  await assert.rejects(call('GET', '/v1/admin/staff', 'expired'), { status: 401 });
  await assert.rejects(call('GET', '/v1/admin/staff', 'donor'), { status: 403 });
  await assert.rejects(call('GET', '/v1/admin/staff/audit', 'worker'), { status: 403 });
  await assert.rejects(call('POST', '/v1/admin/staff/assign', 'worker', {
    targetUid: 'donor', role: 'system_admin', warehouseIds: []
  }), { status: 403 });
  assert.equal(documents.has('staff_assignments/donor'), false);
  assert.equal((await call('GET', '/v1/admin/staff', 'admin')).body.staff.length, 3);
  assert.deepEqual((await call('GET', '/v1/admin/warehouses', 'admin')).body.warehouses,
    [{ id: 'kho-a', name: 'Kho A' }]);
});

test('lookup, assign, revoke and audit work without disabling the donor account', async () => {
  const { call, documents } = setup();
  const lookup = await call('POST', '/v1/admin/staff/lookup', 'admin', { email: 'donor@example.com' });
  assert.equal(lookup.body.account.uid, 'donor');
  assert.equal(lookup.body.account.assignment, null);
  await assert.rejects(call('POST', '/v1/admin/staff/lookup', 'admin', { email: 'missing@example.com' }), { status: 404 });
  await assert.rejects(call('POST', '/v1/admin/staff/assign', 'admin', {
    targetUid: 'admin', role: 'warehouse_admin', warehouseIds: ['kho-a']
  }), { status: 400 });
  await assert.rejects(call('POST', '/v1/admin/staff/assign', 'admin', {
    targetUid: 'donor', role: 'warehouse_admin', warehouseIds: ['kho-closed']
  }), { status: 409 });
  const assigned = await call('POST', '/v1/admin/staff/assign', 'admin', {
    targetUid: 'donor', role: 'warehouse_admin', warehouseIds: ['kho-a']
  });
  assert.deepEqual(assigned.body.assignment.warehouseIds, ['kho-a']);
  assert.equal(documents.get('staff_assignments/donor').active, true);
  const revoked = await call('POST', '/v1/admin/staff/revoke', 'admin', { targetUid: 'donor' });
  assert.equal(revoked.body.assignment.active, false);
  assert.deepEqual(revoked.body.assignment.warehouseIds, []);
  const events = (await call('GET', '/v1/admin/staff/audit', 'admin')).body.events;
  assert.equal(events.length, 2);
  const revocation = events.find(event => event.after?.active === false);
  assert.equal(revocation.actorUid, 'admin');
  assert.equal(revocation.targetUid, 'donor');
  assert.equal(revocation.before.active, true);
  assert.equal((await call('POST', '/v1/admin/staff/lookup', 'admin', { email: 'donor@example.com' })).body.account.disabled, false);
});

test('same valid token loses access immediately after trusted revocation', async () => {
  const { call } = setup();
  await call('GET', '/v1/admin/staff', 'second-admin');
  await call('POST', '/v1/admin/staff/revoke', 'admin', { targetUid: 'second-admin' });
  await assert.rejects(call('GET', '/v1/admin/staff', 'second-admin'), { status: 403 });
  await assert.rejects(call('POST', '/v1/admin/staff/assign', 'second-admin', {
    targetUid: 'donor', role: 'system_admin', warehouseIds: []
  }), { status: 403 });
});
