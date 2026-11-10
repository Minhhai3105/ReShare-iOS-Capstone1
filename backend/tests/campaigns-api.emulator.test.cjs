const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createCampaignsApi } = require('../campaigns-api.cjs');
const { createStockIntakeApi } = require('../stock-intake-api.cjs');

async function removeFixtureDocs(db, paths) {
  const results = await Promise.allSettled(paths.map(path => db.doc(path).delete()));
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected' ? [`${paths[index]}: ${result.reason?.message || result.reason}`] : []);
  assert.deepEqual(failures, []);
}

const SA = { authorization: 'Bearer campaign-sa' };
const WA = { authorization: 'Bearer campaign-wa' };
const NOW = new Date('2026-11-10T03:00:00Z');
const body = {
  title: 'Áo ấm mùa lũ', summary: 'Áo khoác, chăn cho bà con vùng trũng', organizer: 'UBND xã Hòa Bắc',
  category: 'clothing', unitId: 'piece', targetQuantity: 10, endDate: '2026-12-20',
  hubIds: ['camp-hub-a'], guidelines: ['Đồ đã giặt sạch'], urgent: true,
};

test('Chiến dịch: System Admin tạo, sửa có kiểm tra phiên bản, mở, đóng và mở lại', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'campaigns-api-emulator-test');
  const db = getFirestore(app);
  const paths = [
    'staff_assignments/campaign-sa', 'staff_assignments/campaign-wa',
    'hubs/camp-hub-a', 'hubs/camp-hub-off', 'donations/camp-don-1', 'donations/camp-don-other',
  ];
  try {
    await db.doc('staff_assignments/campaign-sa').set({ active: true, role: 'system_admin', warehouseIds: [] });
    await db.doc('staff_assignments/campaign-wa').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] });
    await db.doc('hubs/camp-hub-a').set({ name: 'Điểm Hải Châu', status: 'active' });
    await db.doc('hubs/camp-hub-off').set({ name: 'Điểm đã đóng', status: 'inactive' });
    const api = createCampaignsApi({
      db, verifyToken: async token => ({ uid: token }),
      serverTimestamp: () => FieldValue.serverTimestamp(), clock: () => NOW,
    });

    await assert.rejects(api.handle('POST', '/v1/admin/campaigns', WA, body), { status: 403 });
    await assert.rejects(api.handle('POST', '/v1/admin/campaigns', SA, { ...body, hubIds: ['camp-hub-off'] }), { status: 409 });
    await assert.rejects(api.handle('POST', '/v1/admin/campaigns', SA, { ...body, endDate: '2026-11-01' }), { status: 400 });
    await assert.rejects(api.handle('POST', '/v1/admin/campaigns', SA, { ...body, targetQuantity: 1.5 }), { status: 400 },
      'đơn vị chiếc không nhận số lẻ');

    const created = await api.handle('POST', '/v1/admin/campaigns', SA, body);
    assert.equal(created.status, 201);
    const campaign = created.body.campaign;
    paths.push(`campaigns/${campaign.id}`);
    assert.equal(campaign.status, 'draft');
    assert.equal(campaign.version, 1);
    assert.equal(campaign.receivedQuantity, 0);
    assert.equal(campaign.receivedDonationCount, 0);
    assert.deepEqual(campaign.hubs, [{ id: 'camp-hub-a', name: 'Điểm Hải Châu' }]);
    assert.equal(campaign.endDateLocal, '2026-12-20');
    assert.equal(campaign.urgent, true);

    const listed = await api.handle('GET', '/v1/admin/campaigns', SA);
    assert.ok(listed.body.campaigns.some(item => item.id === campaign.id));
    const options = await api.handle('GET', '/v1/admin/campaigns/options', SA);
    assert.ok(options.body.hubs.some(hub => hub.id === 'camp-hub-a'));
    assert.ok(!options.body.hubs.some(hub => hub.id === 'camp-hub-off'), 'Hub ngừng hoạt động không được chọn');

    const updatePath = `/v1/admin/campaigns/${campaign.id}/update`;
    const statusPath = `/v1/admin/campaigns/${campaign.id}/status`;
    await assert.rejects(api.handle('POST', updatePath, SA, { title: 'Khác', expectedVersion: 5 }), { status: 409 });
    await assert.rejects(api.handle('POST', updatePath, SA, { title: 'Khác' }), { status: 400 });
    await assert.rejects(api.handle('POST', updatePath, WA, { title: 'Khác', expectedVersion: 1 }), { status: 403 });

    // Hai System Admin cùng sửa từ phiên bản 1: chỉ một người thành công, người sau nhận 409.
    const racing = await Promise.allSettled([
      api.handle('POST', updatePath, SA, { title: 'Áo ấm A', expectedVersion: 1 }),
      api.handle('POST', updatePath, SA, { title: 'Áo ấm B', expectedVersion: 1 }),
    ]);
    assert.deepEqual(racing.map(result => result.status).sort(), ['fulfilled', 'rejected']);
    assert.equal(racing.find(result => result.status === 'rejected').reason.status, 409);

    await assert.rejects(api.handle('POST', statusPath, SA, { status: 'closed', expectedVersion: 2 }), { status: 409 },
      'nháp không được đóng thẳng');
    await assert.rejects(api.handle('POST', statusPath, SA, { status: 'draft', expectedVersion: 2 }), { status: 400 });
    const opened = await api.handle('POST', statusPath, SA, { status: 'active', expectedVersion: 2 });
    assert.equal(opened.body.campaign.status, 'active');
    assert.ok(opened.body.campaign.publishedAt);

    await assert.rejects(api.handle('POST', updatePath, SA, { category: 'books', expectedVersion: 3 }), { status: 409 },
      'đang mở thì không đổi danh mục');
    const retargeted = await api.handle('POST', updatePath, SA, { targetQuantity: 20, expectedVersion: 3 });
    assert.equal(retargeted.body.campaign.targetQuantity, 20);

    const closed = await api.handle('POST', statusPath, SA, { status: 'closed', expectedVersion: 4 });
    assert.equal(closed.body.campaign.status, 'closed');
    await assert.rejects(api.handle('POST', updatePath, SA, { title: 'Sửa sau khi đóng', expectedVersion: 5 }), { status: 409 });

    const later = createCampaignsApi({
      db, verifyToken: async token => ({ uid: token }), clock: () => new Date('2026-12-21T03:00:00Z'),
    });
    await assert.rejects(later.handle('POST', statusPath, SA, { status: 'active', expectedVersion: 5 }), { status: 409 },
      'quá ngày kết thúc thì không mở lại được');
    const reopened = await api.handle('POST', statusPath, SA, { status: 'active', expectedVersion: 5 });
    assert.equal(reopened.body.campaign.status, 'active');

    await db.doc('donations/camp-don-1').set({ title: 'Áo khoác', status: 'pending', campaignId: campaign.id, createdAt: NOW });
    await db.doc('donations/camp-don-other').set({ title: 'Sách', status: 'pending', campaignId: 'other', createdAt: NOW });
    const detail = await api.handle('GET', `/v1/admin/campaigns/${campaign.id}`, SA);
    assert.deepEqual(detail.body.donations.map(donation => donation.id), ['camp-don-1']);
    assert.equal(detail.body.donationsTruncated, false);
    await assert.rejects(api.handle('GET', '/v1/admin/campaigns/missing-campaign', SA), { status: 404 });
  } finally {
    try { await removeFixtureDocs(db, paths); } finally { await deleteApp(app); }
  }
});

