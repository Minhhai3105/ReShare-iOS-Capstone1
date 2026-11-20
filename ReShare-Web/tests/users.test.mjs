import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchesUserName, providerLabels, userAction, userStatus, usersErrorMessage } from '../src/admin/users/users.model.js'
import { createUsersService } from '../src/admin/users/users.service.js'

test('Trạng thái tài khoản và thao tác khớp quyền nhân sự, khoá và các ca dở dang', () => {
  assert.equal(userStatus({}).label, 'Hoạt động')
  assert.equal(userStatus({ suspended: true }).label, 'Đang bị khoá')
  assert.equal(userStatus({ staffRole: 'system_admin' }).label, 'Nhân sự · Quản trị hệ thống')
  assert.equal(userAction({ staffRole: 'warehouse_admin' }), null)
  assert.equal(userAction({ disabled: true }), null)
  assert.equal(userAction({ suspended: true }).key, 'unsuspend')
  assert.equal(userAction({ suspendPending: true }).label, 'Hoàn tất khoá')
  assert.equal(userAction({ unsuspendPending: true }).label, 'Hoàn tất mở khoá')
})

test('Hiển thị nhà cung cấp, lọc tên và dịch lỗi của API', () => {
  assert.equal(providerLabels(['email', 'google']), 'Email và mật khẩu, Google')
  assert.equal(providerLabels([]), '—')
  assert.ok(matchesUserName({ displayName: 'Hải' }, ' HẢI '))
  assert.equal(matchesUserName({ displayName: 'Hải' }, 'Châu'), false)
  assert.match(usersErrorMessage({ code: 'INVALID_EMAIL' }), /đầy đủ địa chỉ email/)
  assert.match(usersErrorMessage({ code: 'SUSPEND_INCOMPLETE' }), /Hoàn tất khoá/)
  assert.match(usersErrorMessage({ code: 'UNSUSPEND_INCOMPLETE' }), /Hoàn tất mở khoá/)
  assert.match(usersErrorMessage({ status: 403 }), /Chỉ Quản trị hệ thống/)
})

test('Tìm email, phân trang và thao tác gọi đúng API, mở khoá dùng lại route cũ', async () => {
  const requests = []
  const service = createUsersService({
    apiBase: 'https://api.test', authInstance: { currentUser: { getIdToken: async () => 'test' } },
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options })
      return { ok: true, json: async () => ({ users: [], nextPageToken: 'p+/' }) }
    },
  })
  assert.equal((await service.list()).nextPageToken, 'p+/')
  await service.list({ pageToken: 'p+/' })
  await service.list({ email: ' hai+test@example.test ' })
  await service.summary('donor-1')
  await service.suspend('donor-1', '  Đã kiểm tra  ')
  await service.unsuspend('donor-1', 'Đã đối soát')
  assert.equal(requests[1].url.searchParams.get('pageToken'), 'p+/')
  assert.equal(requests[2].url.searchParams.get('email'), 'hai+test@example.test')
  assert.equal(requests[3].url.pathname, '/v1/admin/users/donor-1/summary')
  assert.equal(requests[4].url.pathname, '/v1/admin/users/donor-1/suspend')
  assert.deepEqual(JSON.parse(requests[4].options.body), { reason: 'Đã kiểm tra' })
  assert.equal(requests[5].url.pathname, '/v1/admin/moderation/users/donor-1/unsuspend')
})
