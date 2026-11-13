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

// Chèn một thao tác của người khác ngay sau khi API quét xong danh sách món đang giữ (giữa lúc quét và
// lúc ghi) — đúng khe hở mà review R89-2 tái hiện.
function interleaveAfterQuery(db, field, hook) {
  const bind = (target, prop) => (typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop]);
  return new Proxy(db, {
    get(target, prop) {
      if (prop !== 'collection') return bind(target, prop);
      return name => {
        const collection = target.collection(name);
        if (name !== 'catalog_items') return collection;
        return new Proxy(collection, {
          get(col, key) {
            if (key !== 'where') return bind(col, key);
            return (whereField, op, value) => {
              const query = col.where(whereField, op, value);
              if (whereField !== field) return query;
              return { limit: count => ({ get: async () => { const snapshot = await query.limit(count).get(); await hook(); return snapshot; } }) };
            };
          },
        });
      };
    },
  });
}

test('Xoá tài khoản: không mở lại món vừa bàn giao xong, chặn khi đang bàn giao dở, ảnh lỗi thì còn việc dọn tiếp', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'account-delete-emulator-test-2');
  const db = getFirestore(app);
  const U = 'acc2-user';
  const OTHER = 'acc2-other';
  const BUSY = 'acc2-busy';
  const paths = [
    `users/${U}`, `users/${BUSY}`, 'catalog_items/cat_acc2-held', 'catalog_items/cat_acc2-own',
    'catalog_items/cat_acc2-photos', 'catalog_items/cat_acc2-busy', 'conversations/acc2-chat-held', 'conversations/acc2-chat-own',
  ];
  const tokenFor = uid => async () => ({ uid, auth_time: Math.floor(Date.now() / 1000) - 30 });
  try {
    await db.doc(`users/${U}`).set({ id: U, displayName: 'Người xoá', role: 'donor' });
    const reserved = (donorId, requesterId, chatId) => ({ donorId, status: 'reserved', reservedChatId: chatId,
      reservedRequesterId: requesterId, donorHandoverConfirmed: false, requesterHandoverConfirmed: false });
    await db.doc('catalog_items/cat_acc2-held').set(reserved(OTHER, U, 'acc2-chat-held'));
    await db.doc('catalog_items/cat_acc2-own').set({ ...reserved(U, OTHER, 'acc2-chat-own'), imagePublicIds: ['catalog_items/cat_acc2-own/a'] });
    await db.doc('catalog_items/cat_acc2-photos').set({ donorId: U, status: 'available',
      imagePublicIds: ['catalog_items/cat_acc2-photos/ok', 'catalog_items/cat_acc2-photos/flaky'] });
    const chat = (itemId, donorId, requesterId) => ({ itemId, donorId, requesterId, participantIds: [donorId, requesterId],
      isReserved: true, appointmentStatus: 'accepted', donorHandoverConfirmed: false, requesterHandoverConfirmed: false });
    await db.doc('conversations/acc2-chat-held').set(chat('cat_acc2-held', OTHER, U));
    await db.doc('conversations/acc2-chat-own').set(chat('cat_acc2-own', U, OTHER));

    // Hai bên xác nhận bàn giao xong cả hai món ngay sau khi API quét.
    const completeHandover = async () => {
      for (const [itemId, chatId] of [['cat_acc2-held', 'acc2-chat-held'], ['cat_acc2-own', 'acc2-chat-own']]) {
        await db.doc(`catalog_items/${itemId}`).update({ status: 'completed', donorHandoverConfirmed: true, requesterHandoverConfirmed: true });
        await db.doc(`conversations/${chatId}`).update({ appointmentStatus: 'completed', isReserved: false,
          donorHandoverConfirmed: true, requesterHandoverConfirmed: true });
      }
    };
    const destroyed = [];
    let flakyFailures = 1;
    const deleteCatalogImage = async id => {
      if (id.endsWith('/flaky') && flakyFailures-- > 0) throw new Error('Cloudinary 500');
      destroyed.push(id);
    };
    const deletedUsers = [];
    const api = createAccountApi({
      db: interleaveAfterQuery(db, 'reservedRequesterId', completeHandover), verifyToken: tokenFor(U),
      auth: { deleteUser: async uid => { deletedUsers.push(uid); } }, deleteCatalogImage,
    });
    const result = await api.handle('POST', '/v1/account/delete', { authorization: 'Bearer t' });
    assert.equal(result.body.deleted, true);

    // R89-2: món đã bàn giao xong không bị mở lại, cờ xác nhận và hội thoại giữ nguyên.
    const held = (await db.doc('catalog_items/cat_acc2-held').get()).data();
    assert.equal(held.status, 'completed');
    assert.equal(held.requesterHandoverConfirmed, true);
    assert.equal((await db.doc('conversations/acc2-chat-held').get()).data().appointmentStatus, 'completed');
    const own = await db.doc('catalog_items/cat_acc2-own').get();
    assert.equal(own.exists, true, 'bài của chính họ vừa trao xong thì giữ lại, không xoá');
    assert.equal(own.data().status, 'completed');
    assert.equal(own.data().donorName, DELETED_NAME);
    assert.equal(result.body.summary.reservationsReleased, 0);
    assert.equal(result.body.summary.itemsAnonymized, 1);

    // R89-1: một ảnh lỗi thì báo còn chờ, bản ghi dọn tiếp giữ đúng ảnh đó; worker dọn được sau.
    assert.equal(result.body.summary.imagesPending, 1);
    assert.deepEqual(deletedUsers, [U]);
    const jobs = await db.collection('image_cleanup_jobs').get();
    const job = jobs.docs.find(doc => (doc.data().publicIds || []).includes('catalog_items/cat_acc2-photos/flaky'));
    assert.ok(job, 'còn bản ghi để dọn tiếp');
    assert.deepEqual(job.data().publicIds, ['catalog_items/cat_acc2-photos/flaky']);
    assert.ok(!JSON.stringify(job.data()).includes(U), 'bản ghi dọn ảnh không chứa uid');
    const { createImageCleanupJobs } = require('../image-cleanup-jobs.cjs');
    const worker = createImageCleanupJobs({ db, deleteCatalogImage });
    await worker.processJob(job.ref);
    assert.equal((await job.ref.get()).exists, false, 'dọn xong thì xoá bản ghi');
    assert.ok(destroyed.includes('catalog_items/cat_acc2-photos/flaky'));
    const audit = await db.collection('account_deletions').where('itemsAnonymized', '==', 1).limit(5).get();
    paths.push(...audit.docs.map(doc => `account_deletions/${doc.id}`));

    // Đang bàn giao dở (một bên đã xác nhận): chưa cho xoá, không đụng dữ liệu nào.
    await db.doc(`users/${BUSY}`).set({ id: BUSY, displayName: 'Đang bận', role: 'donor' });
    await db.doc('catalog_items/cat_acc2-busy').set({ ...reserved(OTHER, BUSY, 'acc2-chat-busy'), donorHandoverConfirmed: true });
    const busyDeleted = [];
    const busyApi = createAccountApi({ db, verifyToken: tokenFor(BUSY), auth: { deleteUser: async uid => { busyDeleted.push(uid); } } });
    await assert.rejects(busyApi.handle('POST', '/v1/account/delete', { authorization: 'Bearer t' }),
      { status: 409, code: 'HANDOVER_IN_PROGRESS' });
    assert.equal((await db.doc(`users/${BUSY}`).get()).exists, true);
    assert.equal((await db.doc('catalog_items/cat_acc2-busy').get()).data().reservedRequesterId, BUSY);
    assert.deepEqual(busyDeleted, []);
  } finally {
    const leftovers = await db.collection('image_cleanup_jobs').get();
    paths.push(...leftovers.docs.map(doc => `image_cleanup_jobs/${doc.id}`));
    await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
  }
});
