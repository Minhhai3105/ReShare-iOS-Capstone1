const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createHubsApi } = require('../hubs-api.cjs');

async function removeFixtureDocs(db, paths) {
  const results = await Promise.allSettled(paths.map(path => db.doc(path).delete()));
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected' ? [`${paths[index]}: ${result.reason?.message || result.reason}`] : []);
  assert.deepEqual(failures, []);
}

const SA = { authorization: 'Bearer hubtest-sa' };
const WA = { authorization: 'Bearer hubtest-wa' };
const newHub = {
  name: 'Điểm Thanh Khê', address: '45 Điện Biên Phủ, Thanh Khê', openHours: '8:00–17:00 hằng ngày',
  latitude: 16.0661, longitude: 108.1931,
};

test('Điểm tiếp nhận: System Admin tạo, sửa có kiểm phiên bản, đổi tên cập nhật chiến dịch, Warehouse Admin chỉ xem', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: 'demo-reshare' }, 'hubs-api-emulator-test');
  const db = getFirestore(app);
  const paths = [
    'staff_assignments/hubtest-sa', 'staff_assignments/hubtest-wa', 'hubs/hubtest-legacy',
    'campaigns/hubtest-open', 'campaigns/hubtest-draft', 'campaigns/hubtest-closed',
  ];
  try {
    await db.doc('staff_assignments/hubtest-sa').set({ active: true, role: 'system_admin', warehouseIds: [] });
    await db.doc('staff_assignments/hubtest-wa').set({ active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] });
    // Hub nạp bằng script cũ: không có version.
    await db.doc('hubs/hubtest-legacy').set({
      name: 'Hải Châu', address: 'Vị trí minh hoạ', openHours: 'Chưa hoạt động', latitude: 16.06, longitude: 108.22,
      isDemo: true, status: 'active',
    });
    const snapshot = [{ id: 'hubtest-legacy', name: 'Hải Châu' }];
    await db.doc('campaigns/hubtest-open').set({ title: 'Áo ấm', status: 'active', hubIds: ['hubtest-legacy'], hubs: snapshot, version: 4 });
    await db.doc('campaigns/hubtest-draft').set({ title: 'Sách cũ', status: 'draft', hubIds: ['hubtest-legacy'], hubs: snapshot, version: 1 });
    await db.doc('campaigns/hubtest-closed').set({ title: 'Đã xong', status: 'closed', hubIds: ['hubtest-legacy'], hubs: snapshot, version: 2 });
    const api = createHubsApi({ db, verifyToken: async token => ({ uid: token }), serverTimestamp: () => FieldValue.serverTimestamp() });

    // Warehouse Admin xem được, không ghi được.
    const listed = await api.handle('GET', '/v1/admin/hubs', WA, null);
    const legacy = listed.body.hubs.find(hub => hub.id === 'hubtest-legacy');
    assert.equal(legacy.version, 1);
    assert.deepEqual(legacy.openCampaigns, [{ id: 'hubtest-open', title: 'Áo ấm' }]);
    await assert.rejects(api.handle('POST', '/v1/admin/hubs', WA, newHub), { status: 403 });
    await assert.rejects(api.handle('POST', '/v1/admin/hubs/hubtest-legacy/status', WA, { status: 'inactive', expectedVersion: 1 }), { status: 403 });

    // Tạo: mặc định là điểm minh hoạ, đang hoạt động; trùng tên (khác hoa thường/khoảng trắng) bị từ chối.
    const created = await api.handle('POST', '/v1/admin/hubs', SA, newHub);
    assert.equal(created.status, 201);
    const hub = created.body.hub;
    paths.push(`hubs/${hub.id}`);
    assert.equal(hub.status, 'active');
    assert.equal(hub.isDemo, true);
    assert.equal(hub.version, 1);
    assert.equal((await db.doc(`hubs/${hub.id}`).get()).data().createdByUid, 'hubtest-sa');
    await assert.rejects(api.handle('POST', '/v1/admin/hubs', SA, { ...newHub, name: '  điểm   THANH khê ' }),
      { status: 409, message: 'Hub name already exists' });
    await assert.rejects(api.handle('POST', '/v1/admin/hubs', SA, { ...newHub, name: 'Khác', latitude: 200 }), { status: 400 });

    // Đổi tên Hub cũ: chiến dịch nháp/đang mở nhận tên mới, chiến dịch đã đóng giữ nguyên.
    await assert.rejects(api.handle('POST', '/v1/admin/hubs/hubtest-legacy/update', SA, { name: 'điểm thanh khê', expectedVersion: 1 }),
      { status: 409, message: 'Hub name already exists' });
    const renamed = await api.handle('POST', '/v1/admin/hubs/hubtest-legacy/update', SA, { name: 'Điểm Hải Châu', isDemo: false, expectedVersion: 1 });
    assert.equal(renamed.body.hub.name, 'Điểm Hải Châu');
    assert.equal(renamed.body.hub.isDemo, false);
    assert.equal(renamed.body.hub.version, 2);
    assert.deepEqual((await db.doc('campaigns/hubtest-open').get()).data().hubs, [{ id: 'hubtest-legacy', name: 'Điểm Hải Châu' }]);
    assert.deepEqual((await db.doc('campaigns/hubtest-draft').get()).data().hubs, [{ id: 'hubtest-legacy', name: 'Điểm Hải Châu' }]);
    assert.deepEqual((await db.doc('campaigns/hubtest-closed').get()).data().hubs, snapshot);
    assert.equal((await db.doc('campaigns/hubtest-open').get()).data().version, 4, 'không đổi version của chiến dịch');

    // Hai người sửa cùng lúc: người sau dùng version cũ nhận 409; sửa mà không đổi gì cũng 409.
    await assert.rejects(api.handle('POST', '/v1/admin/hubs/hubtest-legacy/update', SA, { openHours: '7:00–11:00', expectedVersion: 1 }),
      { status: 409, message: 'Hub changed; reload first' });
    await assert.rejects(api.handle('POST', '/v1/admin/hubs/hubtest-legacy/update', SA, { name: 'Điểm Hải Châu', expectedVersion: 2 }),
      { status: 409, message: 'Hub is unchanged' });

    // Không cho tạm ẩn khi chiến dịch đang mở dùng Hub; báo đúng chiến dịch.
    await assert.rejects(api.handle('POST', '/v1/admin/hubs/hubtest-legacy/status', SA, { status: 'inactive', expectedVersion: 2 }),
      error => error.status === 409 && error.code === 'HUB_IN_USE'
        && JSON.stringify(error.details) === JSON.stringify({ campaigns: [{ id: 'hubtest-open', title: 'Áo ấm' }] }));
    await db.doc('campaigns/hubtest-open').update({ status: 'closed' });
    const hidden = await api.handle('POST', '/v1/admin/hubs/hubtest-legacy/status', SA, { status: 'inactive', expectedVersion: 2 });
    assert.equal(hidden.body.hub.status, 'inactive');
    assert.equal(hidden.body.hub.version, 3);
    await assert.rejects(api.handle('POST', '/v1/admin/hubs/hubtest-legacy/status', SA, { status: 'inactive', expectedVersion: 3 }),
      { status: 409, message: 'Invalid status transition' });

    // Danh sách: Hub đang hoạt động đứng trước Hub đang ẩn.
    const after = (await api.handle('GET', '/v1/admin/hubs', SA, null)).body.hubs.filter(item => item.id.startsWith('hubtest-') || item.id === hub.id);
    assert.deepEqual(after.map(item => item.status), ['active', 'inactive']);

    const reopened = await api.handle('POST', '/v1/admin/hubs/hubtest-legacy/status', SA, { status: 'active', expectedVersion: 3 });
    assert.equal(reopened.body.hub.status, 'active');
  } finally {
    await removeFixtureDocs(db, paths);
    await deleteApp(app);
  }
});
