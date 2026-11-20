import { USER_ROLE_LABEL } from '../auth/auth.constants.js'
import { unsuspendErrorMessage } from '../moderation/moderation.model.js'

const PROVIDER_LABEL = { email: 'Email và mật khẩu', google: 'Google' }

export function userStatus(user) {
  if (user.staffRole) return { tone: 'staff', label: `Nhân sự · ${USER_ROLE_LABEL[user.staffRole] || user.staffRole}` }
  if (user.suspended || user.disabled || user.unsuspendPending || user.suspendPending) {
    return { tone: 'locked', label: 'Đang bị khoá' }
  }
  return { tone: 'active', label: 'Hoạt động' }
}

export function userAction(user) {
  if (!user || user.staffRole) return null
  if (user.suspendPending) return { key: 'suspend', label: 'Hoàn tất khoá', danger: true }
  if (user.unsuspendPending) return { key: 'unsuspend', label: 'Hoàn tất mở khoá', danger: false }
  if (user.suspended) return { key: 'unsuspend', label: 'Mở khoá', danger: false }
  if (user.disabled) return null
  return { key: 'suspend', label: 'Khoá tài khoản', danger: true }
}

export function providerLabels(providers = []) {
  return providers.map(provider => PROVIDER_LABEL[provider]).filter(Boolean).join(', ') || '—'
}

export function matchesUserName(user, name) {
  return (user.displayName || '').toLocaleLowerCase('vi').includes(name.trim().toLocaleLowerCase('vi'))
}

export function usersErrorMessage(error) {
  if (error?.status === 403 && error?.code !== 'STAFF_ACCESS_CHANGED') return 'Chỉ Quản trị hệ thống mới được quản lý người dùng.'
  switch (error?.code) {
    case 'INVALID_EMAIL': return 'Vui lòng nhập đầy đủ địa chỉ email.'
    case 'INVALID_PAGE_TOKEN': return 'Trang kết quả không còn hiệu lực. Tải lại danh sách.'
    case 'ALREADY_SUSPENDED': return 'Tài khoản đã bị khoá. Tải lại danh sách để kiểm tra.'
    case 'STAFF_ACCOUNT': return 'Thu hồi quyền ở trang Nhân sự trước khi khoá tài khoản này.'
    case 'EXTERNAL_DISABLED': return 'Đăng nhập đã bị vô hiệu hoá ngoài luồng quản trị ReShare.'
    case 'SUSPEND_INCOMPLETE': return 'Chưa khoá xong đăng nhập. Bấm “Hoàn tất khoá” để thử lại.'
    default: return unsuspendErrorMessage(error)
  }
}
