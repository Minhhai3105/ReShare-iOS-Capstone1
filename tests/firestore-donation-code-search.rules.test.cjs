const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

// Web Admin tìm đơn theo mã app cho người quyên góp sao chép (confirmationCode, vd. RS-1A2B3C4D) bằng
// một truy vấn đẳng thức, dùng lại phạm vi kho của hàng đợi (donation.service.js). Rules phải cho
// System Admin tìm toàn hệ thống, cho Warehouse Admin tìm trong kho được gán, và từ chối khi thiếu phạm vi.
test('Tìm đơn theo mã RS-…: System Admin tìm toàn hệ thống, nhân sự kho chỉ trong kho được gán', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc('staff_assignments/code-sa').set({ role: 'system_admin', active: true, warehouseIds: [] });
      await db.doc('staff_assignments/code-wa').set({ role: 'warehouse_admin', active: true, warehouseIds: ['kho-a'] });
      await db.doc('donations/1A2B3C4D-0000-4000-8000-000000000001').set({
        donorId: 'donor', status: 'approved', warehouseId: 'kho-a', confirmationCode: 'RS-1A2B3C4D', createdAt: new Date() });
      await db.doc('donations/5E6F7A8B-0000-4000-8000-000000000002').set({
        donorId: 'donor', status: 'approved', warehouseId: 'kho-b', confirmationCode: 'RS-5E6F7A8B', createdAt: new Date() });
    });
    const byCode = (db, code, ...scope) => db.collection('donations').where('confirmationCode', '==', code)
      .where(...(scope.length ? scope : ['confirmationCode', '==', code])).limit(10).get();

    const sa = env.authenticatedContext('code-sa').firestore();
    const found = await assertSucceeds(byCode(sa, 'RS-5E6F7A8B'));
    assert.deepEqual(found.docs.map(doc => doc.data().warehouseId), ['kho-b']);

    const wa = env.authenticatedContext('code-wa').firestore();
    const own = await assertSucceeds(byCode(wa, 'RS-1A2B3C4D', 'warehouseId', '==', 'kho-a'));
    assert.equal(own.size, 1);
    const other = await assertSucceeds(byCode(wa, 'RS-5E6F7A8B', 'warehouseId', 'in', ['kho-a']));
    assert.equal(other.size, 0, 'đúng mã nhưng kho khác thì không trả về');
    await assertFails(byCode(wa, 'RS-5E6F7A8B'), 'thiếu phạm vi kho thì Rules từ chối, không mở rộng quyền kho');
    await assertFails(byCode(env.authenticatedContext('donor-khac').firestore(), 'RS-1A2B3C4D'), 'người dùng thường không dò mã');
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});
