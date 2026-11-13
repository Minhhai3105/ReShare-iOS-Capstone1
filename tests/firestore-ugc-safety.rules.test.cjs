const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment, } = require('@firebase/rules-unit-testing');
const { serverTimestamp } = require('firebase/firestore');

const rules = () => fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

async function seedChat(env) {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await db.doc('catalog_items/cat_ugc').set({ donorId: 'donor', title: 'Nồi cơm', status: 'available' });
    await db.doc('conversations/chat_ugc').set({
      itemId: 'cat_ugc', donorId: 'donor', requesterId: 'asker', participantIds: ['donor', 'asker'],
      donorName: 'Người cho', requesterName: 'Người hỏi', lastSenderId: 'asker',
    });
    await db.doc('conversations/chat_ugc/messages/from-donor').set({ senderId: 'donor', text: 'Mai qua lấy nhé', createdAt: new Date() });
  });
}
const message = (sender, text) => ({ id: `m-${Math.random()}`, senderId: sender, senderName: sender, text, messageType: 'text', createdAt: new Date() });

test('Chặn người dùng: chỉ chính chủ quản lý danh sách chặn; đã chặn thì hai bên không nhắn tin được', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-reshare', firestore: { rules: rules() } });
  try {
    await seedChat(env);
    const donor = env.authenticatedContext('donor').firestore();
    const asker = env.authenticatedContext('asker').firestore();

    await assertSucceeds(asker.doc('conversations/chat_ugc/messages/m1').set(message('asker', 'Cho mình xin nhé')));

    await assertFails(asker.doc('users/donor/blocks/asker').set({ blockedUid: 'asker', createdAt: serverTimestamp() }), 'không chặn hộ người khác');
    await assertFails(donor.doc('users/donor/blocks/donor').set({ blockedUid: 'donor', createdAt: serverTimestamp() }), 'không tự chặn mình');
    await assertFails(donor.doc('users/donor/blocks/asker').set({ blockedUid: 'other', createdAt: serverTimestamp() }));
    await assertFails(donor.doc('users/donor/blocks/asker').set({ blockedUid: 'asker', createdAt: new Date(0) }), 'thời điểm do server đặt');
    await assertSucceeds(donor.doc('users/donor/blocks/asker').set({ blockedUid: 'asker', createdAt: serverTimestamp() }));
    await assertSucceeds(donor.doc('users/donor/blocks/asker').get());
    await assertFails(asker.doc('users/donor/blocks/asker').get(), 'người bị chặn không đọc được danh sách chặn của người khác');

    await assertFails(asker.doc('conversations/chat_ugc/messages/m2').set(message('asker', 'Bạn ơi')), 'người bị chặn không nhắn được');
    await assertFails(donor.doc('conversations/chat_ugc/messages/m3').set(message('donor', 'Chào')), 'người chặn cũng không nhắn được');
    await assertFails(asker.doc('conversations/chat_ugc').update({
      lastMessage: 'Vẫn nhắn qua bản xem trước', lastMessageTime: new Date(), lastSenderId: 'asker',
    }), 'người bị chặn không ghi riêng bản xem trước để lách chặn tin nhắn');
    await assertFails(donor.doc('conversations/chat_ugc').update({
      lastMessage: 'Chào', lastMessageTime: new Date(), lastSenderId: 'donor',
    }), 'người chặn cũng không ghi bản xem trước');
    await assertSucceeds(donor.doc('conversations/chat_ugc').update({ 'lastReadTimes.donor': serverTimestamp() }),
      'vẫn đánh dấu đã đọc được khi đã chặn');
    await assertFails(asker.doc('conversations/chat_new').set({
      itemId: 'cat_ugc', donorId: 'donor', requesterId: 'asker', participantIds: ['donor', 'asker'],
      donorName: 'Người cho', requesterName: 'Người hỏi', lastSenderId: 'asker',
    }), 'không mở hội thoại mới với người đã chặn mình');

    await assertSucceeds(donor.doc('users/donor/blocks/asker').delete());
    await assertSucceeds(asker.doc('conversations/chat_ugc/messages/m4').set(message('asker', 'Cảm ơn bạn')), 'bỏ chặn thì nhắn lại được');
  } finally {
    // Rules test và backend test dùng chung project emulator: dọn dữ liệu để không làm hỏng test sau.
    await env.clearFirestore();
    await env.cleanup();
  }
});

