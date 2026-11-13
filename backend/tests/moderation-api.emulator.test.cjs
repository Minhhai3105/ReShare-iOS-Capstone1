const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createModerationApi, REMOVED_MESSAGE } = require('../moderation-api.cjs');

const SA = { authorization: 'Bearer mod-sa' };
const WA = { authorization: 'Bearer mod-wa' };

test('Báo cáo vi phạm: chỉ System Admin xem và xử lý; gỡ bài, gỡ tin nhắn, khoá tài khoản, bỏ qua', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'moderation-api-emulator-test');
  const db = getFirestore(app);
  const paths = [
    'staff_assignments/mod-sa', 'staff_assignments/mod-wa', 'staff_assignments/mod-staff-user',
    'users/mod-reporter', 'users/mod-bad', 'catalog_items/cat_mod-1', 'catalog_items/cat_mod-2', 'catalog_items/cat_mod-done',
    'conversations/mod-chat', 'conversations/mod-chat/messages/mod-msg',
    'reports/rep-listing', 'reports/rep-message', 'reports/rep-user', 'reports/rep-dismiss', 'reports/rep-staff',
  ];
  try {
    await db.doc('staff_assignments/mod-sa').set({ active: true, role: 'system_admin', warehouseIds: [] });
    await db.doc('staff_assignments/mod-wa').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] });
    await db.doc('staff_assignments/mod-staff-user').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] });
    await db.doc('users/mod-reporter').set({ displayName: 'Người báo cáo' });
    await db.doc('users/mod-bad').set({ displayName: 'Người vi phạm' });
    await db.doc('catalog_items/cat_mod-1').set({ donorId: 'mod-bad', title: 'Bài lừa đảo', status: 'available', images: ['https://img/1.jpg'] });
    await db.doc('catalog_items/cat_mod-2').set({ donorId: 'mod-bad', title: 'Bài khác', status: 'available' });
    await db.doc('catalog_items/cat_mod-done').set({ donorId: 'mod-bad', title: 'Đã trao', status: 'completed' });
    await db.doc('conversations/mod-chat').set({ donorId: 'mod-reporter', requesterId: 'mod-bad', participantIds: ['mod-reporter', 'mod-bad'] });
    await db.doc('conversations/mod-chat/messages/mod-msg').set({ senderId: 'mod-bad', text: 'Tin nhắn quấy rối' });
    const at = seconds => new Date(Date.UTC(2026, 10, 13, 8, 0, seconds));
    const report = (id, { s, ...extra }) => db.doc(`reports/${id}`).set({ reporterId: 'mod-reporter', reason: 'scam', status: 'open', createdAt: at(s), ...extra });
    await report('rep-listing', { targetType: 'listing', targetId: 'cat_mod-1', targetUserId: 'mod-bad', s: 1 });
    await report('rep-message', { targetType: 'message', targetId: 'mod-msg', conversationId: 'mod-chat', targetUserId: 'mod-bad', reason: 'harassment', s: 2 });
    await report('rep-user', { targetType: 'user', targetId: 'mod-bad', targetUserId: 'mod-bad', s: 3 });
    await report('rep-dismiss', { targetType: 'user', targetId: 'mod-bad', targetUserId: 'mod-bad', note: 'nhầm', s: 4 });
    await report('rep-staff', { targetType: 'user', targetId: 'mod-staff-user', targetUserId: 'mod-staff-user', s: 5 });

    const authCalls = [];
    const api = createModerationApi({
      db, verifyToken: async token => ({ uid: token }), serverTimestamp: () => FieldValue.serverTimestamp(),
      auth: {
        updateUser: async (uid, change) => { authCalls.push(['updateUser', uid, change]); },
        revokeRefreshTokens: async uid => { authCalls.push(['revoke', uid]); },
      },
    });
    const listPath = '/v1/admin/moderation/reports';
    const resolve = (id, headers, body) => api.handle('POST', `${listPath}/${id}/resolve`, headers, body);

    await assert.rejects(api.handle('GET', listPath, WA, null, `${listPath}?status=open`), { status: 403 });
    const listed = (await api.handle('GET', listPath, SA, null, `${listPath}?status=open`)).body.reports
      .filter(item => item.id.startsWith('rep-'));
    assert.deepEqual(listed.map(item => item.id), ['rep-staff', 'rep-dismiss', 'rep-user', 'rep-message', 'rep-listing'], 'mới nhất lên trước');
    const listingReport = listed.find(item => item.id === 'rep-listing');
    assert.equal(listingReport.target.title, 'Bài lừa đảo');
    assert.equal(listingReport.reporter.name, 'Người báo cáo');
    assert.equal(listingReport.targetUser.name, 'Người vi phạm');
    assert.equal(listed.find(item => item.id === 'rep-message').target.text, 'Tin nhắn quấy rối');

    await assert.rejects(resolve('rep-listing', WA, { action: 'remove_listing' }), { status: 403 });
    await assert.rejects(resolve('rep-listing', SA, { action: 'remove_message' }), { status: 400 }, 'hành động phải khớp loại báo cáo');
    await assert.rejects(resolve('rep-listing', SA, { action: 'xoa' }), { status: 400 });

    await resolve('rep-listing', SA, { action: 'remove_listing', note: 'Bài lừa đảo' });
    assert.equal((await db.doc('catalog_items/cat_mod-1').get()).data().status, 'removed');
    const resolved = (await db.doc('reports/rep-listing').get()).data();
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.resolution, 'remove_listing');
    assert.equal(resolved.resolvedBy, 'mod-sa');
    await assert.rejects(resolve('rep-listing', SA, { action: 'dismiss' }), { status: 409 }, 'không xử lý lại báo cáo đã đóng');

    await resolve('rep-message', SA, { action: 'remove_message' });
    const message = (await db.doc('conversations/mod-chat/messages/mod-msg').get()).data();
    assert.equal(message.text, REMOVED_MESSAGE);
    assert.equal(message.moderated, true);

    await assert.rejects(resolve('rep-staff', SA, { action: 'suspend_user' }), { status: 409 }, 'không khoá nhân sự đang hoạt động ở đây');
    await resolve('rep-user', SA, { action: 'suspend_user' });
    assert.equal((await db.doc('users/mod-bad').get()).data().suspended, true);
    assert.equal((await db.doc('catalog_items/cat_mod-2').get()).data().status, 'removed', 'gỡ bài đang mở của người bị khoá');
    assert.equal((await db.doc('catalog_items/cat_mod-done').get()).data().status, 'completed', 'giữ bài đã trao');
    assert.deepEqual(authCalls, [['updateUser', 'mod-bad', { disabled: true }], ['revoke', 'mod-bad']]);

    await resolve('rep-dismiss', SA, { action: 'dismiss' });
    assert.equal((await db.doc('reports/rep-dismiss').get()).data().resolution, 'dismiss');
    const closed = (await api.handle('GET', listPath, SA, null, `${listPath}?status=resolved`)).body.reports
      .filter(item => item.id.startsWith('rep-'));
    assert.equal(closed.length, 4);
  } finally {
    await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
  }
});

