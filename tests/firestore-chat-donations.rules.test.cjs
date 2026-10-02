const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');

test('Cloudinary record requires three distinct image IDs from a server-owned batch', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  try {
    const recordId = '6d4a2909-bb7f-459d-bbcd-2117d96ff7e1';
    const ids = [1, 2, 3].map(number => `donations/${recordId}/00000000-0000-4000-8000-00000000000${number}`);
    const donor = env.authenticatedContext('donor').firestore();
    const donation = { id: recordId, donorId: 'donor', status: 'pending', imageProvider: 'cloudinary', imagePublicIds: ids };
    await assertFails(donor.doc(`donations/${recordId}`).set(donation));
    await env.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`image_upload_batches/donation_${recordId}`).set({
        ownerUid: 'donor', assets: { first: ids[0], second: ids[1], third: ids[2] },
      });
    });
    await assertFails(donor.doc(`donations/${recordId}`).set({ ...donation, imagePublicIds: ids.slice(0, 2) }));
    await assertFails(donor.doc(`donations/${recordId}`).set({ ...donation, imagePublicIds: [ids[0], ids[0], ids[1]] }));
    await assertSucceeds(donor.doc(`donations/${recordId}`).set(donation));

    const catalogId = `cat_${recordId}`;
    const catalogIds = [1, 2, 3].map(number => `catalog_items/${catalogId}/10000000-0000-4000-8000-00000000000${number}`);
    await env.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`image_upload_batches/catalog_item_${catalogId}`).set({
        ownerUid: 'donor', assets: { first: catalogIds[0], second: catalogIds[1], third: catalogIds[2] },
      });
    });
    await assertSucceeds(donor.doc(`catalog_items/${catalogId}`).set({
      donorId: 'donor', status: 'available', imageProvider: 'cloudinary', imagePublicIds: catalogIds,
    }));
  } finally {
    await env.cleanup();
  }
});

test('chat participants cannot impersonate system or alter another user read time', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });

  try {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('catalog_items/item-chat-test').set({ donorId: 'alice', status: 'available' });
      await db.doc('conversations/chat-test').set({
        id: 'chat-test',
        itemId: 'item-chat-test',
        donorId: 'alice',
        requesterId: 'bob',
        participantIds: ['alice', 'bob'],
        lastMessage: 'Chào bạn',
        lastMessageTime: new Date(0),
        lastSenderId: 'bob',
        appointmentStatus: 'none',
        isReserved: false,
        lastReadTimes: {},
      });
    });

    const bob = env.authenticatedContext('bob').firestore();
    const alice = env.authenticatedContext('alice').firestore();
    const chat = bob.doc('conversations/chat-test');
    const message = (id, senderId, messageType = 'text') => ({
      id,
      senderId,
      senderName: senderId,
      text: 'Tin nhắn kiểm thử',
      timeString: '10:00',
      isCurrentUser: true,
      createdAt: new Date(),
      messageType,
    });

    await assertSucceeds(bob.runTransaction(async (transaction) => {
      const reference = bob.doc('conversations/new-chat-test');
      const existing = await transaction.get(reference);
      if (!existing.exists) {
        transaction.set(reference, {
          id: 'new-chat-test', itemId: 'item-chat-test',
          donorId: 'alice', requesterId: 'bob', participantIds: ['alice', 'bob'],
          lastMessage: 'Xin đồ', lastMessageTime: new Date(), lastSenderId: 'bob',
          isReserved: false, appointmentStatus: 'none',
        });
        transaction.set(bob.doc('conversations/new-chat-test/messages/first'), message('first', 'bob'));
      }
    }));

    await assertFails(bob.doc('conversations/chat-test/messages/fake-system').set(message('fake-system', 'system', 'system')));
    await assertFails(bob.doc('conversations/chat-test/messages/fake-type').set(message('fake-type', 'bob', 'system')));
    await assertSucceeds(bob.doc('conversations/chat-test/messages/normal').set(message('normal', 'bob')));
    await assertSucceeds(bob.collection('conversations').where('participantIds', 'array-contains', 'bob').get());
    await assertSucceeds(chat.update({ 'lastReadTimes.bob': new Date() }));
    await assertFails(chat.update({ 'lastReadTimes.alice': new Date() }));
    await assertFails(chat.update({ lastSenderId: 'alice', lastMessage: 'Giả mạo', lastMessageTime: new Date() }));
    await assertFails(chat.update({ appointmentStatus: 'accepted', lastSenderId: 'bob' }));

    await assertSucceeds(chat.update({
      appointmentStatus: 'proposed',
      proposedPickupTime: new Date(Date.now() + 60_000),
      lastMessage: 'Đề xuất hẹn',
      lastMessageTime: new Date(),
      lastSenderId: 'bob',
    }));
    await assertSucceeds(bob.doc('conversations/chat-test/messages/proposal').set({
      ...message('proposal', 'bob', 'appointment_proposal'), appointmentStatus: 'pending',
    }));
    const decline = alice.batch();
    decline.update(alice.doc('conversations/chat-test/messages/proposal'), { appointmentStatus: 'declined' });
    decline.update(alice.doc('conversations/chat-test'), {
      appointmentStatus: 'declined',
      lastMessage: 'Chưa tiện',
      lastMessageTime: new Date(),
      lastSenderId: 'alice',
    });
    decline.set(alice.doc('conversations/chat-test/messages/declined-event'), message('declined-event', 'alice'));
    await assertSucceeds(decline.commit());
  } finally {
    await env.cleanup();
  }
});