test('Lọc từ ngữ: tin nhắn và bài đăng chứa từ thô tục bị từ chối, từ thường gần giống vẫn qua', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-reshare', firestore: { rules: rules() } });
  try {
    await seedChat(env);
    const asker = env.authenticatedContext('asker').firestore();
    await assertFails(asker.doc('conversations/chat_ugc/messages/b1').set(message('asker', 'Đồ ĐÉO gì vậy')));
    await assertFails(asker.doc('conversations/chat_ugc/messages/b2').set(message('asker', 'dòng 1\nfuck dòng 2')));
    // Rules lower() chỉ đổi chữ ASCII; chữ hoa có dấu phải bị chặn nhờ cờ (?i).
    await assertFails(asker.doc('conversations/chat_ugc/messages/b3').set(message('asker', 'CẶC')));
    await assertFails(asker.doc('conversations/chat_ugc/messages/b4').set(message('asker', 'ĐỤ MÁ')));
    // Rules không chuẩn hoá Unicode: dạng dấu tổ hợp (NFD) và nửa dựng sẵn cũng phải bị chặn.
    const decomposed = ['ĐÉO'.normalize('NFD'), 'cặc'.normalize('NFD'), 'l\u00f4\u0300n', 'C\u1ea1\u0306C', 'dòng 1\nĐỤ MÁ'.normalize('NFD')];
    for (const [index, bad] of decomposed.entries()) {
      await assertFails(asker.doc(`conversations/chat_ugc/messages/nfd-${index}`).set(message('asker', bad)), JSON.stringify(bad));
    }
    const ordinary = ['Cho mình xin cái đĩa nhé', 'Mình ĐỤNG lịch chiều nay', 'BUỔI sáng mình rảnh', 'admin cho hỏi',
      'Cho mình xin cái đĩa nhé'.normalize('NFD'), 'Đeo khẩu trang'.normalize('NFD')];
    for (const [index, ok] of ordinary.entries()) {
      await assertSucceeds(asker.doc(`conversations/chat_ugc/messages/ok-${index}`).set(message('asker', ok)), ok);
    }
    await assertFails(asker.doc('conversations/chat_ugc').update({
      lastMessage: 'Đồ đéo gì'.normalize('NFD'), lastMessageTime: new Date(), lastSenderId: 'asker',
    }), 'bản xem trước cũng qua bộ lọc');
    await assertSucceeds(asker.doc('conversations/chat_ugc').update({
      lastMessage: 'Cảm ơn bạn', lastMessageTime: new Date(), lastSenderId: 'asker',
    }));

    const itemId = 'cat_0f1e2d3c-4b5a-4968-8776-655443322110';
    const ids = [1, 2, 3].map(n => `catalog_items/${itemId}/00000000-0000-4000-8000-00000000000${n}`);
    await env.withSecurityRulesDisabled(context => context.firestore().doc(`image_upload_batches/catalog_item_${itemId}`).set({
      ownerUid: 'donor', assets: { a: ids[0], b: ids[1], c: ids[2] },
    }));
    const donor = env.authenticatedContext('donor').firestore();
    const listing = { donorId: 'donor', status: 'available', title: 'Nồi cơm điện', donorNote: 'Còn tốt',
      imageProvider: 'cloudinary', imagePublicIds: ids };
    await assertFails(donor.doc(`catalog_items/${itemId}`).set({ ...listing, title: 'Bán lồn' }));
    await assertFails(donor.doc(`catalog_items/${itemId}`).set({ ...listing, donorNote: 'shit quá' }));
    await assertFails(donor.doc(`catalog_items/${itemId}`).set({ ...listing, title: 'Bán LỒN'.normalize('NFD') }));
    await assertSucceeds(donor.doc(`catalog_items/${itemId}`).set(listing));
  } finally {
    // Rules test và backend test dùng chung project emulator: dọn dữ liệu để không làm hỏng test sau.
    await env.clearFirestore();
    await env.cleanup();
  }
});

