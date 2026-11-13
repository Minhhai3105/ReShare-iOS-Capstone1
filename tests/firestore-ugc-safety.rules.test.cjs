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
    for (const [index, ok] of ['Cho mình xin cái đĩa nhé', 'Mình ĐỤNG lịch chiều nay', 'BUỔI sáng mình rảnh', 'admin cho hỏi'].entries()) {
      await assertSucceeds(asker.doc(`conversations/chat_ugc/messages/ok-${index}`).set(message('asker', ok)), ok);
    }

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
    await assertSucceeds(asker.doc('reports/r1').set(base));
    await assertSucceeds(asker.doc('reports/r2').set({ ...base, targetType: 'user', targetId: 'donor', note: 'Hẹn rồi không đến' }));
    await assertSucceeds(asker.doc('reports/r3').set({ ...base, targetType: 'message', targetId: 'm1', conversationId: 'chat_ugc', reason: 'harassment' }));

    await assertFails(outsider.doc('reports/r4').set({ ...base, reporterId: 'outsider', targetType: 'message', targetId: 'm1', conversationId: 'chat_ugc' }),
      'người ngoài hội thoại không báo cáo tin nhắn trong đó');
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