test('donor owns pending donation; warehouse admin is blocked until warehouse scope exists', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });

  try {
    const donor = env.authenticatedContext('donor').firestore();
    const warehouse = env.authenticatedContext('warehouse', { role: 'warehouse_admin' }).firestore();
    const admin = env.authenticatedContext('admin', { role: 'system_admin' }).firestore();
    const staleAdmin = env.authenticatedContext('stale-admin', { role: 'system_admin' }).firestore();
    const donation = { id: 'donation-test', donorId: 'donor', status: 'pending', createdAt: new Date() };

    await env.withSecurityRulesDisabled(async context => {
      await context.firestore().doc('staff_assignments/admin').set({
        uid: 'admin', role: 'system_admin', active: true, warehouseIds: []
      });
    });

    await assertSucceeds(donor.runTransaction(async (transaction) => {
      const reference = donor.doc('donations/donation-test');
      const existing = await transaction.get(reference);
      if (!existing.exists) transaction.set(reference, donation);
    }));
    await assertSucceeds(donor.runTransaction(async (transaction) => {
      const reference = donor.doc('donations/donation-test');
      const existing = await transaction.get(reference);
      if (!existing.exists) transaction.set(reference, donation);
    }));
    await assertSucceeds(donor.doc('donations/donation-test').get());
    await assertSucceeds(donor.collection('donations').where('donorId', '==', 'donor').orderBy('createdAt', 'desc').get());
    await assertFails(donor.doc('donations/invalid-status').set({ ...donation, id: 'invalid-status', status: 'approved' }));
    await assertFails(warehouse.doc('donations/donation-test').get());
    await assertFails(warehouse.doc('donations/donation-test').update({ status: 'approved' }));
    await assertFails(staleAdmin.doc('donations/donation-test').get());
    await assertSucceeds(admin.doc('donations/donation-test').get());
    await assertSucceeds(admin.doc('donations/donation-test').update({ status: 'approved' }));
    await assertFails(admin.doc('donations/donation-test').delete());
    await env.withSecurityRulesDisabled(async context => {
      await context.firestore().doc('staff_assignments/admin').update({ active: false });
    });
    await assertFails(admin.doc('donations/donation-test').get());
  } finally {
    await env.cleanup();
  }
});

test('appointment acceptance and two-sided handover remain allowed as atomic writes', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });

  try {
    const pickupTime = new Date(Date.now() + 3_600_000);
    const deadline = new Date(pickupTime.getTime() + 7_200_000);
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('catalog_items/item-flow-test').set({
        donorId: 'alice', status: 'available',
        donorHandoverConfirmed: false, requesterHandoverConfirmed: false,
      });
      await db.doc('conversations/flow-test').set({
        id: 'flow-test', itemId: 'item-flow-test', donorId: 'alice', requesterId: 'bob',
        participantIds: ['alice', 'bob'], lastMessage: 'Đề xuất hẹn',
        lastMessageTime: new Date(), lastSenderId: 'bob', isReserved: false,
        appointmentStatus: 'proposed', proposedPickupTime: pickupTime,
        donorHandoverConfirmed: false, requesterHandoverConfirmed: false,
      });
      await db.doc('conversations/flow-test/messages/proposal').set({
        id: 'proposal', senderId: 'bob', messageType: 'appointment_proposal',
        appointmentStatus: 'pending', createdAt: new Date(),
      });
    });

    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    const itemPath = 'catalog_items/item-flow-test';
    const chatPath = 'conversations/flow-test';
    const event = (id, senderId) => ({
      id, senderId, senderName: senderId, text: 'Cập nhật lịch hẹn',
      timeString: '10:00', createdAt: new Date(), messageType: 'text',
    });

    await assertSucceeds(alice.runTransaction(async (transaction) => {
      const item = alice.doc(itemPath);
      await transaction.get(item);
      transaction.update(item, {
        status: 'reserved', reservedChatId: 'flow-test', reservedRequesterId: 'bob',
        pickupTime, reservationDeadline: deadline,
        donorHandoverConfirmed: false, requesterHandoverConfirmed: false,
      });
      transaction.update(alice.doc(`${chatPath}/messages/proposal`), { appointmentStatus: 'accepted' });
      transaction.update(alice.doc(chatPath), {
        isReserved: true, appointmentStatus: 'accepted', proposedPickupTime: pickupTime,
        reservationDeadline: deadline, lastMessage: 'Đã nhận lịch',
        lastMessageTime: new Date(), lastSenderId: 'alice',
      });
      transaction.set(alice.doc(`${chatPath}/messages/accepted-event`), event('accepted-event', 'alice'));
    }));

    await assertSucceeds(alice.runTransaction(async (transaction) => {
      const item = alice.doc(itemPath);
      await transaction.get(item);
      transaction.update(item, { donorHandoverConfirmed: true, requesterHandoverConfirmed: false });
      transaction.update(alice.doc(chatPath), {
        donorHandoverConfirmed: true, requesterHandoverConfirmed: false,
        lastMessage: 'Đã trao', lastMessageTime: new Date(), lastSenderId: 'alice',
      });
      transaction.set(alice.doc(`${chatPath}/messages/donor-event`), event('donor-event', 'alice'));
    }));

    await assertSucceeds(bob.runTransaction(async (transaction) => {
      const item = bob.doc(itemPath);
      await transaction.get(item);
      transaction.update(item, {
        status: 'completed', donorHandoverConfirmed: true, requesterHandoverConfirmed: true,
      });
      transaction.update(bob.doc(chatPath), {
        isReserved: false, appointmentStatus: 'completed',
        donorHandoverConfirmed: true, requesterHandoverConfirmed: true,
        lastMessage: 'Đã nhận', lastMessageTime: new Date(), lastSenderId: 'bob',
      });
      transaction.set(bob.doc(`${chatPath}/messages/requester-event`), event('requester-event', 'bob'));
    }));
  } finally {
    await env.cleanup();
  }
});
