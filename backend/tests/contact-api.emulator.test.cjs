const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createContactApi } = require('../contact-api.cjs');

test('contact submission writes to real Firestore and is verifiable by System Admin', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'contact-api-emulator-test');
  try {
    const db = getFirestore(app);

    // Setup an active system admin for inbox verification
    await db.collection('staff_assignments').doc('admin-1').set({
      active: true,
      role: 'system_admin',
    });

    const verifyToken = async token => {
      if (token === 'admin-token') return { uid: 'admin-1' };
      if (token === 'donor-token') return { uid: 'donor-1' };
      throw new Error('Unauthorized');
    };

    const api = createContactApi({
      db,
      verifyToken,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    const contactPayload = {
      name: 'Nguyen Van A',
      email: 'nguyenvana@example.com',
      message: 'Toi muon quyen gop quan ao va do dung gia dinh cho chuong trinh ReShare.',
    };

    // 1. Gửi liên hệ thật qua POST /v1/contact
    const postResult = await api.handle('POST', '/v1/contact', {}, contactPayload);
    assert.equal(postResult.status, 201);
    assert.deepEqual(postResult.body, { status: 'received' });

    // 2. Kiểm tra dữ liệu được lưu thật trong Firestore collection 'contacts'
    const snapshot = await db.collection('contacts')
      .where('email', '==', 'nguyenvana@example.com')
      .get();
    assert.equal(snapshot.size, 1, 'Phải có đúng 1 bản ghi contact được lưu trong Firestore');

    const storedData = snapshot.docs[0].data();
    assert.equal(storedData.name, 'Nguyen Van A');
    assert.equal(storedData.email, 'nguyenvana@example.com');
    assert.equal(storedData.message, 'Toi muon quyen gop quan ao va do dung gia dinh cho chuong trinh ReShare.');
    assert.equal(storedData.status, 'new');
    assert.ok(storedData.createdAt, 'Phải có trường createdAt');

    // 3. Kiểm tra rate-limit qua Firestore transaction
    await api.handle('POST', '/v1/contact', {}, { ...contactPayload, message: 'Gui lan 2' });
    await api.handle('POST', '/v1/contact', {}, { ...contactPayload, message: 'Gui lan 3' });

    // Lần thứ 4 trong vòng 10 phút phải bị chặn bởi HTTP 429
    await assert.rejects(
      api.handle('POST', '/v1/contact', {}, { ...contactPayload, message: 'Gui lan 4 spam' }),
      err => err.status === 429 && /Too many requests/.test(err.message),
    );

    // 4. Kiểm tra phân quyền đọc Contact inbox
    // Unauthenticated
    await assert.rejects(
      api.handle('GET', '/v1/contact', {}),
      err => err.status === 401,
    );

    // Donor / regular user
    await assert.rejects(
      api.handle('GET', '/v1/contact', { authorization: 'Bearer donor-token' }),
      err => err.status === 403,
    );

    // System Admin
    const getResult = await api.handle('GET', '/v1/contact', { authorization: 'Bearer admin-token' });
    assert.equal(getResult.status, 200);
    assert.ok(Array.isArray(getResult.body.contacts));
    const found = getResult.body.contacts.find(c => c.email === 'nguyenvana@example.com');
    assert.ok(found, 'System Admin phải đọc được contact vừa gửi');
    assert.equal(found.name, 'Nguyen Van A');
  } finally {
    try {
      const db = getFirestore(app);
      await db.collection('staff_assignments').doc('admin-1').delete();
      const contacts = await db.collection('contacts').where('email', '==', 'nguyenvana@example.com').get();
      for (const doc of contacts.docs) await doc.ref.delete();
    } catch {
      // ignore cleanup error
    }
    await deleteApp(app);
  }
});
