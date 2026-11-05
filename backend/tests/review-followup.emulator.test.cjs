const test = require('node:test');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { createDonationResubmitApi } = require('../donation-resubmit-api.cjs');
const { createDonationReviewApi } = require('../donation-review-api.cjs');
const { createReservationExpiry } = require('../p2p-reservation-expiry.cjs');

test('BR03/BR04: resubmit reopens staff review and reservation expiry is atomic and replay safe',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async t => {
    const app = initializeApp({ projectId: 'demo-reshare' }, `followup-${Date.now()}`);
    const db = getFirestore(app), prefix = `followup-${Date.now()}`, paths = [];
    const seed = async (path, value) => { paths.push(path); await db.doc(path).set(value); return db.doc(path); };
    try {
      await t.test('Concurrent resubmission retries produce one revision and can be reviewed again', async () => {
        const id = randomUUID(), images = [1, 2, 3].map(() => `donations/${id}/${randomUUID()}`);
        await seed(`donations/${id}`, { id, donorId: `${prefix}-donor`, title: 'Before', description: '', category: 'books', condition: 'good',
          status: 'pending', reviewState: 'needs_information', version: 2, imageProvider: 'cloudinary', imagePublicIds: images });
        await seed(`image_upload_batches/donation_${id}`, { ownerUid: `${prefix}-donor`, assets: Object.fromEntries(images.map((image, i) => [i, image])) });
        await seed(`staff_assignments/${prefix}-admin`, { uid: `${prefix}-admin`, role: 'system_admin', active: true, warehouseIds: [] });
        const cfg = { db, verifyToken: async token => ({ uid: `${prefix}-${token}` }), serverTimestamp: () => FieldValue.serverTimestamp() };
        const api = createDonationResubmitApi(cfg);
        const body = { title: 'After', description: 'Details added', category: 'books', condition: 'good', quantity: 2, unitId: 'piece', expectedVersion: 2, idempotencyKey: `${prefix}-same-retry` };
        const replies = await Promise.all([1, 2].map(() => api.handle('POST', `/v1/donations/${id}/resubmit`, { authorization: 'Bearer donor' }, body)));
        assert.equal(replies.filter(reply => reply.body.idempotentReplay).length, 1);
        const audits = await db.collection('donation_resubmissions').where('donationId', '==', id).get();
        paths.push(...audits.docs.map(doc => doc.ref.path));
        assert.equal(audits.size, 1);
        const review = createDonationReviewApi(cfg);
        await review.handle('POST', `/v1/admin/donations/${id}/decide`, { authorization: 'Bearer admin' }, { action: 'approve', expectedVersion: 3 });
        assert.equal((await db.doc(`donations/${id}`).get()).data().status, 'approved');
      });
      await t.test('Legacy images require replacement and an authorized batch recovers the same donation', async () => {
        const id = randomUUID(), uploadId = randomUUID(), owner = `${prefix}-legacy`;
        const donation = await seed(`donations/${id}`, { id, donorId: owner, title: 'Legacy', description: '', category: 'books', condition: 'good',
          status: 'pending', reviewState: 'needs_information', version: 2 });
        const api = createDonationResubmitApi({ db, verifyToken: async () => ({ uid: owner }), serverTimestamp: () => FieldValue.serverTimestamp() });
        const body = { title: 'Legacy clarified', description: 'New photos', category: 'books', condition: 'good', quantity: 1, unitId: 'piece',
          expectedVersion: 2, idempotencyKey: `${prefix}-legacy-retry` };
        const submit = value => api.handle('POST', `/v1/donations/${id}/resubmit`, { authorization: 'Bearer donor' }, value);
        await assert.rejects(submit(body), { status: 400, code: 'REPLACEMENT_IMAGES_REQUIRED' });
        assert.equal((await donation.get()).data().version, 2);
        const imagePublicIds = [1, 2, 3].map(() => `donations/${uploadId}/${randomUUID()}`);
        const batch = await seed(`image_upload_batches/donation_${uploadId}`, { ownerUid: owner, assets: Object.fromEntries(imagePublicIds.map((image, i) => [i, image])) });
        const replacement = { ...body, imagePublicIds, imageUploadRecordId: uploadId };
        assert.equal((await submit(replacement)).status, 200);
        assert.equal((await submit(replacement)).body.idempotentReplay, true);
        assert.equal((await donation.get()).data().version, 3);
        assert.equal((await batch.get()).data().attachedDonationId, id);
        const audits = await db.collection('donation_resubmissions').where('donationId', '==', id).get();
        paths.push(...audits.docs.map(doc => doc.ref.path));
        assert.equal(audits.size, 1);
      });
      await t.test('Expired holds release once; one-sided handover and a future reservation remain untouched', async () => {
        const now = Date.now();
        const items = [];
        for (const [suffix, confirmed, deadline] of [['expired', false, now - 1000], ['one-side', true, now - 1000], ['future', false, now + 60000]]) {
          const id = `cat_${prefix}-${suffix}`, chatId = `${prefix}-${suffix}`;
          const at = Timestamp.fromMillis(deadline);
          const item = await seed(`catalog_items/${id}`, { id, donorId: 'donor', status: 'reserved', reservedChatId: chatId, reservedRequesterId: 'requester',
            reservationDeadline: at, donorHandoverConfirmed: confirmed, requesterHandoverConfirmed: false });
          await seed(`conversations/${chatId}`, { id: chatId, itemId: id, donorId: 'donor', requesterId: 'requester', participantIds: ['donor', 'requester'],
            isReserved: true, appointmentStatus: 'accepted', reservationDeadline: at, proposedPickupTime: Timestamp.fromMillis(deadline - 7200000), donorHandoverConfirmed: confirmed, requesterHandoverConfirmed: false });
          items.push(item);
        }
        const firstWorker = createReservationExpiry({ db, now: () => now });
        const secondWorker = createReservationExpiry({ db, now: () => now });
        const results = await Promise.all([firstWorker.expireOne(items[0], now), secondWorker.expireOne(items[0], now)]);
        assert.equal(results.filter(Boolean).length, 1);
        const released = (await items[0].get()).data();
        assert.equal(released.status, 'available');
        assert.equal(Object.hasOwn(released, 'reservedChatId'), false, 'The app must be able to reserve the item again');
        assert.equal(await firstWorker.expireOne(items[1], now), false);
        assert.equal(await firstWorker.expireOne(items[2], now), false);
        assert.equal((await items[1].get()).data().status, 'reserved');
        const messages = await db.collection(`conversations/${prefix}-expired/messages`).get();
        paths.push(...messages.docs.map(doc => doc.ref.path));
        assert.equal(messages.size, 1);
        assert.equal(messages.docs[0].data().messageType, 'system');
        assert.equal(await firstWorker.expireOne(items[0], now), false);
      });
    } finally {
      await Promise.allSettled(paths.map(path => db.doc(path).delete()));
      await deleteApp(app);
    }
  });
