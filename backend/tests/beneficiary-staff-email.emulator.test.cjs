const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createBeneficiariesApi } = require('../beneficiaries-api.cjs');

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

test('hồ sơ người thụ hưởng trả email người tạo / người duyệt, vẫn giữ UID gốc', { skip }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const app = initializeApp({ projectId: 'demo-reshare' }, `ben-email-${suffix}`);
  const db = getFirestore(app);
  const admin = `ben-email-admin-${suffix}`;
  const warehouseId = `ben-email-kho-${suffix}`;
  const paths = [`warehouses/${warehouseId}`, `staff_assignments/${admin}`];
  const auth = { async getUsers(ids) {
    return { users: ids.filter(({ uid }) => uid === admin).map(({ uid }) => ({ uid, email: 'admin@reshare.test' })) };
  } };
  const api = createBeneficiariesApi({ db, auth, verifyToken: async token => ({ uid: token }) });
  const headers = { authorization: `Bearer ${admin}` };
  try {
    await db.doc(`warehouses/${warehouseId}`).set({ status: 'active', name: 'Kho email' });
    await db.doc(`staff_assignments/${admin}`).set({ active: true, role: 'system_admin', warehouseIds: [] });

    const created = await api.handle('POST', '/v1/admin/beneficiaries', headers,
      { name: 'Người nhận thử', warehouseId, needs: ['clothing'] });
    const id = created.body.beneficiary.id;
    paths.push(`beneficiaries/${id}`, `beneficiary_audit/${id}_v1`, `beneficiary_audit/${id}_v2`);
    assert.equal(created.body.beneficiary.createdByUid, admin);
    assert.equal(created.body.beneficiary.createdByEmail, 'admin@reshare.test');

    const verified = await api.handle('POST', `/v1/admin/beneficiaries/${id}/verify`, headers,
      { status: 'approved', expectedVersion: 1 });
    assert.equal(verified.body.beneficiary.verifiedByEmail, 'admin@reshare.test');

    const detail = await api.handle('GET', `/v1/admin/beneficiaries/${id}`, headers, null);
    assert.equal(detail.body.beneficiary.createdByEmail, 'admin@reshare.test');
  } finally {
    const cleanup = await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
    assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Emulator cleanup must succeed');
  }
});
