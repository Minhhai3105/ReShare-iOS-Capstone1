const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createP2pListingsApi, districtKey, normalizeStatus, restoreBlocker, validateRemoveBody, validateRestoreBody,
} = require('../p2p-listings-api.cjs');

test('Kho đồ 0đ: chuẩn hoá trạng thái, kể cả giá trị tiếng Việt của bài cũ', () => {
  assert.equal(normalizeStatus('available'), 'available');
  assert.equal(normalizeStatus('Sẵn sàng nhận đồ'), 'available');
  assert.equal(normalizeStatus('Sẵn sàng nhận đồ'.normalize('NFD')), 'available');
  assert.equal(normalizeStatus('đã có người hẹn'), 'reserved');
  assert.equal(normalizeStatus('Đã trao tặng'), 'completed');
  assert.equal(normalizeStatus('removed'), 'removed');
  assert.equal(normalizeStatus('lạ'), 'unknown');
  assert.equal(normalizeStatus(undefined), 'unknown');
});

test('Kho đồ 0đ: so quận không phân biệt hoa thường, khoảng trắng và dạng Unicode', () => {
  assert.equal(districtKey('  HẢI   Châu '), districtKey('hải châu'));
  assert.equal(districtKey('Hải Châu'.normalize('NFD')), districtKey('Hải Châu'));
  assert.notEqual(districtKey('Sơn Trà'), districtKey('Hải Châu'));
});

test('Kho đồ 0đ: kiểm thân yêu cầu gỡ / khôi phục', () => {
  assert.deepEqual(validateRemoveBody({ expectedStatus: 'available', reason: '  rao  bán ' }), { expectedStatus: 'available', reason: 'rao bán' });
  assert.deepEqual(validateRemoveBody({ expectedStatus: 'reserved' }), { expectedStatus: 'reserved', reason: '' });
  assert.throws(() => validateRemoveBody({ expectedStatus: 'removed' }), { status: 400 }, 'bài đã gỡ không gỡ lại');
  assert.throws(() => validateRemoveBody({ expectedStatus: 'available', reason: 'x'.repeat(301) }), { status: 400 });
  assert.throws(() => validateRemoveBody({ expectedStatus: 'available', status: 'removed' }), { status: 400 }, 'không nhận field lạ');
  assert.throws(() => validateRemoveBody({ expectedStatus: 'available', reason: 3 }), { status: 400 });
  assert.throws(() => validateRemoveBody(null), { status: 400 });
  validateRestoreBody({ expectedStatus: 'removed' });
  assert.throws(() => validateRestoreBody({ expectedStatus: 'available' }), { status: 400 });
  assert.throws(() => validateRestoreBody({ expectedStatus: 'removed', status: 'available' }), { status: 400 });
});

test('Kho đồ 0đ: chỉ khôi phục bài đang mở trước khi gỡ, chưa vướng hẹn và người đăng chưa bị khoá', () => {
  const owner = { exists: true, suspended: false };
  const SA = 'system_admin';
  const removed = { status: 'removed', moderation: { source: 'admin_p2p', previousStatus: 'available' } };
  assert.equal(restoreBlocker(removed, owner, SA), null);
  assert.equal(restoreBlocker(removed, owner, 'warehouse_admin'), null, 'bài gỡ từ trang Kho đồ 0đ: Warehouse Admin khôi phục được');
  const viaReport = { status: 'removed', moderation: { reportId: 'r1' } };
  assert.equal(restoreBlocker(viaReport, owner, SA), null, 'gỡ từ báo cáo: không ghi trạng thái trước');
  assert.equal(restoreBlocker(viaReport, owner, 'warehouse_admin'), 'SYSTEM_ADMIN_ONLY', 'quyết định của System Admin');
  assert.equal(restoreBlocker({ ...removed, status: 'available' }, owner, SA), 'NOT_REMOVED');
  assert.equal(restoreBlocker(removed, { exists: true, suspended: true }, SA), 'OWNER_SUSPENDED');
  assert.equal(restoreBlocker(removed, { exists: false }, SA), 'OWNER_MISSING');
  assert.equal(restoreBlocker({ status: 'removed', moderation: { source: 'admin_p2p', previousStatus: 'reserved' } }, owner, SA), 'NOT_OPEN_BEFORE');
  assert.equal(restoreBlocker({ ...removed, reservedChatId: 'c1' }, owner, SA), 'HAS_RESERVATION');
  assert.equal(restoreBlocker({ ...removed, donorHandoverConfirmed: true }, owner, SA), 'HAS_RESERVATION');
});

test('Kho đồ 0đ API: sai đường dẫn/phương thức trả 404, thiếu phiên đăng nhập trả 401 trước khi đọc dữ liệu', async () => {
  const db = { collection() { throw new Error('không được đọc Firestore'); } };
  const api = createP2pListingsApi({ db, verifyToken: async () => ({ uid: 'x' }) });
  await assert.rejects(api.handle('GET', '/v1/admin/p2p', {}, null), { status: 404 });
  await assert.rejects(api.handle('POST', '/v1/admin/p2p/listings', {}, null), { status: 404 });
  await assert.rejects(api.handle('GET', '/v1/admin/p2p/listings/abc/remove', {}, null), { status: 404 }, 'gỡ chỉ nhận POST');
  await assert.rejects(api.handle('POST', '/v1/admin/p2p/listings/abc/delete', {}, {}), { status: 404 });
  await assert.rejects(api.handle('POST', '/v1/admin/p2p/listings/abc', {}, {}), { status: 404 });
  await assert.rejects(api.handle('GET', '/v1/admin/p2p/listings', {}, null), { status: 401 });
  await assert.rejects(api.handle('POST', '/v1/admin/p2p/listings/abc/remove', { authorization: 'Basic x' }, { expectedStatus: 'available' }), { status: 401 });
});
