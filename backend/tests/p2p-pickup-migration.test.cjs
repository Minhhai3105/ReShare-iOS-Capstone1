const test = require('node:test');
const assert = require('node:assert/strict');
const { planItem } = require('../p2p-pickup-migration.cjs');

test('Bài có địa chỉ công khai: tạo document riêng, xoá cả địa chỉ và giờ hẹn khỏi bài', () => {
  assert.deepEqual(planItem({ pickupAddress: ' 12 Lê Duẩn, Hải Châu ', pickupTime: new Date() }, false), {
    createPrivate: { pickupAddress: '12 Lê Duẩn, Hải Châu' }, removePublic: ['pickupAddress', 'pickupTime'],
  });
});

test('Đã có document riêng thì giữ nguyên bản người đăng đã sửa, chỉ xoá bản công khai', () => {
  assert.deepEqual(planItem({ pickupAddress: 'Địa chỉ cũ' }, true), { createPrivate: null, removePublic: ['pickupAddress'] });
});

test('Chỉ có giờ hẹn hoặc địa chỉ rỗng thì không tạo document riêng', () => {
  assert.deepEqual(planItem({ pickupTime: new Date() }, false), { createPrivate: null, removePublic: ['pickupTime'] });
  assert.deepEqual(planItem({ pickupAddress: '   ' }, false), { createPrivate: null, removePublic: ['pickupAddress'] });
});

test('Địa chỉ dài quá 200 ký tự bị cắt cho khớp rules', () => {
  assert.equal(planItem({ pickupAddress: 'x'.repeat(250) }, false).createPrivate.pickupAddress.length, 200);
});