test('Báo cáo vi phạm: người dùng chỉ tạo được báo cáo hợp lệ, không ai đọc hay sửa từ client', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-reshare', firestore: { rules: rules() } });
  try {
    await seedChat(env);
    await env.withSecurityRulesDisabled(context => context.firestore().doc('staff_assignments/admin').set({ role: 'system_admin', active: true, warehouseIds: [] }));
    const asker = env.authenticatedContext('asker').firestore();
    const outsider = env.authenticatedContext('outsider').firestore();
    const base = { reporterId: 'asker', targetType: 'listing', targetId: 'cat_ugc', targetUserId: 'donor',
      reason: 'scam', status: 'open', createdAt: serverTimestamp() };
    const messageReport = { ...base, targetType: 'message', targetId: 'from-donor', conversationId: 'chat_ugc', reason: 'harassment' };
    await assertSucceeds(asker.doc('reports/r1').set(base));
    await assertSucceeds(asker.doc('reports/r2').set({ ...base, targetType: 'user', targetId: 'donor', note: 'Hẹn rồi không đến' }));
    await assertSucceeds(asker.doc('reports/r3').set(messageReport));

    await assertFails(outsider.doc('reports/r4').set({ ...messageReport, reporterId: 'outsider' }),
      'người ngoài hội thoại không báo cáo tin nhắn trong đó');
    // Người bị báo cáo phải đúng chủ nội dung, không gán bài/tin của người này cho người khác.
    await assertFails(asker.doc('reports/f1').set({ ...base, targetUserId: 'innocent' }), 'sai chủ bài');
    await assertFails(asker.doc('reports/f2').set({ ...messageReport, targetUserId: 'innocent' }), 'sai người gửi tin');
    await assertFails(asker.doc('reports/f3').set({ ...messageReport, targetId: 'khong-co' }), 'tin nhắn không tồn tại');
    await assertFails(asker.doc('reports/f4').set({ ...base, targetId: 'cat_khong_co' }), 'bài không tồn tại');
    await assertFails(asker.doc('reports/f5').set({ ...base, targetType: 'user', targetId: 'donor', targetUserId: 'innocent' }), 'báo cáo người dùng lệch UID');
    await assertFails(asker.doc('reports/f6').set({ ...messageReport, conversationId: 'chat_khac' }), 'sai hội thoại');
    await assertFails(asker.doc('reports/f7').set({ ...base, targetId: 'cat/../x' }), 'ID không hợp lệ');
    await assertFails(asker.doc('reports/r5').set({ ...base, reporterId: 'donor' }), 'không báo cáo thay người khác');
    await assertFails(asker.doc('reports/r6').set({ ...base, targetUserId: 'asker' }), 'không tự báo cáo mình');
    await assertFails(asker.doc('reports/r7').set({ ...base, reason: 'khác' }));
    await assertFails(asker.doc('reports/r8').set({ ...base, status: 'resolved' }));
    await assertFails(asker.doc('reports/r9').set({ ...base, note: 'x'.repeat(501) }));
    await assertFails(asker.doc('reports/r10').set({ ...base, resolution: 'dismissed' }));
    await assertFails(asker.doc('reports/r1').get(), 'người báo cáo cũng không đọc lại được');
    await assertFails(env.authenticatedContext('admin').firestore().doc('reports/r1').get(), 'System Admin đọc qua API, không qua client');
    await assertFails(asker.doc('reports/r1').update({ status: 'resolved' }));
  } finally {
    // Rules test và backend test dùng chung project emulator: dọn dữ liệu để không làm hỏng test sau.
    await env.clearFirestore();
    await env.cleanup();
  }
});

