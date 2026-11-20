const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createUsersAdminApi } = require('../users-admin-api.cjs');
const { createModerationApi } = require('../moderation-api.cjs');

const emulator = { skip: !process.env.FIRESTORE_EMULATOR_HOST };
const base = '/v1/admin/users';
const sa = 'users-test-sa';
const wa = 'users-test-wa';
const donor = 'users-test-donor';
const noProfile = 'users-test-no-profile';
const headers = uid => ({ authorization: `Bearer ${uid}` });
const authMissing = () => Object.assign(new Error('Không có tài khoản thử'), { code: 'auth/user-not-found' });

async function setup(t) {
  const app = initializeApp({ projectId: 'demo-reshare' }, `users-admin-${t.name}`);
  const db = getFirestore(app);
  const records = new Map([sa, wa, donor, noProfile].map(uid => [uid, {
    uid, email: `${uid}@example.test`, displayName: 'Tên Firebase', disabled: false,
    providerData: [{ providerId: 'password' }, { providerId: 'google.com' }],
    metadata: { creationTime: 'Wed, 18 Nov 2026 08:00:00 GMT', lastSignInTime: 'Thu, 19 Nov 2026 08:00:00 GMT' },
  }]));
  const calls = [];
  const failures = { revoke: false };
  const auth = {
    async getUser(uid) {
      if (!records.has(uid)) throw authMissing();
      return records.get(uid);
    },
    async getUserByEmail(email) {
      calls.push(['email', email]);
      const found = [...records.values()].find(user => user.email === email);
      if (!found) throw authMissing();
      return found;
    },
    async listUsers(limit, token) {
      calls.push(['list', limit, token]);
      if (token && token !== 'page-2') throw Object.assign(new Error('Sai token'), { code: 'auth/invalid-page-token' });
      return token ? { users: [records.get(noProfile)] }
        : { users: [records.get(donor), records.get(wa)], pageToken: 'page-2' };
    },
    async updateUser(uid, change) {
      calls.push(['update', uid, change.disabled]);
      Object.assign(records.get(uid), change);
    },
    async revokeRefreshTokens(uid) {
      calls.push(['revoke', uid]);
      if (failures.revoke) { failures.revoke = false; throw new Error('Auth lỗi thử nghiệm'); }
    },
  };
  const authOptions = { db, auth, verifyToken: async uid => ({ uid }), serverTimestamp: () => FieldValue.serverTimestamp() };
  const usersApi = createUsersAdminApi(authOptions);
  const moderationApi = createModerationApi(authOptions);
  const initial = {
    [`staff_assignments/${sa}`]: { role: 'system_admin', active: true },
    [`staff_assignments/${wa}`]: { role: 'warehouse_admin', active: true },
    [`users/${donor}`]: { displayName: 'Tên hồ sơ', phoneNumber: '0000000000' },
    'donations/users-test-1': { donorId: donor, status: 'pending' },
    'donations/users-test-2': { donorId: donor, status: 'completed' },
    'donations/users-test-other': { donorId: noProfile },
    'catalog_items/users-test-open': { donorId: donor, status: 'available' },
    'catalog_items/users-test-done': { donorId: donor, status: 'completed' },
  };
  t.after(async () => {
    const existing = await db.collection('moderation_audit').get();
    await Promise.all([
      ...Object.keys(initial).map(path => db.doc(path)), db.doc(`users/${noProfile}`),
      ...existing.docs.filter(doc => [donor, noProfile].includes(doc.data().targetUid)).map(doc => doc.ref),
    ].map(ref => ref.delete()));
    await deleteApp(app);
  });
  await Promise.all(Object.entries(initial).map(([path, value]) => db.doc(path).set(value)));
  return {
    db, records, calls, failures,
    list: (path = base, actor = sa) => usersApi.handle('GET', base, headers(actor), null, path),
    summary: (uid, actor = sa) => usersApi.handle('GET', `${base}/${uid}/summary`, headers(actor)),
    suspend: (uid, reason, actor = sa) => usersApi.handle('POST', `${base}/${uid}/suspend`, headers(actor), { reason }),
    unsuspend: uid => moderationApi.handle('POST', `/v1/admin/moderation/users/${uid}/unsuspend`, headers(sa), { reason: 'Đã đối soát' }),
  };
}

