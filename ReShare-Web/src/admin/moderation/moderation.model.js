// Logic thuần cho trang Báo cáo vi phạm (kiểm thử bằng node --test). Quy tắc thật nằm ở
// backend/moderation-api.cjs; ở đây chỉ chọn nút phù hợp và dịch thông báo.

export const REPORT_REASON_LABEL = Object.freeze({
  spam: 'Spam / quảng cáo',
  scam: 'Lừa đảo',
  inappropriate: 'Nội dung không phù hợp',
  harassment: 'Quấy rối',
  prohibited_item: 'Món đồ bị cấm',
  other: 'Lý do khác',
})

export const TARGET_LABEL = Object.freeze({ listing: 'Bài đăng', message: 'Tin nhắn', user: 'Người dùng' })

export const RESOLUTION_LABEL = Object.freeze({
  dismiss: 'Bỏ qua',
  remove_listing: 'Đã gỡ bài',
  remove_message: 'Đã gỡ tin nhắn',
  suspend_user: 'Đã khoá tài khoản',
})

const ACTIONS = Object.freeze([
  { action: 'remove_listing', label: 'Gỡ bài', types: ['listing'], danger: true,
    confirm: 'Gỡ bài này khỏi Kho đồ 0đ? Người đăng và mọi người sẽ không thấy bài nữa.' },
  { action: 'remove_message', label: 'Gỡ tin nhắn', types: ['message'], danger: true,
    confirm: 'Thay nội dung tin nhắn bằng thông báo “đã bị gỡ do vi phạm”?' },
  { action: 'suspend_user', label: 'Khoá tài khoản', types: ['listing', 'message', 'user'], danger: true,
    confirm: 'Khoá tài khoản người bị báo cáo? Họ sẽ bị đăng xuất, không đăng nhập lại được và các bài đang mở bị gỡ.' },
  { action: 'dismiss', label: 'Bỏ qua', types: ['listing', 'message', 'user'], danger: false,
    confirm: 'Đóng báo cáo này mà không xử lý gì?' },
])

export function actionsFor(report) {
  if (report?.status !== 'open') return []
  return ACTIONS.filter((item) => item.types.includes(report.targetType))
}

const LISTING_STATUS = Object.freeze({ available: 'đang mở', reserved: 'đang có người giữ', completed: 'đã trao', removed: 'đã gỡ' })

export function targetSummary(report) {
  const target = report?.target || {}
  if (target.exists === false) return 'Nội dung không còn tồn tại (có thể đã bị người đăng xoá).'
  if (report?.targetType === 'listing') {
    return [target.title, target.status ? `(${LISTING_STATUS[target.status] || target.status})` : ''].filter(Boolean).join(' ')
  }
  if (report?.targetType === 'message') return target.text ? `“${target.text}”` : ''
  return report?.targetUser?.name || ''
}

const ERROR_MESSAGES = Object.freeze({
  'Report already resolved': 'Báo cáo đã được người khác xử lý. Tải lại danh sách.',
  'Action does not match the report': 'Hành động không phù hợp với loại báo cáo.',
  'Staff accounts cannot be suspended here; revoke staff access first': 'Không khoá được tài khoản nhân sự ở đây. Thu hồi quyền nhân sự trước.',
  'System Admin access required': 'Chỉ Quản trị hệ thống mới xử lý được báo cáo.',
  'Staff access changed; reload session': 'Quyền của bạn vừa thay đổi. Đăng nhập lại.',
})

export function moderationErrorMessage(error) {
  if (error?.code === 'UNCERTAIN') return 'Chưa rõ thao tác đã lưu hay chưa. Tải lại danh sách để kiểm tra.'
  if (error?.status === 0) return 'Không kết nối được máy chủ. Thử lại sau giây lát.'
  return ERROR_MESSAGES[error?.message] || 'Không thực hiện được thao tác. Thử lại sau.'
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—'
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
}
