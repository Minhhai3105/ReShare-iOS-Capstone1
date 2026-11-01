const test = require('node:test');
const assert = require('node:assert/strict');
const { staffEmails } = require('../staff-emails.cjs');

test('Đổi UID sang email theo một lần gọi Auth, bỏ trùng và bỏ giá trị rỗng', async () => {
  const calls = [];
  const auth = { async getUsers(ids) { calls.push(ids); return { users: [{ uid: 'u1', email: 'a@reshare.vn' }, { uid: 'u2' }] }; } };
  const emails = await staffEmails(auth, ['u1', 'u1', 'u2', null, '']);
  assert.deepEqual(calls, [[{ uid: 'u1' }, { uid: 'u2' }]]);
  assert.equal(emails.get('u1'), 'a@reshare.vn');
  assert.equal(emails.has('u2'), false, 'tài khoản không có email thì giữ UID');
});

test('Auth lỗi hoặc không có Auth thì trả rỗng, không làm hỏng màn chi tiết', async () => {
  assert.equal((await staffEmails({ async getUsers() { throw new Error('quota'); } }, ['u1'])).size, 0);
  assert.equal((await staffEmails(undefined, ['u1'])).size, 0);
});