test('Chặn ba API với Warehouse Admin và donor, phân trang Auth và tìm email chính xác', emulator, async t => {
  const ctx = await setup(t);
  for (const actor of [wa, donor]) {
    await assert.rejects(ctx.list(base, actor), { status: 403 });
    await assert.rejects(ctx.summary(donor, actor), { status: 403 });
    await assert.rejects(ctx.suspend(donor, 'Không đủ quyền', actor), { status: 403 });
  }
  assert.deepEqual(ctx.calls, []);
  const { users, nextPageToken } = (await ctx.list()).body;
  assert.deepEqual(users.map(row => row.uid), [donor, wa]);
  assert.equal(users[0].displayName, 'Tên hồ sơ');
  assert.equal(users[0].phoneNumber, '0000000000');
  assert.deepEqual(users[0].providers, ['email', 'google']);
  assert.equal(users[0].createdAt, '2026-11-18T08:00:00.000Z');
  assert.equal(users[1].staffRole, 'warehouse_admin');
  assert.equal(nextPageToken, 'page-2');
  assert.deepEqual(ctx.calls[0], ['list', 100, undefined]);
  assert.equal((await ctx.list(`${base}?pageToken=page-2`)).body.users[0].uid, noProfile);
  assert.equal((await ctx.list(`${base}?email=${donor}@example.test`)).body.users[0].uid, donor);
  assert.deepEqual((await ctx.list(`${base}?email=missing@example.test`)).body.users, []);
  await assert.rejects(ctx.list(`${base}?email=thiếu-miền`), { status: 400, code: 'INVALID_EMAIL' });
  await assert.rejects(ctx.list(`${base}?pageToken=invalid`), { status: 400, code: 'INVALID_PAGE_TOKEN' });
  assert.deepEqual((await ctx.summary(donor)).body, { donationCount: 2, listingCount: 2 });
});

test('Khoá và mở khoá trực tiếp có audit, giữ bài đã trao và chặn khoá nhân sự', emulator, async t => {
  const ctx = await setup(t);
  await assert.rejects(ctx.suspend(wa, 'Nhân sự đang hoạt động'), { status: 409, code: 'STAFF_ACCOUNT' });
  await assert.rejects(ctx.suspend(donor, ' '), { status: 400, code: 'VALIDATION' });
  assert.equal((await ctx.suspend(donor, '  Đã xác minh vi phạm  ')).status, 200);
  assert.equal(ctx.records.get(donor).disabled, true);
  assert.deepEqual(ctx.calls, [['update', donor, true], ['revoke', donor]]);
  assert.equal((await ctx.db.doc(`users/${donor}`).get()).data().suspended, true);
  assert.equal((await ctx.db.doc('catalog_items/users-test-open').get()).data().status, 'removed');
  assert.equal((await ctx.db.doc('catalog_items/users-test-done').get()).data().status, 'completed');
  await assert.rejects(ctx.suspend(donor, 'Bấm lại'), { status: 409, code: 'ALREADY_SUSPENDED' });
  await ctx.unsuspend(donor);
  assert.equal(ctx.records.get(donor).disabled, false);
  assert.equal((await ctx.db.doc(`users/${donor}`).get()).data().suspended, false);
  const audit = (await ctx.db.collection('moderation_audit').where('targetUid', '==', donor).get()).docs.map(doc => doc.data());
  assert.equal(audit.length, 2);
  assert.ok(audit.some(log => log.action === 'suspend_user' && log.source === 'users_page' && log.reason === 'Đã xác minh vi phạm'));
  assert.ok(audit.some(log => log.action === 'unsuspend_user'));
});

test('Khoá dở có thể thử lại, không mở khoá chồng hoặc ghi trùng audit', emulator, async t => {
  const ctx = await setup(t);
  ctx.failures.revoke = true;
  await assert.rejects(ctx.suspend(noProfile, 'Lý do ban đầu'), { status: 502, code: 'SUSPEND_INCOMPLETE' });
  const mid = (await ctx.db.doc(`users/${noProfile}`).get()).data();
  assert.equal(mid.suspended, true);
  assert.equal(mid.suspendPending, true);
  assert.equal(mid.role, 'donor');
  assert.equal(mid.email, ctx.records.get(noProfile).email);
  assert.ok(mid.createdAt.toDate() instanceof Date);
  await assert.rejects(ctx.unsuspend(noProfile), { status: 409, code: 'MODERATION_IN_PROGRESS' });
  await ctx.suspend(noProfile, 'Thử tiếp');
  const audit = (await ctx.db.collection('moderation_audit').where('targetUid', '==', noProfile).get()).docs;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].data().reason, 'Lý do ban đầu');
  await ctx.unsuspend(noProfile);
  assert.equal(ctx.records.get(noProfile).disabled, false);
});
