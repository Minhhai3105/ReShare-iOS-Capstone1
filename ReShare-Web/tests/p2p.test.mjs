import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countByTab, filterListings, moderationNote, p2pErrorMessage, removeCheck, restoreCheck, scopeLabel, searchKey,
} from '../src/admin/p2p/p2p.model.js'
import { createP2pRepository } from '../src/admin/p2p/p2p.repository.js'

const listing = (overrides = {}) => ({
  id: 'cat_1', title: 'Áo khoác len', category: 'Quần áo', condition: 'Còn tốt', district: 'Hải Châu', status: 'available',
  donor: { id: 'u1', name: 'Nguyễn Văn An', suspended: false }, reports: { open: 0, total: 0 }, moderation: null, restoreBlocker: 'NOT_REMOVED',
  ...overrides,
})

const items = [
  listing(),
  listing({ id: 'cat_2', title: 'Sách giáo khoa', category: 'Sách vở', status: 'reserved', reports: { open: 2, total: 3 } }),
  listing({ id: 'cat_3', title: 'Nồi cơm', district: 'Cẩm Lệ', status: 'completed' }),
  listing({ id: 'cat_4', title: 'Đồ chơi', status: 'removed', restoreBlocker: null, moderation: { source: 'admin_p2p', action: 'remove', reason: 'Rao bán' } }),
]

test('Kho đồ 0đ: đếm và lọc theo tab, tab "Có báo cáo chờ xử lý" chỉ lấy bài còn báo cáo mở', () => {
  assert.deepEqual(countByTab(items), { all: 4, reported: 1, available: 1, reserved: 1, completed: 1, removed: 1 })
  assert.deepEqual(filterListings(items, { tab: 'reported' }).map((item) => item.id), ['cat_2'])
  assert.deepEqual(filterListings(items, { tab: 'removed' }).map((item) => item.id), ['cat_4'])
})

test('Kho đồ 0đ: tìm không phân biệt dấu và hoa thường, theo tên món, người đăng, quận, danh mục', () => {
  assert.equal(searchKey('  Đồ   Chơi '), 'do choi')
  assert.deepEqual(filterListings(items, { query: 'ao khoac' }).map((item) => item.id), ['cat_1'])
  assert.deepEqual(filterListings(items, { query: 'cam le' }).map((item) => item.id), ['cat_3'])
  assert.deepEqual(filterListings(items, { query: 'sach vo' }).map((item) => item.id), ['cat_2'])
  assert.equal(filterListings(items, { query: 'nguyen van an' }).length, 4)
  assert.deepEqual(filterListings(items, { tab: 'available', query: 'nồi' }), [])
})

test('Kho đồ 0đ: nhãn phạm vi theo vai trò', () => {
  assert.equal(scopeLabel({ all: true, districts: [] }), 'Toàn hệ thống — mọi quận')
  assert.equal(scopeLabel({ all: false, districts: ['Hải Châu', 'Thanh Khê'] }), 'Khu vực phụ trách: Hải Châu, Thanh Khê')
  assert.equal(scopeLabel({ all: false, districts: [] }), '')
  assert.equal(scopeLabel(null), '')
})

test('Kho đồ 0đ: ô xác nhận gỡ báo rõ hệ quả theo trạng thái và số báo cáo sẽ tự đóng', () => {
  assert.match(removeCheck(items[0]).message, /khôi phục được/)
  const reserved = removeCheck(items[1])
  assert.match(reserved.message, /đang có người hẹn/)
  assert.match(reserved.message, /2 báo cáo đang chờ/)
  assert.equal(reserved.confirmLabel, 'Gỡ bài')
  assert.match(removeCheck(items[2]).message, /không khôi phục lại được/)
  assert.equal(removeCheck(items[3]), null, 'bài đã gỡ không gỡ lại')
  assert.equal(removeCheck(listing({ status: 'unknown' })), null)
})

