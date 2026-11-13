const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createAccountApi, DELETED_NAME } = require('../account-api.cjs');

test('Xoá tài khoản: giữ đơn ẩn danh, gỡ bài đang mở, mở lại món đang giữ, đổi tên trong chat, xoá Auth sau cùng', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'account-delete-emulator-test');
  const db = getFirestore(app);
  const U = 'acc-del-donor';
  const OTHER = 'acc-del-other';
  const paths = [
    `users/${U}`, `users/${OTHER}`, 'donations/acc-del-don-1', 'donations/acc-del-don-other',
    'catalog_items/cat_acc-open', 'catalog_items/cat_acc-open/private/pickup', 'catalog_items/cat_acc-done',
    'catalog_items/cat_acc-done/private/pickup', 'catalog_items/cat_acc-held',
    'conversations/acc-chat-held', 'conversations/acc-chat-held/messages/m1', 'conversations/acc-chat-held/messages/m2',
    'conversations/acc-chat-open', 'conversations/acc-chat-open/messages/m3',
  ];
  try {
    await db.doc(`users/${U}`).set({ id: U, email: 'xoa@reshare.test', displayName: 'Nguyễn Văn Xoá', phoneNumber: '0900000000', role: 'donor' });
    await db.doc(`users/${OTHER}`).set({ id: OTHER, displayName: 'Người khác', role: 'donor' });
    await db.doc('donations/acc-del-don-1').set({ donorId: U, donorName: 'Nguyễn Văn Xoá', title: 'Áo', status: 'in_stock', version: 4 });
    await db.doc('donations/acc-del-don-other').set({ donorId: OTHER, title: 'Sách', status: 'pending' });
    await db.doc('catalog_items/cat_acc-open').set({ donorId: U, donorName: 'Nguyễn Văn Xoá', status: 'reserved',
      reservedChatId: 'acc-chat-open', reservedRequesterId: OTHER, imagePublicIds: ['catalog_items/cat_acc-open/a', 'catalog_items/cat_acc-open/b'] });
    await db.doc('catalog_items/cat_acc-open/private/pickup').set({ pickupAddress: '12 Lê Lợi' });
    await db.doc('catalog_items/cat_acc-done').set({ donorId: U, donorName: 'Nguyễn Văn Xoá', status: 'completed', imagePublicIds: ['catalog_items/cat_acc-done/a'] });
    await db.doc('catalog_items/cat_acc-done/private/pickup').set({ pickupAddress: '12 Lê Lợi' });
    await db.doc('catalog_items/cat_acc-held').set({ donorId: OTHER, donorName: 'Người khác', status: 'reserved',
      reservedChatId: 'acc-chat-held', reservedRequesterId: U, reservationDeadline: new Date(), donorHandoverConfirmed: false });
    await db.doc('conversations/acc-chat-held').set({ itemId: 'cat_acc-held', donorId: OTHER, donorName: 'Người khác',
      requesterId: U, requesterName: 'Nguyễn Văn Xoá', participantIds: [OTHER, U], isReserved: true, appointmentStatus: 'accepted' });
    await db.doc('conversations/acc-chat-held/messages/m1').set({ senderId: U, senderName: 'Nguyễn Văn Xoá', text: 'Chào bạn' });
    await db.doc('conversations/acc-chat-held/messages/m2').set({ senderId: OTHER, senderName: 'Người khác', text: 'Chào' });
    await db.doc('conversations/acc-chat-open').set({ itemId: 'cat_acc-open', donorId: U, donorName: 'Nguyễn Văn Xoá',
      requesterId: OTHER, requesterName: 'Người khác', participantIds: [U, OTHER], isReserved: true, appointmentStatus: 'accepted' });
    await db.doc('conversations/acc-chat-open/messages/m3').set({ senderId: U, senderName: 'Nguyễn Văn Xoá', text: 'Hẹn 5h' });

    const deletedUsers = [];
    const deletedImages = [];
    const api = createAccountApi({
      db, verifyToken: async () => ({ uid: U, auth_time: Math.floor(Date.now() / 1000) - 30 }),
      auth: { deleteUser: async uid => { deletedUsers.push(uid); } },
      deleteCatalogImage: async id => { deletedImages.push(id); },
    });
    const result = await api.handle('POST', '/v1/account/delete', { authorization: 'Bearer t' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.summary, { donationsAnonymized: 1, itemsRemoved: 1, itemsAnonymized: 1,
      reservationsReleased: 1, conversationsUpdated: 2, messagesUpdated: 2, imagesPending: 0 });

    assert.equal((await db.doc(`users/${U}`).get()).exists, false, 'hồ sơ đã xoá');
    assert.deepEqual(deletedUsers, [U], 'tài khoản Auth bị xoá đúng một lần');
    const donation = (await db.doc('donations/acc-del-don-1').get()).data();
    assert.equal(donation.donorAccountDeleted, true);
    assert.equal(donation.donorName, undefined, 'bỏ tên người gửi');
    assert.equal(donation.status, 'in_stock', 'không đổi trạng thái chứng từ');
    assert.equal(donation.version, 4, 'không làm nhân sự đang sửa bị xung đột phiên bản');
    assert.equal((await db.doc('donations/acc-del-don-other').get()).data().donorAccountDeleted, undefined);

    assert.equal((await db.doc('catalog_items/cat_acc-open').get()).exists, false, 'bài đang mở bị gỡ');
    assert.equal((await db.doc('catalog_items/cat_acc-open/private/pickup').get()).exists, false);
    assert.deepEqual(deletedImages.sort(), ['catalog_items/cat_acc-open/a', 'catalog_items/cat_acc-open/b']);
    const done = (await db.doc('catalog_items/cat_acc-done').get()).data();
    assert.equal(done.donorName, DELETED_NAME, 'bài đã trao giữ lại nhưng ẩn tên');
    assert.equal((await db.doc('catalog_items/cat_acc-done/private/pickup').get()).exists, false, 'xoá địa chỉ nhận đồ');

    const held = (await db.doc('catalog_items/cat_acc-held').get()).data();
    assert.equal(held.status, 'available', 'món đang giữ của người khác được mở lại');
    assert.equal(held.reservedRequesterId, undefined);
    assert.equal(held.reservedChatId, undefined);

    const chatHeld = (await db.doc('conversations/acc-chat-held').get()).data();
    assert.equal(chatHeld.requesterName, DELETED_NAME);
    assert.equal(chatHeld.donorName, 'Người khác');
    assert.equal(chatHeld.isReserved, false);
    assert.equal(chatHeld.appointmentStatus, 'cancelled');
    assert.equal((await db.doc('conversations/acc-chat-open').get()).data().donorName, DELETED_NAME);
    assert.equal((await db.doc('conversations/acc-chat-held/messages/m1').get()).data().senderName, DELETED_NAME);
    assert.equal((await db.doc('conversations/acc-chat-held/messages/m2').get()).data().senderName, 'Người khác');
    assert.equal((await db.doc('conversations/acc-chat-held/messages/m1').get()).data().text, 'Chào bạn', 'giữ nội dung cho người còn lại');

    const audit = await db.collection('account_deletions').where('donationsAnonymized', '==', 1).limit(5).get();
    assert.ok(audit.docs.some(doc => !JSON.stringify(doc.data()).includes(U)), 'bản ghi kiểm toán không chứa uid');
    paths.push(...audit.docs.map(doc => `account_deletions/${doc.id}`));

    // Gọi lại sau khi đã xoá (ví dụ lần trước mất phản hồi): không lỗi, không xoá Auth lần nữa thành lỗi.
    const again = createAccountApi({
      db, verifyToken: async () => ({ uid: U, auth_time: Math.floor(Date.now() / 1000) - 30 }),
      auth: { deleteUser: async () => { throw Object.assign(new Error('gone'), { code: 'auth/user-not-found' }); } },
    });
    const second = await again.handle('POST', '/v1/account/delete', { authorization: 'Bearer t' });
    assert.equal(second.status, 200);
    assert.equal(second.body.summary.itemsRemoved, 0);
    const audit2 = await db.collection('account_deletions').where('itemsRemoved', '==', 0).limit(5).get();
    paths.push(...audit2.docs.map(doc => `account_deletions/${doc.id}`));
  } finally {
    await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
  }
});
