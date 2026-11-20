const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createDonationCancelApi } = require('../donation-cancel-api.cjs');
const { createDonationReviewApi } = require('../donation-review-api.cjs');
const { createReceiptApi } = require('../receipt-api.cjs');

test('Donor cancellation is authorized and versioned, preserves evidence, and blocks staff writes', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'donation-cancel-test');
  const db = getFirestore(app);
  const id = 'don-emulator-cancel';
  const donation = db.doc(`donations/${id}`);
  const privateReview = db.doc(`donation_reviews/${id}`);
  const receiptDoc = db.doc(`receipts/rcp_${id}`);
  const staff = db.doc('staff_assignments/cancel-test-staff');
  const warehouseId = 'cancel-test-warehouse';
  const warehouse = db.doc(`warehouses/${warehouseId}`);
  const options = { db, verifyToken: async uid => ({ uid }), serverTimestamp: () => FieldValue.serverTimestamp() };
  const cancelApi = createDonationCancelApi(options);
  const reviewApi = createDonationReviewApi(options);
  const receiptApi = createReceiptApi(options);
  const staffHeaders = { authorization: 'Bearer cancel-test-staff' };
  const cancel = (body, uid = 'cancel-test-donor') => cancelApi.handle('POST', `/v1/donations/${id}/cancel`,
    uid ? { authorization: `Bearer ${uid}` } : {}, body);
  try {
    await assert.rejects(cancel({ expectedVersion: 1 }, null), { status: 401 });
    await assert.rejects(cancel({ expectedVersion: 1 }), { status: 404 });
    const original = { donorId: 'cancel-test-donor', status: 'pending', warehouseId,
      images: ['https://example.invalid/item.jpg'], createdAt: FieldValue.serverTimestamp() };
    await donation.set({ ...original, status: 'approved' });
    await assert.rejects(cancel({ expectedVersion: 1 }), { status: 409, code: 'NOT_CANCELLABLE' });
    await donation.set({ ...original, reviewState: 'needs_information' });
    await assert.rejects(cancel({ expectedVersion: 1 }), { status: 409, code: 'NOT_CANCELLABLE' });
    await donation.set(original);
    await assert.rejects(cancel({ expectedVersion: 1 }, 'cancel-test-other'), { status: 403 });
    await assert.rejects(cancel({ expectedVersion: 2 }), { status: 409, code: 'VERSION_CONFLICT' });
    await assert.rejects(cancel({ expectedVersion: 1, reason: 'a'.repeat(301) }), { status: 400 });
    const receipt = { warehouseId, quantity: 1, unitId: 'piece', conditionId: 'good', note: '' };
    await Promise.all([
      staff.set({ role: 'system_admin', active: true }), warehouse.set({ status: 'active' }), receiptDoc.set(receipt),
    ]);
    const result = await cancel({ expectedVersion: 1, reason: '  Đã tặng nơi khác  ' });
    assert.deepEqual(result, { status: 200, body: { success: true, version: 2 } });
    await assert.rejects(cancel({ expectedVersion: 1 }), { status: 409, code: 'NOT_CANCELLABLE' });
    const final = (await donation.get()).data();
    assert.equal(final.status, 'cancelled');
    assert.equal(final.cancelledBy, 'donor');
    assert.equal(final.version, 2);
    assert.equal(final.cancelReason, 'Đã tặng nơi khác');
    assert.ok(final.cancelledAt.isEqual(final.updatedAt));
    assert.deepEqual(final.images, original.images);
    const path = `/v1/admin/donations/${id}`;
    const error = { status: 409, code: 'DONATION_CANCELLED' };
    await assert.rejects(reviewApi.handle('POST', `${path}/decide`, staffHeaders, { action: 'approve' }), error);
    await assert.rejects(reviewApi.handle('POST', `${path}/assign-warehouse`, staffHeaders, { warehouseId, expectedVersion: 2 }), error);
    await assert.rejects(reviewApi.handle('POST', `${path}/confirm-category`, staffHeaders, { category: 'clothing', expectedVersion: 0 }), error);
    await assert.rejects(receiptApi.handle('POST', `${path}/receipt`, staffHeaders, receipt), error);
    assert.equal((await reviewApi.handle('GET', path, staffHeaders)).body.donation.cancelledAt, final.cancelledAt.toDate().toISOString());
    assert.deepEqual((await receiptDoc.get()).data(), receipt);
    assert.deepEqual((await donation.get()).data(), final);
    assert.equal((await privateReview.get()).exists, false);
  } finally {
    try {
      await Promise.all([donation, privateReview, receiptDoc, staff, warehouse].map(ref => ref.delete()));
    } finally {
      await deleteApp(app);
    }
  }
});
