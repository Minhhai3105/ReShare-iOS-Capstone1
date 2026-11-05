const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { createContactApi } = require('../contact-api.cjs');

test('Contact inbox reads past 50 records with stable cursor order and live role checks', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, `contact-pages-${randomUUID()}`);
  const db = getFirestore(app), prefix = `inbox-${randomUUID()}`, ids = [], paths = [];
  try {
    const assignment = db.collection('staff_assignments').doc(prefix);
    paths.push(assignment.path);
    await assignment.set({ active: true, role: 'system_admin' });
    const batch = db.batch();
    for (let i = 0; i < 55; i++) {
      const id = `${prefix}_${String(i).padStart(2, '0')}`, ref = db.collection('contacts').doc(id);
      ids.push(id); paths.push(ref.path);
      batch.set(ref, { name: 'Pagination QA', email: 'qa@example.invalid', message: `Case ${i}`, status: 'new',
        createdAt: Timestamp.fromMillis(2200000000000), internalNote: 'must not leak' });
    }
    await batch.commit();
    const api = createContactApi({ db, verifyToken: async () => ({ uid: prefix }), serverTimestamp: () => new Date() });
    const get = cursor => api.handle('GET', '/v1/contact', { authorization: 'Bearer test' }, null,
      `/v1/contact?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    const seen = [];
    let cursor = null;
    for (let page = 0; page < 3; page++) {
      const { body } = await get(cursor);
      assert.ok(body.contacts.length <= 20);
      body.contacts.forEach(item => { assert.equal(item.internalNote, undefined); assert.equal(typeof item.createdAt, 'string'); seen.push(item.id); });
      cursor = body.nextCursor;
      assert.equal(body.hasMore, page < 2);
    }
    assert.deepEqual(seen, [...ids].reverse());
    await assignment.update({ active: false });
    await assert.rejects(get(), { status: 403 });
    await assignment.set({ active: true, role: 'warehouse_admin' });
    await assert.rejects(get(), { status: 403 });
    await assert.rejects(api.handle('GET', '/v1/contact', {}, null, '/v1/contact?limit=20'), { status: 401 });
  } finally {
    await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
  }
});
