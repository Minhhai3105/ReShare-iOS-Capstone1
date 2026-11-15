const test = require('node:test');
const assert = require('node:assert/strict');
const { createHubsApi, validateHubFields, nameKey } = require('../hubs-api.cjs');

const valid = { name: ' Điểm  Hải Châu ', address: '12 Lê Duẩn, Hải Châu', openHours: '8:00–17:00, thứ Hai–thứ Bảy', latitude: 16.07, longitude: 108.22 };

test('Hub: kiểm field khi tạo/sửa — đủ field bắt buộc, chuẩn hoá khoảng trắng, toạ độ trong khoảng', () => {
  assert.deepEqual(validateHubFields(valid, { required: true }), {
    name: 'Điểm Hải Châu', address: '12 Lê Duẩn, Hải Châu', openHours: '8:00–17:00, thứ Hai–thứ Bảy', latitude: 16.07, longitude: 108.22,
  });
  assert.throws(() => validateHubFields({ ...valid, latitude: 91 }, { required: true }), { status: 400 });
  assert.throws(() => validateHubFields({ ...valid, longitude: '108' }, { required: true }), { status: 400 });
  assert.throws(() => validateHubFields({ ...valid, name: '   ' }, { required: true }), { status: 400 });
  assert.throws(() => validateHubFields({ ...valid, address: 'x'.repeat(201) }, { required: true }), { status: 400 });
  assert.throws(() => validateHubFields({ ...valid, isDemo: 'false' }, { required: true }), { status: 400 });
  const { openHours, ...missing } = valid;
  assert.throws(() => validateHubFields(missing, { required: true }), { status: 400, message: 'openHours is required' });
  assert.throws(() => validateHubFields({ ...valid, status: 'inactive' }, { required: true }), { status: 400 },
    'trạng thái chỉ đổi qua /status');
  assert.deepEqual(validateHubFields({ isDemo: false, expectedVersion: 2 }, { required: false }), { isDemo: false });
});

test('Hub: so trùng tên không phân biệt hoa thường, khoảng trắng và dạng Unicode', () => {
  assert.equal(nameKey('  Điểm   HẢI Châu '), nameKey('điểm hải châu'));
  assert.equal(nameKey('Hải Châu'.normalize('NFD')), nameKey('Hải Châu'));
  assert.notEqual(nameKey('Hải Châu 2'), nameKey('Hải Châu'));
});

test('Hub API: sai đường dẫn trả 404, thiếu phiên đăng nhập trả 401 trước khi đọc dữ liệu', async () => {
  const db = { collection() { throw new Error('không được đọc Firestore'); } };
  const api = createHubsApi({ db, verifyToken: async () => ({ uid: 'x' }) });
  await assert.rejects(api.handle('GET', '/v1/admin/hubs/abc', {}, null), { status: 404 });
  await assert.rejects(api.handle('POST', '/v1/admin/hubs/abc/delete', {}, null), { status: 404 });
  await assert.rejects(api.handle('GET', '/v1/admin/hubs', {}, null), { status: 401 });
  await assert.rejects(api.handle('POST', '/v1/admin/hubs', { authorization: 'Basic abc' }, valid), { status: 401 });
});
