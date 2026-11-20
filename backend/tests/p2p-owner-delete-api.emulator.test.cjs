const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createP2pOwnerDeleteApi } = require('../p2p-owner-delete-api.cjs');
const { createImageCleanupJobs } = require('../image-cleanup-jobs.cjs');

test('Kho đồ 0đ: chủ bài xoá bài chưa có hẹn, lưu audit và giao ảnh cho worker đúng một lần', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'p2p-owner-delete');
  const db = getFirestore(app);
  const listingId = 'cat_owner_delete';
  const uid = 'owner-delete-test';
  const item = db.doc(`catalog_items/${listingId}`);
  const pickup = item.collection('private').doc('pickup');
  const audit = db.doc(`p2p_listing_audit/owner_delete_${listingId}`);
  const profile = db.doc(`users/${uid}`);
  const jobs = db.collection('image_cleanup_jobs').where('reason', '==', 'owner_delete');
  const publicId = `catalog_items/${listingId}/image`;
  const listing = { donorId: uid, status: 'available', imagePublicIds: [publicId, 'catalog_items/unrelated/image'] };
  const api = createP2pOwnerDeleteApi({
    db, verifyToken: async token => ({ uid: token }), serverTimestamp: () => FieldValue.serverTimestamp(),
  });
  const remove = (actor = uid) => api.handle('POST', `/v1/p2p/listings/${listingId}/delete`,
    actor ? { authorization: `Bearer ${actor}` } : {});
  try {
    await assert.rejects(remove(null), { status: 401 });
    await assert.rejects(remove(), { status: 404, code: 'LISTING_NOT_FOUND' });
    await Promise.all([item.set(listing), pickup.set({ pickupAddress: 'Địa chỉ thử nghiệm' })]);
    await assert.rejects(remove('owner-delete-other'), { status: 403, code: 'NOT_OWNER' });
    for (const user of [{ suspended: true }, { suspended: false, unsuspendPending: true }]) {
      await profile.set(user);
      await assert.rejects(remove(), { status: 403, code: 'ACCOUNT_SUSPENDED' });
    }
    await profile.set({ suspended: false });
    for (const state of [{ status: 'reserved' }, { reservedChatId: 'chat-test' }, { reservedRequesterId: 'requester-test' },
      { donorHandoverConfirmed: true }, { requesterHandoverConfirmed: true }]) {
      await item.set({ ...listing, ...state });
      await assert.rejects(remove(), { status: 409, code: 'HAS_RESERVATION' });
    }
    await item.set({ ...listing, status: 'completed' });
    await assert.rejects(remove(), { status: 409, code: 'NOT_DELETABLE' });
    assert.equal((await pickup.get()).exists, true);
    assert.equal((await audit.get()).exists, false);
    assert.equal((await jobs.get()).size, 0);

    await item.set({ ...listing, status: 'Sẵn sàng nhận đồ' });
    const expected = { status: 200, body: { deleted: true } };
    assert.deepEqual(await Promise.all([remove(), remove()]), [expected, expected]);
    assert.equal((await item.get()).exists, false);
    assert.equal((await pickup.get()).exists, false);
    await assert.rejects(remove('owner-delete-other'), { status: 404, code: 'LISTING_NOT_FOUND' });
    const auditData = (await audit.get()).data();
    assert.equal(auditData.action, 'owner_delete');
    assert.equal(auditData.actorUid, uid);
    assert.equal(auditData.previousStatus, 'available');
    assert.equal(Object.hasOwn(auditData, 'pickupAddress'), false);
    const work = await jobs.get();
    assert.equal(work.size, 1);
    assert.deepEqual(work.docs[0].data().publicIds, [publicId]);
    const removedImages = [];
    const worker = createImageCleanupJobs({ db, deleteCatalogImage: async id => { removedImages.push(id); } });
    assert.equal(await worker.processJob(work.docs[0].ref), 0);
    assert.deepEqual(removedImages, [publicId]);
    assert.equal((await jobs.get()).size, 0);
  } finally {
    try {
      const pending = await jobs.get();
      await Promise.all([item, pickup, audit, profile, ...pending.docs.map(doc => doc.ref)].map(ref => ref.delete()));
    } finally {
      await deleteApp(app);
    }
  }
});
