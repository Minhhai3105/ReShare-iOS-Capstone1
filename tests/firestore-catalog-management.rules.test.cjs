const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('US18: only owner edits or closes an available P2P item; no inventory is created', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const item = {
        donorId: 'owner', title: 'Áo khoác', category: 'Quần áo', condition: 'Còn tốt',
        district: 'Hải Châu', pickupAddress: 'Hải Châu, Đà Nẵng', donorNote: 'Nhắn trước',
        imageName: 'tshirt.fill', status: 'available',
      };
      await db.doc('catalog_items/available-item').set(item);
      await db.doc('catalog_items/reserved-item').set({ ...item, status: 'reserved' });
      await db.doc('catalog_items/completed-item').set({ ...item, status: 'completed' });
    });
    const owner = env.authenticatedContext('owner').firestore();
    const other = env.authenticatedContext('other').firestore();
    const available = owner.doc('catalog_items/available-item');
    await assertSucceeds(other.doc('catalog_items/available-item').get());
    await assertFails(other.doc('catalog_items/available-item').update({ title: 'Giả mạo' }));
    await assertFails(other.doc('catalog_items/available-item').update({
      status: 'closed', closedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }));
    await assertFails(available.update({ donorId: 'other' }));
    await assertFails(available.update({ title: '' }));
    await assertSucceeds(available.update({ title: 'Áo khoác sạch', donorNote: 'Gặp tại cổng' }));
    await assertFails(owner.doc('catalog_items/reserved-item').update({ title: 'Sửa khi đã hẹn' }));
    await assertFails(owner.doc('catalog_items/reserved-item').update({
      status: 'closed', closedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }));
    await assertFails(owner.doc('catalog_items/completed-item').update({ title: 'Sửa sau khi trao' }));
    await assertSucceeds(available.update({
      status: 'closed', closedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }));
    await assertFails(available.update({ title: 'Sửa sau khi đóng' }));
    await assertFails(available.delete());
    await assertFails(owner.doc('inventory/forged').set({ warehouseId: 'kho-a', quantityAvailable: 5 }));
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      if (!(await db.collection('inventory').get()).empty) throw new Error('P2P item changed inventory');
      if (!(await db.collection('inventory_movements').get()).empty) throw new Error('P2P item created stock movement');
    });
  } finally {
    await env.cleanup();
  }
});
