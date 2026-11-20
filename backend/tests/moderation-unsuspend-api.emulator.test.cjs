const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createModerationApi } = require('../moderation-api.cjs');

const base = '/v1/admin/moderation';
const target = 'unsuspend-target';
const sa = 'unsuspend-sa';
const headers = uid => ({ authorization: `Bearer ${uid}` });
const emulator = { skip: !process.env.FIRESTORE_EMULATOR_HOST };

async function setup(t, auth) {
  const app = initializeApp({ projectId: 'demo-reshare' }, `moderation-${t.name}`);
  const db = getFirestore(app);
  const profile = db.collection('users').doc(target);
  const saRef = db.collection('staff_assignments').doc(sa);
  const warehouse = db.collection('staff_assignments').doc('unsuspend-wa');
  const audit = db.collection('moderation_audit').where('targetUid', '==', target);
  const report = db.collection('reports').doc('unsuspend-report');
  t.after(async () => {
    const snapshot = await audit.get();
    await Promise.all([profile, saRef, warehouse, report, ...snapshot.docs.map(doc => doc.ref)].map(ref => ref.delete()));
    await deleteApp(app);
  });
  await Promise.all([
    profile.set({ displayName: 'Người đang bị khoá', suspended: true, suspendedAt: new Date('2026-11-18T09:00:00Z') }),
    saRef.set({ role: 'system_admin', active: true }),
    warehouse.set({ role: 'warehouse_admin', active: true, warehouseIds: ['kho-a'] }),
  ]);
  const api = createModerationApi({
    db, auth, verifyToken: async uid => ({ uid }), serverTimestamp: () => FieldValue.serverTimestamp(),
  });
  return {
    profile, audit, report,
    list: uid => api.handle('GET', `${base}/suspended-users`, headers(uid)),
    open: (body, uid = sa, id = target) => api.handle('POST', `${base}/users/${id}/unsuspend`, headers(uid), body),
    suspendViaReport: () => api.handle('POST', `${base}/reports/${report.id}/resolve`, headers(sa), { action: 'suspend_user' }),
  };
}

test('Chỉ System Admin xem email và mở khoá; lý do được lưu đúng một lần', emulator, async t => {
  const calls = [];
  const ctx = await setup(t, {
    getUsers: async ids => {
      calls.push(['getUsers', ids]);
      return { users: [{ uid: target, email: 'test@example.test' }] };
    },
    updateUser: async (uid, change) => { calls.push(['updateUser', uid, change]); },
  });

  for (const uid of ['unsuspend-wa', 'unsuspend-donor']) {
    await assert.rejects(ctx.list(uid), { status: 403, code: 'SYSTEM_ADMIN_REQUIRED' });
    await assert.rejects(ctx.open({ reason: 'Đã xác minh' }, uid), { status: 403 });
  }
  assert.deepEqual(calls, []);
  const { users } = (await ctx.list(sa)).body;
  assert.deepEqual(users.find(user => user.uid === target), {
    uid: target, displayName: 'Người đang bị khoá', email: 'test@example.test',
    suspendedAt: '2026-11-18T09:00:00.000Z', unsuspendPending: false,
  });
  assert.deepEqual(calls, [['getUsers', [{ uid: target }]]]);

  for (const invalid of [undefined, {}, { reason: '   ' }, { reason: 5 }, { reason: 'x'.repeat(501) }]) {
    await assert.rejects(ctx.open(invalid), { status: 400, code: 'VALIDATION' });
  }
  await assert.rejects(ctx.open({ reason: 'Đã xác minh' }, sa, 'unsuspend-missing'), { status: 404, code: 'USER_NOT_FOUND' });
  assert.equal((await ctx.audit.get()).size, 0);
  const result = await ctx.open({ reason: '  Đã xác minh  ' });
  assert.deepEqual(result, { status: 200, body: { uid: target, suspended: false } });
  const profile = (await ctx.profile.get()).data();
  assert.equal(profile.suspended, false);
  assert.equal(profile.unsuspendPending, false);
  assert.equal(profile.unsuspendedBy, sa);
  assert.equal(profile.unsuspendReason, 'Đã xác minh');
  const { docs } = await ctx.audit.get();
  assert.equal(docs.length, 1);
  const { createdAt, ...entry } = docs[0].data();
  assert.ok(createdAt.toDate() instanceof Date);
  assert.deepEqual(entry, { action: 'unsuspend_user', targetUid: target, actorUid: sa, reason: 'Đã xác minh' });
  assert.deepEqual(calls[1], ['updateUser', target, { disabled: false }]);
  assert.equal((await ctx.list(sa)).body.users.some(user => user.uid === target), false);
  await assert.rejects(ctx.open({ reason: 'Thử lại' }), { status: 409, code: 'NOT_SUSPENDED' });
});

test('Auth lỗi giữa chừng vẫn tìm được tài khoản để hoàn tất; không ghi trùng lý do và audit', emulator, async t => {
  let disabled = true;
  let failFirst = true;
  const ctx = await setup(t, {
    getUsers: async () => ({ users: [] }),
    updateUser: async (_uid, change) => {
      if (failFirst) { failFirst = false; throw new Error('Auth tạm lỗi'); }
      disabled = change.disabled;
    },
  });
  await assert.rejects(ctx.open({ reason: 'Lý do đã duyệt' }), { status: 502, code: 'UNSUSPEND_INCOMPLETE' });
  const pending = (await ctx.profile.get()).data();
  assert.equal(pending.suspended, false);
  assert.equal(pending.unsuspendPending, true);
  assert.equal(disabled, true);
  const listed = (await ctx.list(sa)).body.users.find(user => user.uid === target);
  assert.equal(listed.unsuspendPending, true);
  assert.equal(listed.email, null);

  await ctx.open({ reason: 'Thử hoàn tất' });
  assert.equal(disabled, false);
  const finished = (await ctx.profile.get()).data();
  assert.equal(finished.unsuspendPending, false);
  assert.equal(finished.unsuspendReason, 'Lý do đã duyệt');
  assert.equal((await ctx.audit.get()).size, 1);
});

test('Thao tác khoá và mở khoá cùng tài khoản không chạy chồng nhau', emulator, async t => {
  let begin, finish;
  const started = new Promise(resolve => { begin = resolve; });
  const hold = new Promise(resolve => { finish = resolve; });
  const ctx = await setup(t, { updateUser: async () => { begin(); await hold; } });
  const report = { status: 'open', targetType: 'user', targetId: target, targetUserId: target };
  await ctx.report.set({ ...report, actionTargetUid: target, pendingAction: 'suspend_user' });
  await assert.rejects(ctx.open({ reason: 'Chưa thể mở' }), { status: 409, code: 'MODERATION_IN_PROGRESS' });
  await ctx.report.set(report);

  const first = ctx.open({ reason: 'Mở khoá' });
  await Promise.race([started, first]);
  try {
    await assert.rejects(ctx.open({ reason: 'Bấm trùng' }), { status: 409, code: 'MODERATION_IN_PROGRESS' });
    await assert.rejects(ctx.suspendViaReport(), { status: 409, code: 'MODERATION_IN_PROGRESS' });
  } finally {
    finish();
    await first;
  }
  assert.equal((await ctx.audit.get()).size, 1);
});
