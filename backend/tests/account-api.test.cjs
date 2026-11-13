const test = require('node:test');
const assert = require('node:assert/strict');
const { createAccountApi } = require('../account-api.cjs');

const NOW = 1_800_000_000_000;
function fakeDb(assignments = {}) {
  const touched = [];
  return {
    touched,
    collection(name) {
      touched.push(name);
      return { doc: id => ({ get: async () => ({ exists: Boolean(assignments[id]), data: () => assignments[id] }) }) };
    },
  };
}
const fakeAuth = { deleteUser: async () => { throw new Error('không được gọi tới đây'); } };
const tokens = {
  fresh: { uid: 'donor-1', auth_time: NOW / 1000 - 60 },
  stale: { uid: 'donor-1', auth_time: NOW / 1000 - 6 * 60 },
  staff: { uid: 'staff-1', auth_time: NOW / 1000 - 10 },
};
const verifyToken = async token => { if (!tokens[token]) throw new Error('bad token'); return tokens[token]; };

test('xoá tài khoản chỉ nhận POST /v1/account/delete với phiên hợp lệ', async () => {
  const api = createAccountApi({ db: fakeDb(), auth: fakeAuth, verifyToken, clock: () => NOW });
  await assert.rejects(api.handle('GET', '/v1/account/delete', {}), { status: 404 });
  await assert.rejects(api.handle('POST', '/v1/account/delete', {}), { status: 401 });
  await assert.rejects(api.handle('POST', '/v1/account/delete', { authorization: 'Bearer nope' }), { status: 401 });
});

test('phải đăng nhập lại trong 5 phút gần nhất mới được xoá', async () => {
  const db = fakeDb();
  const api = createAccountApi({ db, auth: fakeAuth, verifyToken, clock: () => NOW });
  await assert.rejects(api.handle('POST', '/v1/account/delete', { authorization: 'Bearer stale' }),
    { status: 401, code: 'REAUTH_REQUIRED' });
  assert.deepEqual(db.touched, [], 'chưa đọc hay ghi dữ liệu nào khi phiên quá cũ');
});

test('tài khoản nhân sự đang hoạt động không tự xoá được', async () => {
  const db = fakeDb({ 'staff-1': { active: true, role: 'warehouse_admin' } });
  const api = createAccountApi({ db, auth: fakeAuth, verifyToken, clock: () => NOW });
  await assert.rejects(api.handle('POST', '/v1/account/delete', { authorization: 'Bearer staff' }),
    { status: 409, code: 'STAFF_ACCOUNT' });
  assert.deepEqual(db.touched, ['staff_assignments'], 'dừng ngay sau khi kiểm phân quyền');
});

test('nhân sự thấy "Người dùng đã xoá tài khoản" thay cho tên và email cũ', () => {
  const { donationSender } = require('../donation-review-api.cjs');
  assert.deepEqual(donationSender({ donorId: 'u1', donorAccountDeleted: true, donorName: 'Tên cũ' },
    { displayName: 'Tên cũ', email: 'cu@reshare.test' }), { name: 'Người dùng đã xoá tài khoản', email: null });
  assert.deepEqual(donationSender({ donorId: 'u1' }, { displayName: 'An', email: 'an@reshare.test' }),
    { name: 'An', email: 'an@reshare.test' });
});
