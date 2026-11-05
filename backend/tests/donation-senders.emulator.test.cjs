const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createDonationReviewApi } = require('../donation-review-api.cjs');

test('Sender summaries join private profiles only within current warehouse scope on Firestore Emulator', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const prefix = `sender-${randomUUID()}`;
  const app = initializeApp({ projectId: 'demo-reshare' }, prefix), db = getFirestore(app);
  const paths = [`staff_assignments/${prefix}`, `users/${prefix}`, ...['a', 'b', 'missing-profile'].map(id => `donations/${prefix}-${id}`)];
  try {
    const batch = db.batch();
    batch.set(db.doc(paths[0]), { role: 'warehouse_admin', active: true, warehouseIds: ['warehouse-a'] });
    batch.set(db.doc(paths[1]), { displayName: 'Nguyễn Minh Anh', email: 'anh@example.invalid', phoneNumber: 'PRIVATE_PHONE' });
    batch.set(db.doc(paths[2]), { donorId: prefix, warehouseId: 'warehouse-a' });
    batch.set(db.doc(paths[3]), { donorId: prefix, warehouseId: 'warehouse-b' });
    batch.set(db.doc(paths[4]), { donorId: `${prefix}-missing`, warehouseId: 'warehouse-a' });
    await batch.commit();
    const api = createDonationReviewApi({ db, verifyToken: async () => ({ uid: prefix }) });
    const read = donationIds => api.handle('POST', '/v1/admin/donations/senders', { authorization: 'Bearer test' }, { donationIds });
    const result = await read([`${prefix}-a`, `${prefix}-missing-profile`]);
    assert.deepEqual(result.body.senders, [
      { donationId: `${prefix}-a`, donor: { name: 'Nguyễn Minh Anh', email: 'anh@example.invalid' } },
      { donationId: `${prefix}-missing-profile`, donor: { name: 'Chưa cập nhật tên', email: null } },
    ]);
    await assert.rejects(read([`${prefix}-a`, `${prefix}-b`]), { status: 403 });
    await db.doc(paths[0]).update({ role: 'system_admin' });
    assert.equal((await read([`${prefix}-b`])).status, 200);
    await db.doc(paths[0]).update({ active: false });
    await assert.rejects(read([`${prefix}-a`]), { status: 403 });
    await assert.rejects(api.handle('POST', '/v1/admin/donations/senders', {}, { donationIds: [`${prefix}-a`] }), { status: 401 });
  } finally {
    await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
  }
});
