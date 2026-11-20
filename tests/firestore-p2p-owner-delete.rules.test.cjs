const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('Kho đồ 0đ: client không sửa bài người khác, xoá trực tiếp hay đăng lại ID đã xoá', async () => {
  const rules = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');
  const env = await initializeTestEnvironment({ projectId: 'demo-reshare', firestore: { rules } });
  try {
    const uid = 'owner-delete-rules';
    const id = 'item-owner-delete-rules';
    const path = `catalog_items/${id}`;
    const listing = { donorId: uid, status: 'available', title: 'Áo khoác' };
    const owner = env.authenticatedContext(uid).firestore();
    const other = env.authenticatedContext('owner-delete-rules-other').firestore();
    await assertSucceeds(owner.doc(path).set(listing));
    await assertFails(other.doc(path).update({ title: 'Đổi tiêu đề' }));
    await assertFails(other.doc(path).delete());
    await assertFails(owner.doc(path).delete());

    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const batch = db.batch();
      batch.set(db.doc(`p2p_listing_audit/owner_delete_${id}`), { action: 'owner_delete', actorUid: uid });
      batch.delete(db.doc(path));
      await batch.commit();
    });
    await assertFails(owner.doc(path).set(listing));
    await assertFails(owner.doc(`p2p_listing_audit/owner_delete_${id}`).get());
    await assertSucceeds(owner.doc('catalog_items/item-owner-delete-fresh').set(listing));
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});