test('Kho đồ 0đ: khôi phục chỉ cho bài đã gỡ; bị chặn thì chỉ hiện lý do, không có nút xác nhận', () => {
  assert.equal(restoreCheck(items[0]), null)
  assert.deepEqual(restoreCheck(items[3]), {
    blocked: false, message: 'Khôi phục bài này? Bài hiện lại trên app ở trạng thái “Đang mở”.', confirmLabel: 'Khôi phục', tone: 'warning',
  })
  const blocked = restoreCheck({ ...items[3], restoreBlocker: 'OWNER_SUSPENDED' })
  assert.equal(blocked.blocked, true)
  assert.equal(blocked.confirmLabel, '')
  assert.match(blocked.message, /đang bị khoá/)
  assert.match(restoreCheck({ ...items[3], restoreBlocker: 'SYSTEM_ADMIN_ONLY' }).message, /chỉ Quản trị hệ thống/)
})

test('Kho đồ 0đ: ghi chú gỡ / khôi phục và thông báo lỗi tiếng Việt', () => {
  assert.equal(moderationNote(items[3].moderation), 'Gỡ từ trang Kho đồ 0đ: Rao bán')
  assert.equal(moderationNote({ source: 'report', action: 'remove', reason: '' }), 'Gỡ qua Báo cáo vi phạm')
  assert.equal(moderationNote({ action: 'restore' }), 'Đã được khôi phục sau khi gỡ.')
  assert.equal(moderationNote(null), '')
  assert.match(p2pErrorMessage({ message: 'Listing changed; reload first' }), /Tải lại/)
  assert.match(p2pErrorMessage({ message: 'Listing is outside your area' }), /ngoài khu vực/)
  assert.match(p2pErrorMessage({ code: 'RESTORE_BLOCKED', details: { reason: 'NOT_OPEN_BEFORE' } }), /đã có người hẹn hoặc đã trao/)
  assert.match(p2pErrorMessage({ code: 'UNCERTAIN', status: 0 }), /Chưa rõ/)
  assert.match(p2pErrorMessage({ status: 0 }), /kết nối/)
})

test('Kho đồ 0đ: repository gửi đúng đường dẫn, kèm token và chỉ gửi lý do khi có', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    const body = url.endsWith('/listings')
      ? { listings: [], scope: { all: true, districts: [] }, truncated: false }
      : { id: 'cat_1', status: 'removed', resolvedReports: 0 }
    return { ok: true, status: 200, json: async () => body }
  }
  const authInstance = { currentUser: { getIdToken: async () => 'token-1' } }
  const repository = createP2pRepository({ apiBase: 'https://api.test', authInstance, fetchImpl })
  assert.deepEqual(await repository.list(), { listings: [], scope: { all: true, districts: [] }, truncated: false })
  await repository.remove('cat_1', 'available', '  rao bán  ')
  await repository.remove('cat_2', 'reserved')
  await repository.restore('cat 3')
  assert.equal(calls[0].url, 'https://api.test/v1/admin/p2p/listings')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1')
  assert.equal(calls[1].url, 'https://api.test/v1/admin/p2p/listings/cat_1/remove')
  assert.deepEqual(JSON.parse(calls[1].options.body), { expectedStatus: 'available', reason: 'rao bán' })
  assert.deepEqual(JSON.parse(calls[2].options.body), { expectedStatus: 'reserved' })
  assert.equal(calls[3].url, 'https://api.test/v1/admin/p2p/listings/cat%203/restore')
  assert.deepEqual(JSON.parse(calls[3].options.body), { expectedStatus: 'removed' })
})

test('Kho đồ 0đ: lỗi khôi phục giữ mã và chi tiết từ backend; mất mạng khi ghi báo "chưa rõ"', async () => {
  const authInstance = { currentUser: { getIdToken: async () => 't' } }
  const blocked = createP2pRepository({
    apiBase: 'https://api.test', authInstance,
    fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ message: 'Listing cannot be restored', code: 'RESTORE_BLOCKED', details: { reason: 'HAS_RESERVATION' } }) }),
  })
  await assert.rejects(blocked.restore('cat_1'), (error) => error.code === 'RESTORE_BLOCKED' && error.details.reason === 'HAS_RESERVATION')
  const offline = createP2pRepository({ apiBase: 'https://api.test', authInstance, fetchImpl: async () => { throw new TypeError('fetch failed') } })
  await assert.rejects(offline.remove('cat_1', 'available'), { code: 'UNCERTAIN', status: 0 })
  await assert.rejects(offline.list(), { code: 'NETWORK_ERROR', status: 0 })
})
