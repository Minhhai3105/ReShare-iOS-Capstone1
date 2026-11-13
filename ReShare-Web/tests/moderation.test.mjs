import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actionsFor, moderationErrorMessage, targetSummary } from '../src/admin/moderation/moderation.model.js'
import { createModerationRepository } from '../src/admin/moderation/moderation.repository.js'

test('chỉ hiện nút xử lý hợp với loại báo cáo và chỉ khi báo cáo còn mở', () => {
  assert.deepEqual(actionsFor({ status: 'open', targetType: 'listing' }).map((a) => a.action), ['remove_listing', 'suspend_user', 'dismiss'])
  assert.deepEqual(actionsFor({ status: 'open', targetType: 'message' }).map((a) => a.action), ['remove_message', 'suspend_user', 'dismiss'])
  assert.deepEqual(actionsFor({ status: 'open', targetType: 'user' }).map((a) => a.action), ['suspend_user', 'dismiss'])
  assert.deepEqual(actionsFor({ status: 'resolved', targetType: 'listing' }), [])
})

test('tóm tắt nội dung bị báo cáo bằng tiếng Việt', () => {
  assert.equal(targetSummary({ targetType: 'listing', target: { exists: true, title: 'Nồi cơm', status: 'removed' } }), 'Nồi cơm (đã gỡ)')
  assert.equal(targetSummary({ targetType: 'message', target: { exists: true, text: 'Xin chào' } }), '“Xin chào”')
  assert.match(targetSummary({ targetType: 'listing', target: { exists: false } }), /không còn tồn tại/)
  assert.match(moderationErrorMessage({ status: 409, message: 'Report already resolved' }), /người khác xử lý/)
})

test('repository gọi đúng đường dẫn và chỉ gửi ghi chú khi có', async () => {
  const calls = []
  const repository = createModerationRepository({
    apiBase: 'https://api.test', authInstance: { currentUser: { getIdToken: async () => 'tok' } },
    fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ reports: [] }) } },
  })
  await repository.list('resolved')
  await repository.resolve('r1', 'dismiss', '  ')
  await repository.resolve('r2', 'remove_listing', 'Bài rao bán')
  assert.equal(calls[0].url, 'https://api.test/v1/admin/moderation/reports?status=resolved')
  assert.equal(calls[1].url, 'https://api.test/v1/admin/moderation/reports/r1/resolve')
  assert.deepEqual(JSON.parse(calls[1].options.body), { action: 'dismiss' })
  assert.deepEqual(JSON.parse(calls[2].options.body), { action: 'remove_listing', note: 'Bài rao bán' })
})