test('Báo cáo vi phạm: không khoá nhầm người từ báo cáo gán sai, khoá dở thì bấm lại được, gỡ tin cuối thì gỡ cả xem trước', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'moderation-api-emulator-test-2');
  const db = getFirestore(app);
  const paths = [
    'staff_assignments/mod2-sa', 'users/mod2-owner', 'users/mod2-innocent', 'users/mod2-flaky',
    'catalog_items/cat_mod2-1', 'conversations/mod2-chat', 'conversations/mod2-chat/messages/m-old',
    'conversations/mod2-chat/messages/m-new', 'reports/rep2-forged', 'reports/rep2-flaky', 'reports/rep2-revoke',
    'reports/rep2-old', 'reports/rep2-new', 'users/mod2-revoke',
  ];
  try {
    await db.doc('staff_assignments/mod2-sa').set({ active: true, role: 'system_admin', warehouseIds: [] });
    await db.doc('users/mod2-owner').set({ displayName: 'Chủ bài' });
    await db.doc('users/mod2-innocent').set({ displayName: 'Người vô can' });
    await db.doc('users/mod2-flaky').set({ displayName: 'Người vi phạm' });
    await db.doc('catalog_items/cat_mod2-1').set({ donorId: 'mod2-owner', title: 'Bài vi phạm', status: 'available' });
    await db.doc('conversations/mod2-chat').set({ donorId: 'mod2-owner', requesterId: 'mod2-flaky',
      participantIds: ['mod2-owner', 'mod2-flaky'], lastMessage: 'Tin mới vi phạm', lastSenderId: 'mod2-flaky' });
    await db.doc('conversations/mod2-chat/messages/m-old').set({ senderId: 'mod2-flaky', text: 'Tin cũ vi phạm', createdAt: new Date(Date.UTC(2026, 10, 13, 8)) });
    await db.doc('conversations/mod2-chat/messages/m-new').set({ senderId: 'mod2-flaky', text: 'Tin mới vi phạm', createdAt: new Date(Date.UTC(2026, 10, 13, 9)) });
    const report = (id, extra) => db.doc(`reports/${id}`).set({ reporterId: 'mod2-reporter', reason: 'scam', status: 'open',
      createdAt: new Date(Date.UTC(2026, 10, 13, 10)), ...extra });
    // Dữ liệu cũ/giả: bài của mod2-owner nhưng báo cáo khai người bị báo cáo là mod2-innocent.
    await report('rep2-forged', { targetType: 'listing', targetId: 'cat_mod2-1', targetUserId: 'mod2-innocent' });
    await report('rep2-flaky', { targetType: 'user', targetId: 'mod2-flaky', targetUserId: 'mod2-flaky' });
    await report('rep2-revoke', { targetType: 'user', targetId: 'mod2-revoke', targetUserId: 'mod2-revoke' });
    await report('rep2-old', { targetType: 'message', targetId: 'm-old', conversationId: 'mod2-chat', targetUserId: 'mod2-flaky' });
    await report('rep2-new', { targetType: 'message', targetId: 'm-new', conversationId: 'mod2-chat', targetUserId: 'mod2-flaky' });

    const failures = { updateUser: 0, revoke: 0 };
    const authCalls = [];
    const api = createModerationApi({
      db, verifyToken: async token => ({ uid: token }), serverTimestamp: () => FieldValue.serverTimestamp(),
      auth: {
        updateUser: async uid => {
          authCalls.push(['updateUser', uid]);
          if (failures.updateUser-- > 0) throw Object.assign(new Error('unavailable'), { code: 'auth/internal-error' });
        },
        revokeRefreshTokens: async uid => {
          authCalls.push(['revoke', uid]);
          if (failures.revoke-- > 0) throw Object.assign(new Error('unavailable'), { code: 'auth/internal-error' });
        },
      },
    });
    const SA2 = { authorization: 'Bearer mod2-sa' };
    const listPath = '/v1/admin/moderation/reports';
    const resolve = (id, body) => api.handle('POST', `${listPath}/${id}/resolve`, SA2, body);
    const listOpen = async () => (await api.handle('GET', listPath, SA2, null, `${listPath}?status=open`)).body.reports;

    // R90-1: hiển thị và khoá theo chủ nội dung thật, không theo UID người báo cáo khai.
    const forged = (await listOpen()).find(item => item.id === 'rep2-forged');
    assert.equal(forged.targetUser.id, 'mod2-owner');
    assert.equal(forged.attributionMismatch, true);
    await assert.rejects(resolve('rep2-forged', { action: 'suspend_user' }), { status: 409, code: 'ATTRIBUTION_MISMATCH' });
    assert.equal((await db.doc('users/mod2-innocent').get()).data().suspended, undefined, 'không khoá người vô can');
    assert.equal(authCalls.length, 0);
    assert.equal((await db.doc('reports/rep2-forged').get()).data().status, 'open');

    // R90-2: Auth lỗi thì báo cáo chưa đóng; bấm lại hoàn tất được; không đổi sang thao tác khác giữa chừng.
    failures.updateUser = 1;
    await assert.rejects(resolve('rep2-flaky', { action: 'suspend_user', note: 'Quấy rối nhiều lần' }), { status: 502, code: 'SUSPEND_INCOMPLETE' });
    let pending = (await db.doc('reports/rep2-flaky').get()).data();
    assert.equal(pending.status, 'open');
    assert.equal(pending.pendingAction, 'suspend_user');
    assert.equal((await db.doc('users/mod2-flaky').get()).data().suspended, true, 'Rules chặn ghi ngay dù Auth chưa khoá xong');
    assert.equal((await listOpen()).find(item => item.id === 'rep2-flaky').pendingAction, 'suspend_user');
    await assert.rejects(resolve('rep2-flaky', { action: 'dismiss' }), { status: 409 });
    await resolve('rep2-flaky', { action: 'suspend_user' });
    pending = (await db.doc('reports/rep2-flaky').get()).data();
    assert.equal(pending.status, 'resolved');
    assert.equal(pending.pendingAction, null);
    assert.equal(pending.resolutionNote, 'Quấy rối nhiều lần', 'giữ ghi chú của lần bấm đầu');
    assert.deepEqual(authCalls.filter(call => call[1] === 'mod2-flaky').map(call => call[0]), ['updateUser', 'updateUser', 'revoke']);

    failures.revoke = 1;
    await assert.rejects(resolve('rep2-revoke', { action: 'suspend_user' }), { code: 'SUSPEND_INCOMPLETE' });
    assert.equal((await db.doc('reports/rep2-revoke').get()).data().status, 'open', 'thu hồi phiên lỗi cũng chưa đóng');
    await resolve('rep2-revoke', { action: 'suspend_user' });
    assert.equal((await db.doc('reports/rep2-revoke').get()).data().status, 'resolved');

    // R90-4: gỡ tin cũ không đụng xem trước của tin mới hơn; gỡ tin mới nhất thì thay luôn xem trước.
    await resolve('rep2-old', { action: 'remove_message' });
    assert.equal((await db.doc('conversations/mod2-chat').get()).data().lastMessage, 'Tin mới vi phạm');
    await resolve('rep2-new', { action: 'remove_message' });
    assert.equal((await db.doc('conversations/mod2-chat').get()).data().lastMessage, REMOVED_MESSAGE);
  } finally {
    await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
  }
});
