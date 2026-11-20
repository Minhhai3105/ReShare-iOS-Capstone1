import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AUTH_ERROR } from '../src/admin/auth/auth.constants.js'
import { passwordChangeErrorMessage, validatePasswordChange } from '../src/admin/auth/password-change.model.js'

test('Cần mật khẩu hiện tại và chấp nhận mật khẩu mới hợp lệ đúng 8 ký tự', () => {
  assert.ok(validatePasswordChange('', '1234Abcd', '1234Abcd').currentPassword)
  assert.deepEqual(validatePasswordChange('matkhau-cu', '1234Abcd', '1234Abcd'), {})
})

test('Từ chối mật khẩu mới ngắn, trùng mật khẩu cũ hoặc nhập lại khác', () => {
  assert.ok(validatePasswordChange('matkhau-cu', '123Abcd', '123Abcd').newPassword)
  assert.ok(validatePasswordChange('matkhau-cu', 'matkhau-cu', 'matkhau-cu').newPassword)
  assert.ok(validatePasswordChange('matkhau-cu', '1234Abcd', '1234AbcD').confirmation)
})

test('Đếm ký tự ghép như Swift và giữ nguyên khoảng trắng khi so khớp', () => {
  const seven = 'a\u0301'.repeat(7)
  assert.ok(validatePasswordChange('matkhau-cu', seven, seven).newPassword)
  assert.deepEqual(validatePasswordChange('matkhau-cu', `${seven} `, `${seven} `), {})
  assert.ok(validatePasswordChange('matkhau-cu', `${seven} `, seven).confirmation)
})

test('Thông báo lỗi Firebase bằng tiếng Việt, không đưa nội dung lỗi SDK lên form', () => {
  const fromFirebase = (code) => passwordChangeErrorMessage({ status: AUTH_ERROR.server, cause: { code, message: 'Chi tiết nội bộ' } })
  assert.match(fromFirebase('auth/wrong-password'), /mật khẩu hiện tại không đúng/i)
  assert.match(fromFirebase('auth/invalid-credential'), /mật khẩu hiện tại không đúng/i)
  assert.match(fromFirebase('auth/weak-password'), /chưa đủ mạnh/i)
  assert.match(fromFirebase('auth/too-many-requests'), /chờ rồi thử lại/i)
  assert.match(fromFirebase('auth/no-current-user'), /đăng nhập lại/i)
  assert.doesNotMatch(fromFirebase('auth/internal-error'), /Chi tiết nội bộ/i)
  assert.match(passwordChangeErrorMessage({ status: AUTH_ERROR.network }), /mất kết nối mạng/i)
})
