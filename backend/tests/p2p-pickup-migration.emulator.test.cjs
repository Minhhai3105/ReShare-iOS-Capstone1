const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { migrateP2pPickup } = require('../p2p-pickup-migration.cjs');

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

test('chuyển địa chỉ P2P: chạy thử không ghi, chạy thật có sao lưu, chạy lại không còn gì', { skip }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const app = initializeApp({ projectId: 'demo-reshare' }, `p2p-migration-${suffix}`);
  const db = getFirestore(app);
  const id = name => `${name}-${suffix}`;
  const paths = [];
  const seed = async (path, data) => { paths.push(path); await db.doc(path).set(data); };
  const read = async path => (await db.doc(path).get()).data();
  try {
    const pickupTime = new Date('2026-11-02T03:00:00Z');
    await seed(`catalog_items/${id('a')}`, { donorId: 'alice', status: 'reserved', pickupAddress: '12 Lê Duẩn', pickupTime });
    await seed(`catalog_items/${id('b')}`, { donorId: 'alice', status: 'available', pickupAddress: 'Địa chỉ cũ' });
    await seed(`catalog_items/${id('b')}/private/pickup`, { pickupAddress: 'Địa chỉ người đăng vừa sửa' });
    await seed(`catalog_items/${id('c')}`, { donorId: 'alice', status: 'available' });
    await seed(`conversations/${id('chat')}`, { itemId: id('a'), itemPickupAddress: '12 Lê Duẩn', lastMessage: 'Xin đồ' });
    paths.push(`catalog_items/${id('a')}/private/pickup`);

    const dryRun = await migrateP2pPickup(db);
    assert.equal(dryRun.applied, false);
    assert.ok(dryRun.itemsWithPublicFields >= 2 && dryRun.conversationsToClean >= 1);
    assert.equal((await read(`catalog_items/${id('a')}`)).pickupAddress, '12 Lê Duẩn', 'chạy thử không được ghi');
    await assert.rejects(migrateP2pPickup(db, { apply: true }), /backup is required/);

    let backup = null;
    const applied = await migrateP2pPickup(db, { apply: true, backup: data => { backup = data; } });
    assert.equal(applied.applied, true);

    assert.deepEqual(await read(`catalog_items/${id('a')}/private/pickup`), { pickupAddress: '12 Lê Duẩn' });
    const itemA = await read(`catalog_items/${id('a')}`);
    assert.equal(Object.hasOwn(itemA, 'pickupAddress') || Object.hasOwn(itemA, 'pickupTime'), false);
    assert.equal(itemA.status, 'reserved', 'không đụng các field khác');
    assert.deepEqual(await read(`catalog_items/${id('b')}/private/pickup`), { pickupAddress: 'Địa chỉ người đăng vừa sửa' });
    assert.equal(Object.hasOwn(await read(`catalog_items/${id('b')}`), 'pickupAddress'), false);
    const chat = await read(`conversations/${id('chat')}`);
    assert.equal(Object.hasOwn(chat, 'itemPickupAddress'), false);
    assert.equal(chat.lastMessage, 'Xin đồ');

    // Bản sao lưu giữ đủ giá trị gốc để khôi phục.
    const backedUpA = backup.items.find(entry => entry.itemId === id('a'));
    assert.equal(backedUpA.pickupAddress, '12 Lê Duẩn');
    assert.equal(backedUpA.pickupTime.toDate().toISOString(), pickupTime.toISOString());
    assert.ok(backup.conversations.some(entry => entry.id === id('chat') && entry.itemPickupAddress === '12 Lê Duẩn'));

    const rerun = await migrateP2pPickup(db);
    assert.deepEqual(rerun, { itemsWithPublicFields: 0, privateDocsToCreate: 0, conversationsToClean: 0, applied: false });
  } finally {
    const cleanup = await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
    assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Emulator cleanup must succeed');
  }
});
