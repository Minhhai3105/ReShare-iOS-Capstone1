import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aiAutoRemoveNote, aiBadge, countByTab, filterListings, historyActor, moderationNote, p2pErrorMessage, removeCheck, restoreCheck, scopeLabel, searchKey,
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
  assert.deepEqual(countByTab(items), { all: 4, reported: 1, ai_flagged: 0, available: 1, reserved: 1, completed: 1, removed: 1 })
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
  assert.deepEqual(await repository.list(), { listings: [], scope: { all: true, districts: [] }, truncated: false,
    aiEnabled: false, aiAutoRemove: { enabled: false, threshold: 0.9 } })
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


test('Kho đồ 0đ: badge AI có đủ trạng thái và danh mục tiếng Việt', () => {
  assert.deepEqual(aiBadge(null), { label: 'AI: Chưa kiểm', tone: 'muted' })
  assert.deepEqual(aiBadge({ status: 'safe' }), { label: 'AI: An toàn', tone: 'success' })
  assert.deepEqual(aiBadge({ status: 'error' }), { label: 'AI: Lỗi kiểm tra', tone: 'muted' })
  assert.deepEqual(aiBadge({ status: 'flagged', categories: ['scam_or_sale', 'personal_info'] }), {
    label: 'AI: Nghi vấn — Lừa đảo / rao bán, Thông tin cá nhân', tone: 'danger',
  })
})

test('Kho đồ 0đ: mức chắc chắn, ngưỡng tự gỡ và lịch sử AI', () => {
  assert.equal(aiBadge({ status: 'flagged', categories: ['weapons'], confidence: 0.96 }).label, 'AI: Nghi vấn — Vũ khí (96%)')
  assert.match(aiAutoRemoveNote({ enabled: true, threshold: 0.91 }), /đang mở.*≥ 91%.*chưa hiệu chuẩn/)
  assert.equal(aiAutoRemoveNote({ enabled: false, threshold: 0.9 }), 'Tự gỡ bằng AI đang tắt')
  assert.equal(moderationNote({ source: 'ai', reason: 'Cần xem xét' }), 'Gỡ tự động bởi AI: Cần xem xét')
  assert.equal(historyActor({ actorRole: 'ai', actorEmail: null }), 'AI tự động')
  assert.match(restoreCheck({ ...items[3], moderation: { source: 'ai' } }).message, /AI sẽ không tự gỡ lại/)
})

test('Kho đồ 0đ: lọc AI nghi vấn độc lập với trạng thái và báo cáo', () => {
  const list = [listing({ aiModeration: { status: 'flagged' } }), listing({ id: 'safe', aiModeration: { status: 'safe' } }),
    listing({ id: 'removed', status: 'removed', aiModeration: { status: 'flagged' } }), listing({ id: 'error', aiModeration: { status: 'error' } })]
  assert.deepEqual(filterListings(list, { tab: 'ai_flagged' }).map(item => item.id), ['cat_1', 'removed'])
  assert.equal(countByTab(list).ai_flagged, 2)
  assert.equal(countByTab(list).reported, 0)
})

test('Kho đồ 0đ: API AI gửi token, nhận cấu hình và giữ lỗi 429 để dịch', async () => {
  let call
  const authInstance = { currentUser: { getIdToken: async () => 'test-token' } }
  const repository = createP2pRepository({ apiBase: 'https://api.test', authInstance, fetchImpl: async (url, options) => {
    call = { url, options }
    return { ok: true, json: async () => ({ enabled: true, aiEnabled: true, aiModeration: { status: 'safe' } }) }
  } })
  assert.equal((await repository.aiCheck('cat 1')).aiModeration.status, 'safe')
  assert.equal(call.url, 'https://api.test/v1/admin/p2p/listings/cat%201/ai-check')
  assert.equal(call.options.method, 'POST')
  assert.equal(call.options.headers.Authorization, 'Bearer test-token')
  assert.deepEqual(JSON.parse(call.options.body), {})
  const limited = createP2pRepository({ apiBase: 'https://api.test', authInstance, fetchImpl: async () => ({
    ok: false, status: 429, json: async () => ({ message: 'AI check was requested recently', code: 'AI_CHECK_RATE_LIMIT' }),
  }) })
  await assert.rejects(limited.aiCheck('cat_1'), error => {
    assert.equal(p2pErrorMessage(error), 'Vừa kiểm tra, thử lại sau 1 phút.')
    return error.code === 'AI_CHECK_RATE_LIMIT'
  })
  assert.match(p2pErrorMessage({ code: 'AI_CONTENT_CHANGED' }), /Nội dung bài vừa thay đổi/)
})
