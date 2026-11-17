// Logic thuần cho trang Kho đồ 0đ (kiểm thử bằng node --test). Quy tắc thật — phạm vi theo quận,
// gỡ / khôi phục — nằm ở backend/p2p-listings-api.cjs; ở đây chỉ lọc, đếm, chọn nút và dịch thông báo.

export const LISTING_STATUS = Object.freeze({
  available: { label: 'Đang mở', tone: 'success' },
  reserved: { label: 'Đã có người hẹn', tone: 'warning' },
  completed: { label: 'Đã trao', tone: 'muted' },
  removed: { label: 'Đã gỡ', tone: 'danger' },
  unknown: { label: 'Không rõ trạng thái', tone: 'muted' },
})

export const STATUS_TABS = Object.freeze([
  { id: 'all', label: 'Tất cả' },
  { id: 'reported', label: 'Có báo cáo chờ xử lý' },
  { id: 'available', label: 'Đang mở' },
  { id: 'reserved', label: 'Đã có người hẹn' },
  { id: 'completed', label: 'Đã trao' },
  { id: 'removed', label: 'Đã gỡ' },
])

export function statusLabel(status) {
  return (LISTING_STATUS[status] || LISTING_STATUS.unknown).label
}

function matchesTab(listing, tab) {
  if (tab === 'all') return true
  if (tab === 'reported') return (listing.reports?.open || 0) > 0
  return listing.status === tab
}

// Tìm không phân biệt hoa thường và dấu (gõ "ao" vẫn ra "Áo").
export function searchKey(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim().replace(/\s+/g, ' ')
}

export function filterListings(listings, { tab = 'all', query = '' } = {}) {
  const needle = searchKey(query)
  return listings.filter((listing) => matchesTab(listing, tab) && (!needle || [
    listing.title, listing.donor?.name, listing.district, listing.category,
  ].some((field) => searchKey(field).includes(needle))))
}

export function countByTab(listings) {
  return Object.fromEntries(STATUS_TABS.map((tab) => [tab.id, listings.filter((listing) => matchesTab(listing, tab.id)).length]))
}

export function scopeLabel(scope) {
  if (!scope) return ''
  if (scope.all) return 'Toàn hệ thống — mọi quận'
  return scope.districts?.length ? `Khu vực phụ trách: ${scope.districts.join(', ')}` : ''
}

// Ô xác nhận khi bấm "Gỡ bài". null = bài không gỡ được (đã gỡ / trạng thái lạ).
export function removeCheck(listing) {
  if (!listing || !['available', 'reserved', 'completed'].includes(listing.status)) return null
  const parts = ['Gỡ bài này khỏi Kho đồ 0đ? Người đăng và mọi người sẽ không thấy bài trên app nữa.']
  if (listing.status === 'reserved') {
    parts.push('Bài đang có người hẹn: cuộc trò chuyện vẫn còn nhưng không khôi phục lại bài này được.')
  } else if (listing.status === 'completed') {
    parts.push('Bài đã trao xong: gỡ chỉ để ẩn nội dung vi phạm, không khôi phục lại được.')
  } else {
    parts.push('Gỡ nhầm thì khôi phục được.')
  }
  const open = listing.reports?.open || 0
  if (open > 0) parts.push(`${open} báo cáo đang chờ về bài này sẽ tự chuyển sang “Đã gỡ bài”.`)
  return { message: parts.join(' '), confirmLabel: 'Gỡ bài', tone: 'danger' }
}

export const RESTORE_BLOCKER_MESSAGE = Object.freeze({
  NOT_REMOVED: 'Bài chưa bị gỡ.',
  OWNER_MISSING: 'Không khôi phục được: tài khoản người đăng không còn tồn tại.',
  OWNER_SUSPENDED: 'Không khôi phục được: tài khoản người đăng đang bị khoá.',
  NOT_OPEN_BEFORE: 'Không khôi phục được: trước khi gỡ, bài đã có người hẹn hoặc đã trao.',
  HAS_RESERVATION: 'Không khôi phục được: bài còn dính cuộc hẹn hoặc bàn giao.',
  SYSTEM_ADMIN_ONLY: 'Bài bị gỡ từ trang Báo cáo vi phạm: chỉ Quản trị hệ thống khôi phục được.',
})

// Ô xác nhận khi bấm "Khôi phục". blocked = chỉ hiện lý do, không có nút xác nhận.
export function restoreCheck(listing) {
  if (listing?.status !== 'removed') return null
  if (listing.restoreBlocker) {
    return { blocked: true, message: RESTORE_BLOCKER_MESSAGE[listing.restoreBlocker] || 'Bài này không khôi phục được.', confirmLabel: '', tone: 'danger' }
  }
  return { blocked: false, message: 'Khôi phục bài này? Bài hiện lại trên app ở trạng thái “Đang mở”.', confirmLabel: 'Khôi phục', tone: 'warning' }
}

export function moderationNote(moderation) {
  if (!moderation) return ''
  if (moderation.action === 'restore') return 'Đã được khôi phục sau khi gỡ.'
  const source = moderation.source === 'admin_p2p' ? 'Gỡ từ trang Kho đồ 0đ'
    : moderation.source === 'report' ? 'Gỡ qua Báo cáo vi phạm' : 'Đã gỡ'
  return moderation.reason ? `${source}: ${moderation.reason}` : source
}

export const HISTORY_ACTION_LABEL = Object.freeze({ remove: 'Gỡ bài', restore: 'Khôi phục' })

const ERROR_MESSAGES = Object.freeze({
  'Listing changed; reload first': 'Bài vừa thay đổi trạng thái (có người hẹn, trao xong hoặc bị người khác xử lý). Tải lại danh sách.',
  'Listing already removed': 'Bài đã bị gỡ trước đó. Tải lại danh sách.',
  'Listing not found': 'Bài không còn tồn tại (có thể người đăng đã xoá).',
  'Listing is outside your area': 'Bài này thuộc quận ngoài khu vực kho của bạn phụ trách.',
  'Listing cannot be restored': 'Bài này không khôi phục được.',
  'Staff access required': 'Tài khoản không có quyền xem Kho đồ 0đ.',
  'Staff access changed; reload session': 'Quyền của bạn vừa thay đổi. Đăng nhập lại.',
  'Reason is too long': 'Lý do gỡ tối đa 300 ký tự.',
})

export function p2pErrorMessage(error) {
  if (error?.code === 'RESTORE_BLOCKED') {
    return RESTORE_BLOCKER_MESSAGE[error?.details?.reason] || ERROR_MESSAGES['Listing cannot be restored']
  }
  if (error?.code === 'UNCERTAIN') return 'Chưa rõ thao tác đã lưu hay chưa. Tải lại danh sách để kiểm tra.'
  if (error?.status === 0) return 'Không kết nối được máy chủ. Thử lại sau giây lát.'
  return ERROR_MESSAGES[error?.message] || 'Không thực hiện được thao tác. Thử lại sau.'
}
