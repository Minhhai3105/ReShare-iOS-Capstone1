const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('Kho đồ 0đ: client không giả nhãn AI/quyết định kiểm duyệt, bài bình thường vẫn tạo được', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-reshare', firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
  try {
    const itemId = 'cat_ai_rules';
    const ids = [1, 2, 3].map(i => `catalog_items/${itemId}/00000000-0000-4000-8000-00000000000${i}`);
    await env.withSecurityRulesDisabled(context => context.firestore().doc(`image_upload_batches/catalog_item_${itemId}`).set({
      ownerUid: 'donor-ai', assets: { a: ids[0], b: ids[1], c: ids[2] },
    }));
    const donor = env.authenticatedContext('donor-ai').firestore();
    const ref = donor.doc(`catalog_items/${itemId}`);
    const listing = { donorId: 'donor-ai', status: 'available', title: 'Áo mới', donorNote: 'Tặng miễn phí', imageProvider: 'cloudinary', imagePublicIds: ids };
    await assertFails(ref.set({ ...listing, aiModeration: { status: 'safe' } }));
    await assertFails(ref.set({ ...listing, aiModeration: null }));
    await assertFails(ref.set({ ...listing, moderation: { source: 'admin_p2p' } }));
    await assertSucceeds(ref.set(listing));
    await assertFails(ref.update({ aiModeration: { status: 'safe' } }));
    await assertFails(donor.doc('p2p_ai_checks/cat_ai_rules').set({ checkId: 'forged' }));
    await assertFails(donor.doc('p2p_ai_checks/cat_ai_rules').get());
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});
