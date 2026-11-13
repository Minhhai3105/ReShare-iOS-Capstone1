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
