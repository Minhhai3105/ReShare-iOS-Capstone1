const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createBeneficiariesApi } = require('../beneficiaries-api.cjs');

test('US15: trusted profile, warehouse privacy, verification and support history', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const suffix = randomUUID().slice(0, 8);
  const app = initializeApp({ projectId: 'demo-reshare' }, `beneficiaries-${suffix}`);
  const db = getFirestore(app);
  const warehouseA = `b81-a-${suffix}`;
  const warehouseB = `b81-b-${suffix}`;
  const warehouseExtra = `b81-extra-29-${suffix}`;
  const workerA = `b81-worker-a-${suffix}`;
  const reviewerA = `b81-reviewer-a-${suffix}`;
  const workerB = `b81-worker-b-${suffix}`;
  const admin = `b81-admin-${suffix}`;
  const paths = [
    `warehouses/${warehouseA}`, `warehouses/${warehouseB}`, `warehouses/${warehouseExtra}`,
    `staff_assignments/${workerA}`, `staff_assignments/${reviewerA}`,
    `staff_assignments/${workerB}`, `staff_assignments/${admin}`,
  ];
  const api = createBeneficiariesApi({
    db, verifyToken: async token => ({ uid: token }),
    serverTimestamp: () => new Date('2026-10-31T09:00:00Z'),
  });
  const call = (method, path, uid, body, requestUrl = path) => api.handle(method, path,
    uid ? { authorization: `Bearer ${uid}` } : {}, body, requestUrl);

  try {
    await Promise.all([
      db.doc(`warehouses/${warehouseA}`).set({ status: 'active', name: 'Kho A' }),
      db.doc(`warehouses/${warehouseB}`).set({ status: 'active', name: 'Kho B' }),
      db.doc(`warehouses/${warehouseExtra}`).set({ status: 'active', name: 'Kho mở rộng' }),
      db.doc(`staff_assignments/${workerA}`).set({ active: true, role: 'warehouse_admin',
        warehouseIds: [warehouseA, ...Array.from({ length: 30 }, (_, i) => `b81-extra-${i}-${suffix}`)] }),
      db.doc(`staff_assignments/${reviewerA}`).set({ active: true, role: 'warehouse_admin', warehouseIds: [warehouseA] }),
      db.doc(`staff_assignments/${workerB}`).set({ active: true, role: 'warehouse_admin', warehouseIds: [warehouseB] }),
      db.doc(`staff_assignments/${admin}`).set({ active: true, role: 'system_admin', warehouseIds: [] }),
    ]);

    await assert.rejects(call('GET', '/v1/admin/beneficiaries'), { status: 401 });
    await assert.rejects(call('POST', '/v1/admin/beneficiaries', workerA,
      { name: 'Minh', warehouseId: warehouseB }), { status: 403 });
    await assert.rejects(call('POST', '/v1/admin/beneficiaries', workerA,
      { name: 'Minh', warehouseId: warehouseA, cccd: 'private' }), { status: 400 });
    await assert.rejects(call('POST', '/v1/admin/beneficiaries', workerA,
      { name: ' ', warehouseId: warehouseA }), { status: 400 });
    await assert.rejects(call('POST', '/v1/admin/beneficiaries', workerA,
      { name: 'Minh', warehouseId: warehouseA, supportNeeds: 'Tự do' }), { status: 400 });

    const created = await call('POST', '/v1/admin/beneficiaries', workerA, {
      name: 'Nguyễn Minh', warehouseId: warehouseA, phone: '0901234567',
      notes: 'Liên hệ trước khi bàn giao', needs: ['clothing'],
    });
    const id = created.body.beneficiary.id;
    paths.push(`beneficiaries/${id}`);
    for (let version = 1; version <= 7; version += 1) paths.push(`beneficiary_audit/${id}_v${version}`);
    assert.equal(created.status, 201);
    assert.equal(created.body.beneficiary.status, 'unverified');
    assert.equal(created.body.beneficiary.version, 1);
    assert.equal((await db.doc(`beneficiaries/${id}`).get()).data().nameSearch, 'nguyen minh');
    const second = await call('POST', '/v1/admin/beneficiaries', workerA,
      { name: 'Nguyễn Mai', warehouseId: warehouseA, needs: ['books'] });
    paths.push(`beneficiaries/${second.body.beneficiary.id}`,
      `beneficiary_audit/${second.body.beneficiary.id}_v1`);
    const third = await call('POST', '/v1/admin/beneficiaries', workerA,
      { name: 'Trần X', warehouseId: warehouseExtra, needs: ['household'] });
    paths.push(`beneficiaries/${third.body.beneficiary.id}`,
      `beneficiary_audit/${third.body.beneficiary.id}_v1`);
    const firstPage = await call('GET', '/v1/admin/beneficiaries', workerA, null,
      '/v1/admin/beneficiaries?limit=1');
    assert.ok(firstPage.body.nextCursor);
    const secondPage = await call('GET', '/v1/admin/beneficiaries', workerA, null,
      `/v1/admin/beneficiaries?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`);
    assert.equal(secondPage.body.items.length, 1);
    assert.notEqual(firstPage.body.items[0].id, secondPage.body.items[0].id);
    assert.ok(secondPage.body.nextCursor,
      `Expected third page after ${firstPage.body.items[0].id} and ${secondPage.body.items[0].id}`);
    const thirdPage = await call('GET', '/v1/admin/beneficiaries', workerA, null,
      `/v1/admin/beneficiaries?limit=1&cursor=${encodeURIComponent(secondPage.body.nextCursor)}`);
    assert.deepEqual(new Set([firstPage.body.items[0].id, secondPage.body.items[0].id,
      thirdPage.body.items[0].id]), new Set([id, second.body.beneficiary.id, third.body.beneficiary.id]));
    await assert.rejects(call('GET', '/v1/admin/beneficiaries', workerA, null,
      '/v1/admin/beneficiaries?offset=1'), { status: 400 });

    const list = await call('GET', '/v1/admin/beneficiaries', workerA, null,
      `/v1/admin/beneficiaries?warehouseId=${warehouseA}&search=Nguyen`);
    assert.equal(list.body.items.some(item => item.id === id), true);
    assert.equal(Object.hasOwn(list.body.items.find(item => item.id === id), 'phone'), false);
    await assert.rejects(call('GET', `/v1/admin/beneficiaries/${id}`, workerB), { status: 403 });
    await assert.rejects(call('GET', '/v1/admin/beneficiaries', workerB, null,
      `/v1/admin/beneficiaries?warehouseId=${warehouseA}`), { status: 403 });

    await assert.rejects(call('POST', `/v1/admin/beneficiaries/${id}/update`, workerA,
      { expectedVersion: 1, warehouseId: warehouseB }), { status: 400 });
    await assert.rejects(call('POST', `/v1/admin/beneficiaries/${id}/verify`, workerA,
      { expectedVersion: 1, status: 'approved' }), { status: 403 });
    const updated = await call('POST', `/v1/admin/beneficiaries/${id}/update`, workerA,
      { expectedVersion: 1, notes: 'Đã xác nhận số liên hệ' });
    assert.equal(updated.body.beneficiary.version, 2);
    await assert.rejects(call('POST', `/v1/admin/beneficiaries/${id}/update`, workerA,
      { expectedVersion: 1, notes: 'Ghi đè' }), { status: 409 });
    await assert.rejects(call('POST', `/v1/admin/beneficiaries/${id}/verify`, reviewerA,
      { expectedVersion: 2, status: 'approved' }), { status: 403 });
    const verified = await call('POST', `/v1/admin/beneficiaries/${id}/verify`, admin,
      { expectedVersion: 2, status: 'approved' });
    assert.equal(verified.body.beneficiary.status, 'approved');
    assert.equal(verified.body.beneficiary.version, 3);
    const unverified = await call('POST', `/v1/admin/beneficiaries/${id}/verify`, admin,
      { expectedVersion: 3, status: 'unverified' });
    assert.equal(unverified.body.beneficiary.verifiedByUid, admin);
    assert.equal(unverified.body.beneficiary.unverifiedByUid, admin);
    assert.ok(unverified.body.beneficiary.unverifiedAt);
    const reapproved = await call('POST', `/v1/admin/beneficiaries/${id}/verify`, admin,
      { expectedVersion: 4, status: 'approved' });
    assert.equal(reapproved.body.beneficiary.version, 5);
    const audit = await db.collection('beneficiary_audit').where('beneficiaryId', '==', id).get();
    assert.deepEqual(audit.docs.map(doc => doc.data().action).sort(),
      ['approved', 'approved', 'created', 'unverified', 'updated']);
    assert.equal(audit.docs.find(doc => doc.data().action === 'updated').data().changes.notes.before,
      'Liên hệ trước khi bàn giao');
    await assert.rejects(call('GET', `/v1/admin/beneficiaries/${id}/audit`, workerB), { status: 403 });
    const auditFirst = await call('GET', `/v1/admin/beneficiaries/${id}/audit`, reviewerA, null,
      `/v1/admin/beneficiaries/${id}/audit?limit=1`);
    assert.equal(auditFirst.body.items[0].action, 'approved');
    assert.ok(auditFirst.body.nextCursor);
    const auditSecond = await call('GET', `/v1/admin/beneficiaries/${id}/audit`, reviewerA, null,
      `/v1/admin/beneficiaries/${id}/audit?limit=1&cursor=${encodeURIComponent(auditFirst.body.nextCursor)}`);
    assert.equal(auditSecond.body.items[0].action, 'unverified');

    const editedAfterApproval = await call('POST', `/v1/admin/beneficiaries/${id}/update`, workerA,
      { expectedVersion: 5, needs: ['clothing', 'books'] });
    assert.equal(editedAfterApproval.body.beneficiary.status, 'unverified');
    assert.deepEqual(editedAfterApproval.body.beneficiary.needs, ['clothing', 'books']);
    await assert.rejects(call('POST', `/v1/admin/beneficiaries/${id}/verify`, reviewerA,
      { expectedVersion: 6, status: 'rejected', reason: 'Thiếu thông tin' }), { status: 403 });
    await assert.rejects(call('POST', `/v1/admin/beneficiaries/${id}/verify`, admin,
      { expectedVersion: 6, status: 'rejected' }), { status: 400 });
    const rejected = await call('POST', `/v1/admin/beneficiaries/${id}/verify`, admin,
      { expectedVersion: 6, status: 'rejected', reason: 'Thiếu thông tin' });
    assert.equal(rejected.body.beneficiary.status, 'rejected');
    assert.equal(rejected.body.beneficiary.reviewReason, 'Thiếu thông tin');

    const voucherA = `b81-voucher-a-${suffix}`;
    const voucherA2 = `b81-voucher-a2-${suffix}`;
    const voucherB = `b81-voucher-b-${suffix}`;
    const voucherPending = `b81-voucher-pending-${suffix}`;
    paths.push(`distribution_vouchers/${voucherA}`, `distribution_vouchers/${voucherA2}`,
      `distribution_vouchers/${voucherB}`,
      `distribution_vouchers/${voucherPending}`);
    await Promise.all([
      db.doc(`distribution_vouchers/${voucherA}`).set({
        beneficiaryId: id, warehouseId: warehouseA, status: 'confirmed',
        confirmedAt: new Date('2026-10-31T10:00:00Z'), beneficiaryPhone: 'secret',
        lines: [{ inventoryItemId: 'item-a', quantity: 2, unitId: 'piece' }],
      }),
      db.doc(`distribution_vouchers/${voucherA2}`).set({
        beneficiaryId: id, warehouseId: warehouseA, status: 'confirmed',
        confirmedAt: new Date('2026-10-30T10:00:00Z'), lines: [],
      }),
      db.doc(`distribution_vouchers/${voucherB}`).set({
        beneficiaryId: id, warehouseId: warehouseB, status: 'confirmed',
        confirmedAt: new Date('2026-10-31T11:00:00Z'), lines: [],
      }),
      db.doc(`distribution_vouchers/${voucherPending}`).set({
        beneficiaryId: id, warehouseId: warehouseA, status: 'pending',
        confirmedAt: new Date('2026-10-31T12:00:00Z'), lines: [],
      }),
    ]);
    const detail = await call('GET', `/v1/admin/beneficiaries/${id}`, workerA);
    assert.equal(detail.body.supportCount, 2);
    assert.equal(detail.body.supportHistory.length, 2);
    assert.equal(detail.body.supportHistory[0].voucherId, voucherA);
    assert.equal(JSON.stringify(detail.body).includes('secret'), false);
    const historyFirst = await call('GET', `/v1/admin/beneficiaries/${id}`, workerA, null,
      `/v1/admin/beneficiaries/${id}?limit=1`);
    assert.ok(historyFirst.body.nextCursor);
    const historySecond = await call('GET', `/v1/admin/beneficiaries/${id}`, workerA, null,
      `/v1/admin/beneficiaries/${id}?limit=1&cursor=${encodeURIComponent(historyFirst.body.nextCursor)}`);
    assert.equal(historySecond.body.supportHistory[0].voucherId, voucherA2);

    await db.doc(`staff_assignments/${workerA}`).update({ active: false });
    await assert.rejects(call('GET', `/v1/admin/beneficiaries/${id}`, workerA), { status: 403 });
  } finally {
    const cleanup = await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
    assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Emulator cleanup must succeed');
  }
});