test('Tài khoản bị khoá: Rules chặn ghi nội dung ngay dù ID token cũ còn hạn', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-reshare', firestore: { rules: rules() } });
  try {
    await seedChat(env);
    await env.withSecurityRulesDisabled(context => context.firestore().doc('users/asker').set({
      id: 'asker', displayName: 'Người hỏi', suspended: true,
    }));
    const asker = env.authenticatedContext('asker').firestore();
    const donor = env.authenticatedContext('donor').firestore();
    await assertFails(asker.doc('conversations/chat_ugc/messages/s1').set(message('asker', 'Xin chào')), 'không nhắn tin');
    await assertFails(asker.doc('conversations/chat_ugc').update({
      lastMessage: 'Xin chào', lastMessageTime: new Date(), lastSenderId: 'asker',
    }), 'không ghi bản xem trước');
    const itemId = 'cat_1f1e2d3c-4b5a-4968-8776-655443322110';
    const ids = [1, 2, 3].map(n => `catalog_items/${itemId}/00000000-0000-4000-8000-00000000000${n}`);
    await env.withSecurityRulesDisabled(context => context.firestore().doc(`image_upload_batches/catalog_item_${itemId}`).set({
      ownerUid: 'asker', assets: { a: ids[0], b: ids[1], c: ids[2] },
    }));
    const listing = { donorId: 'asker', status: 'available', title: 'Nồi cơm', imageProvider: 'cloudinary', imagePublicIds: ids };
    await assertFails(asker.doc(`catalog_items/${itemId}`).set(listing), 'không đăng bài');
    await assertFails(asker.doc('users/asker').update({ suspended: false }), 'không tự gỡ khoá');
    await assertSucceeds(donor.doc('conversations/chat_ugc/messages/s2').set(message('donor', 'Người còn lại vẫn nhắn được')));

    // Đối chứng: cùng thao tác, gỡ cờ khoá thì qua — tức là bị từ chối đúng vì cờ khoá.
    await env.withSecurityRulesDisabled(context => context.firestore().doc('users/asker').update({ suspended: false }));
    await assertSucceeds(asker.doc('conversations/chat_ugc/messages/s3').set(message('asker', 'Xin chào')));
    await assertSucceeds(asker.doc(`catalog_items/${itemId}`).set(listing));
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});

test('Tạo hội thoại mới: bản xem trước (lastMessage) cũng qua bộ lọc từ ngữ', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-reshare', firestore: { rules: rules() } });
  try {
    await seedChat(env);
    const asker = env.authenticatedContext('asker').firestore();
    const conversation = lastMessage => ({
      itemId: 'cat_ugc', donorId: 'donor', requesterId: 'asker', participantIds: ['donor', 'asker'],
      donorName: 'Người cho', requesterName: 'Người hỏi', lastSenderId: 'asker', lastMessage, lastMessageTime: new Date(),
    });
    for (const [index, bad] of ['Đồ đéo gì', 'ĐÉO'.normalize('NFD'), 'dòng 1\nfuck', 'l\u00f4\u0300n'].entries()) {
      await assertFails(asker.doc(`conversations/chat_bad_${index}`).set(conversation(bad)), JSON.stringify(bad));
    }
    await assertSucceeds(asker.doc('conversations/chat_ok').set(conversation('Cho mình xin cái đĩa nhé')));
    await assertSucceeds(asker.doc('conversations/chat_ok_nfd').set(conversation('Đeo khẩu trang'.normalize('NFD'))));
    const { lastMessage, lastMessageTime, ...withoutPreview } = conversation('x');
    await assertSucceeds(asker.doc('conversations/chat_no_preview').set(withoutPreview), 'không có bản xem trước vẫn tạo được');
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});