test('Chiến dịch: tiến độ chỉ cộng khi nhập kho, đúng một lần, và không cộng hàng khác đơn vị', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'campaign-progress-emulator-test');
  const db = getFirestore(app);
  const campaignId = 'camp-progress-test';
  const donations = ['camp-prog-piece', 'camp-prog-kg'];
  const paths = [
    'staff_assignments/prog-worker-a', 'staff_assignments/prog-worker-b', `campaigns/${campaignId}`,
    ...donations.flatMap(id => [
      `donations/${id}`, `receipts/rcp_${id}`, `stock_entries/ste_rcp_${id}`,
      `inventory/inv_rcp_${id}`, `inventory_movements/mov_in_rcp_${id}`,
    ]),
    'warehouse_inventory_updates/wh_kho-prog',
  ];
  try {
    await db.doc('staff_assignments/prog-worker-a').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-prog'] });
    await db.doc('staff_assignments/prog-worker-b').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-prog'] });
    await db.doc(`campaigns/${campaignId}`).set({
      title: 'Áo ấm', category: 'clothing', unitId: 'piece', targetQuantity: 10, status: 'active',
      receivedQuantity: 0, receivedDonationCount: 0, version: 3,
    });
    const units = { 'camp-prog-piece': ['piece', 3], 'camp-prog-kg': ['kg', 2.5] };
    for (const id of donations) {
      await db.doc(`donations/${id}`).set({
        title: 'Áo khoác', category: 'clothing', quantity: 5, status: 'received', campaignId,
        warehouseId: 'kho-prog', actualReceiptId: `rcp_${id}`,
      });
      await db.doc(`receipts/rcp_${id}`).set({
        id: `rcp_${id}`, donationId: id, warehouseId: 'kho-prog',
        unitId: units[id][0], quantity: units[id][1], conditionId: 'good',
      });
    }
    const api = createStockIntakeApi({
      db, serverTimestamp: () => FieldValue.serverTimestamp(), verifyToken: async token => ({ uid: token }),
    });
    const stockIn = (id, worker) => api.handle('POST', `/v1/admin/donations/${id}/stock-in`,
      { authorization: `Bearer ${worker}` },
      { receiptId: `rcp_${id}`, location: 'Kệ A1', note: '', idempotencyKey: `stk_rcp_${id}` });

    const responses = await Promise.all([stockIn('camp-prog-piece', 'prog-worker-a'), stockIn('camp-prog-piece', 'prog-worker-b')]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
    let campaign = (await db.doc(`campaigns/${campaignId}`).get()).data();
    assert.equal(campaign.receivedQuantity, 3, 'tính số thực nhận 3, không phải số donor khai báo 5');
    assert.equal(campaign.receivedDonationCount, 1);
    assert.equal(campaign.version, 3, 'nhập kho không làm form sửa chiến dịch báo xung đột');

    await stockIn('camp-prog-piece', 'prog-worker-a');
    await stockIn('camp-prog-kg', 'prog-worker-a');
    campaign = (await db.doc(`campaigns/${campaignId}`).get()).data();
    assert.equal(campaign.receivedQuantity, 3, 'hàng tính bằng kg không cộng vào mục tiêu tính bằng chiếc');
    assert.equal(campaign.receivedDonationCount, 2);
  } finally {
    try { await removeFixtureDocs(db, paths); } finally { await deleteApp(app); }
  }
});
