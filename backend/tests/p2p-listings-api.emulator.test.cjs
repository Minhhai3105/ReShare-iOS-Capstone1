const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createP2pListingsApi } = require('../p2p-listings-api.cjs');

async function removeFixtureDocs(db, paths) {
  const results = await Promise.allSettled(paths.map(path => db.doc(path).delete()));
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected' ? [`${paths[index]}: ${result.reason?.message || result.reason}`] : []);
  assert.deepEqual(failures, []);
}

const SA = { authorization: 'Bearer p2ptest-sa' };
const WA_HC = { authorization: 'Bearer p2ptest-wa-hc' };
const WA_LC = { authorization: 'Bearer p2ptest-wa-lc' };
const WA_NONE = { authorization: 'Bearer p2ptest-wa-none' };
const base = '/v1/admin/p2p/listings';

test('Kho đồ 0đ: phạm vi theo quận, gỡ bài tự đóng báo cáo, khôi phục có điều kiện, ghi nhật ký', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'p2p-listings-emulator-test');
  const db = getFirestore(app);
  const paths = [
    'staff_assignments/p2ptest-sa', 'staff_assignments/p2ptest-wa-hc', 'staff_assignments/p2ptest-wa-lc',
    'staff_assignments/p2ptest-wa-none', 'warehouses/p2ptest-kho-hc', 'warehouses/p2ptest-kho-lc',
    'warehouses/p2ptest-kho-none', 'users/p2ptest-donor', 'users/p2ptest-banned',
    'catalog_items/p2ptest-open', 'catalog_items/p2ptest-legacy', 'catalog_items/p2ptest-reserved',
    'catalog_items/p2ptest-camle', 'catalog_items/p2ptest-banned', 'catalog_items/p2ptest-viareport',
    'reports/p2ptest-r1', 'reports/p2ptest-r2', 'reports/p2ptest-r3',
  ];
  const auditIds = [];
  try {
    await Promise.all([
      db.doc('staff_assignments/p2ptest-sa').set({ active: true, role: 'system_admin', warehouseIds: [] }),
      db.doc('staff_assignments/p2ptest-wa-hc').set({ active: true, role: 'warehouse_admin', warehouseIds: ['p2ptest-kho-hc'] }),
      db.doc('staff_assignments/p2ptest-wa-lc').set({ active: true, role: 'warehouse_admin', warehouseIds: ['p2ptest-kho-lc'] }),
      db.doc('staff_assignments/p2ptest-wa-none').set({ active: true, role: 'warehouse_admin', warehouseIds: ['p2ptest-kho-none'] }),
      db.doc('warehouses/p2ptest-kho-hc').set({ name: 'Kho Hải Châu', status: 'active', districts: ['Hải Châu'] }),
      db.doc('warehouses/p2ptest-kho-lc').set({ name: 'Kho Liên Chiểu', status: 'active', districts: ['Liên Chiểu'] }),
      db.doc('warehouses/p2ptest-kho-none').set({ name: 'Kho chưa gán quận', status: 'active' }),
      db.doc('users/p2ptest-donor').set({ displayName: 'Người tặng' }),
      db.doc('users/p2ptest-banned').set({ displayName: 'Người bị khoá', suspended: true }),
    ]);
    const item = (district, status, extra = {}) => ({
      donorId: 'p2ptest-donor', title: `Áo ${district}`, district, status, category: 'clothing', condition: 'Tốt',
      donorNote: 'Còn mới', images: ['https://res.cloudinary.com/demo/a.jpg', 'http://khong-an-toan/b.jpg'],
      createdAt: new Date('2026-11-10T03:00:00Z'), ...extra,
    });
    await Promise.all([
      db.doc('catalog_items/p2ptest-open').set(item('Hải Châu', 'available')),
      db.doc('catalog_items/p2ptest-legacy').set(item('Hải Châu', 'Sẵn sàng nhận đồ', { createdAt: new Date('2026-11-01T00:00:00Z') })),
      db.doc('catalog_items/p2ptest-reserved').set(item('Hải Châu', 'reserved', { reservedChatId: 'chat-1', reservedRequesterId: 'u2' })),
      db.doc('catalog_items/p2ptest-camle').set(item('Cẩm Lệ', 'completed')),
      db.doc('catalog_items/p2ptest-banned').set(item('Hải Châu', 'available', { donorId: 'p2ptest-banned' })),
      // Bài System Admin đã gỡ từ trang Báo cáo vi phạm (moderation chỉ có reportId).
      db.doc('catalog_items/p2ptest-viareport').set(item('Hải Châu', 'removed', { moderation: { reportId: 'r-x', moderatedBy: 'p2ptest-sa' } })),
      db.doc('reports/p2ptest-r1').set({ targetType: 'listing', targetId: 'p2ptest-open', status: 'open', reason: 'spam', reporterId: 'p2ptest-donor' }),
      // Báo cáo đang khoá tài khoản dở: gỡ bài không được đóng hộ.
      db.doc('reports/p2ptest-r2').set({ targetType: 'listing', targetId: 'p2ptest-open', status: 'open', reason: 'scam', pendingAction: 'suspend_user' }),
      db.doc('reports/p2ptest-r3').set({ targetType: 'listing', targetId: 'p2ptest-open', status: 'resolved', reason: 'other', resolution: 'dismiss' }),
    ]);
    const api = createP2pListingsApi({
      db, verifyToken: async token => ({ uid: token, email: `${token}@reshare.test` }),
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });
    const ours = listings => listings.filter(listing => listing.id.startsWith('p2ptest-'));

    // System Admin thấy mọi quận; số báo cáo tính đúng.
    const all = await api.handle('GET', base, SA, null);
    assert.equal(all.body.scope.all, true);
    const allIds = ours(all.body.listings).map(listing => listing.id).sort();
    assert.deepEqual(allIds, ['p2ptest-banned', 'p2ptest-camle', 'p2ptest-legacy', 'p2ptest-open', 'p2ptest-reserved', 'p2ptest-viareport']);
    const open = all.body.listings.find(listing => listing.id === 'p2ptest-open');
    assert.deepEqual(open.reports, { open: 2, total: 3 });
    assert.equal(open.imageUrl, 'https://res.cloudinary.com/demo/a.jpg');
    assert.equal(open.imageCount, 1, 'bỏ ảnh không phải https');
    assert.equal(all.body.listings.find(listing => listing.id === 'p2ptest-legacy').status, 'available');

    // Warehouse Admin Hải Châu chỉ thấy bài Hải Châu; kho chưa gán quận thì không thấy gì.
    const hc = await api.handle('GET', base, WA_HC, null);
    assert.deepEqual(hc.body.scope, { role: 'warehouse_admin', all: false, districts: ['Hải Châu'] });
    assert.deepEqual(ours(hc.body.listings).map(listing => listing.id).sort(), ['p2ptest-banned', 'p2ptest-legacy', 'p2ptest-open', 'p2ptest-reserved', 'p2ptest-viareport']);
    assert.equal(hc.body.listings.find(listing => listing.id === 'p2ptest-viareport').restoreBlocker, 'SYSTEM_ADMIN_ONLY');
    assert.equal(all.body.listings.find(listing => listing.id === 'p2ptest-viareport').restoreBlocker, null);
    const none = await api.handle('GET', base, WA_NONE, null);
    assert.deepEqual(none.body.listings, []);
    assert.deepEqual(none.body.scope.districts, []);

    // Kho khác quận không xem, không gỡ được.
    await assert.rejects(api.handle('GET', `${base}/p2ptest-open`, WA_LC, null), { status: 403, code: 'OUT_OF_SCOPE' });
    await assert.rejects(api.handle('POST', `${base}/p2ptest-open/remove`, WA_LC, { expectedStatus: 'available' }), { status: 403, code: 'OUT_OF_SCOPE' });
    await assert.rejects(api.handle('GET', `${base}/p2ptest-camle`, WA_HC, null), { status: 403 }, 'Cẩm Lệ chưa có kho: chỉ System Admin');

    // Trạng thái đã đổi so với lúc admin xem thì không gỡ.
    await assert.rejects(api.handle('POST', `${base}/p2ptest-open/remove`, WA_HC, { expectedStatus: 'reserved' }),
      { status: 409, message: 'Listing changed; reload first' });

    // Gỡ: ghi trạng thái trước khi gỡ, đóng báo cáo đang mở (trừ báo cáo khoá dở), ghi nhật ký.
    const removed = await api.handle('POST', `${base}/p2ptest-open/remove`, WA_HC, { expectedStatus: 'available', reason: 'Rao bán' });
    assert.deepEqual(removed.body, { id: 'p2ptest-open', status: 'removed', resolvedReports: 1 });
    const removedDoc = (await db.doc('catalog_items/p2ptest-open').get()).data();
    assert.equal(removedDoc.status, 'removed');
    assert.equal(removedDoc.moderation.previousStatus, 'available');
    assert.equal(removedDoc.moderation.reason, 'Rao bán');
    assert.equal(removedDoc.moderation.moderatedBy, 'p2ptest-wa-hc');
    const r1 = (await db.doc('reports/p2ptest-r1').get()).data();
    assert.equal(r1.status, 'resolved');
    assert.equal(r1.resolution, 'remove_listing');
    assert.equal(r1.resolutionNote, 'Gỡ từ trang Kho đồ 0đ: Rao bán');
    assert.equal((await db.doc('reports/p2ptest-r2').get()).data().status, 'open');
    assert.equal((await db.doc('reports/p2ptest-r3').get()).data().resolution, 'dismiss');
    await assert.rejects(api.handle('POST', `${base}/p2ptest-open/remove`, SA, { expectedStatus: 'available' }),
      { status: 409, message: 'Listing already removed' });

    const detail = await api.handle('GET', `${base}/p2ptest-open`, WA_HC, null);
    assert.equal(detail.body.listing.donorNote, 'Còn mới');
    assert.equal(detail.body.listing.restoreBlocker, null);
    assert.equal(detail.body.reports.length, 3);
    assert.equal(detail.body.history.length, 1);
    assert.equal(detail.body.history[0].action, 'remove');
    assert.equal(detail.body.history[0].actorEmail, 'p2ptest-wa-hc@reshare.test');
    assert.equal(detail.body.history[0].resolvedReports, 1);

    // Khôi phục bài gỡ nhầm.
    const restored = await api.handle('POST', `${base}/p2ptest-open/restore`, WA_HC, { expectedStatus: 'removed' });
    assert.deepEqual(restored.body, { id: 'p2ptest-open', status: 'available' });
    assert.equal((await db.doc('catalog_items/p2ptest-open').get()).data().status, 'available');
    await assert.rejects(api.handle('POST', `${base}/p2ptest-open/restore`, WA_HC, { expectedStatus: 'removed' }), { status: 409 });
    const audit = await db.collection('p2p_listing_audit').where('listingId', '==', 'p2ptest-open').get();
    auditIds.push(...audit.docs.map(doc => doc.id));
    assert.deepEqual(audit.docs.map(doc => doc.data().action).sort(), ['remove', 'restore']);
    assert.ok(audit.docs.every(doc => doc.data().actorRole === 'warehouse_admin'));

    // Bài cũ trạng thái tiếng Việt gỡ được như bài đang mở.
    await api.handle('POST', `${base}/p2ptest-legacy/remove`, SA, { expectedStatus: 'available' });
    assert.equal((await db.doc('catalog_items/p2ptest-legacy').get()).data().moderation.previousStatus, 'available');

    // Bài đang có người hẹn: gỡ được nhưng không khôi phục (tránh dựng lại cuộc hẹn đã bỏ dở).
    await api.handle('POST', `${base}/p2ptest-reserved/remove`, SA, { expectedStatus: 'reserved' });
    await assert.rejects(api.handle('POST', `${base}/p2ptest-reserved/restore`, SA, { expectedStatus: 'removed' }),
      error => error.status === 409 && error.code === 'RESTORE_BLOCKED' && error.details.reason === 'NOT_OPEN_BEFORE');

    // Người đăng đã bị khoá: không khôi phục.
    await api.handle('POST', `${base}/p2ptest-banned/remove`, SA, { expectedStatus: 'available' });
    await assert.rejects(api.handle('POST', `${base}/p2ptest-banned/restore`, SA, { expectedStatus: 'removed' }),
      error => error.code === 'RESTORE_BLOCKED' && error.details.reason === 'OWNER_SUSPENDED');
    await db.doc('users/p2ptest-banned').update({ suspended: false, unsuspendPending: true });
    await assert.rejects(api.handle('POST', `${base}/p2ptest-banned/restore`, SA, { expectedStatus: 'removed' }),
      error => error.code === 'RESTORE_BLOCKED' && error.details.reason === 'OWNER_SUSPENDED');

    // Bài System Admin gỡ qua báo cáo: Warehouse Admin không đảo lại được, System Admin thì được.
    await assert.rejects(api.handle('POST', `${base}/p2ptest-viareport/restore`, WA_HC, { expectedStatus: 'removed' }),
      error => error.code === 'RESTORE_BLOCKED' && error.details.reason === 'SYSTEM_ADMIN_ONLY');
    await api.handle('POST', `${base}/p2ptest-viareport/restore`, SA, { expectedStatus: 'removed' });
    assert.equal((await db.doc('catalog_items/p2ptest-viareport').get()).data().status, 'available');

    // Bị thu hồi quyền thì không gỡ được nữa.
    await db.doc('staff_assignments/p2ptest-wa-hc').update({ active: false });
    await assert.rejects(api.handle('POST', `${base}/p2ptest-open/remove`, WA_HC, { expectedStatus: 'available' }), { status: 403 });

  } finally {
    const more = await db.collection('p2p_listing_audit')
      .where('listingId', 'in', ['p2ptest-open', 'p2ptest-legacy', 'p2ptest-reserved', 'p2ptest-banned', 'p2ptest-camle', 'p2ptest-viareport']).get();
    auditIds.push(...more.docs.map(doc => doc.id));
    await removeFixtureDocs(db, [...paths, ...[...new Set(auditIds)].map(id => `p2p_listing_audit/${id}`)]);
    await deleteApp(app);
  }
});
