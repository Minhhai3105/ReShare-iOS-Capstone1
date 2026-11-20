import { AUTH_ERROR } from './auth.constants.js'

const characters = new Intl.Segmenter('vi', { granularity: 'grapheme' })

export function validatePasswordChange(currentPassword, newPassword, confirmation) {
  if (!currentPassword) return { currentPassword: 'Vui lòng nhập mật khẩu hiện tại.' }
  if ([...characters.segment(newPassword)].length < 8) {
    return { newPassword: 'Mật khẩu mới phải có ít nhất 8 ký tự.' }
  }
  if (newPassword === currentPassword) {
    return { newPassword: 'Mật khẩu mới phải khác mật khẩu hiện tại.' }
  }
  if (newPassword !== confirmation) {
    return { confirmation: 'Mật khẩu nhập lại không khớp.' }
  }
  return {}
}

export function passwordChangeErrorMessage(error) {
  if (error.status === AUTH_ERROR.network) return 'Mất kết nối mạng. Vui lòng kiểm tra mạng rồi thử lại.'
  switch (error.cause?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Mật khẩu hiện tại không đúng.'
    case 'auth/weak-password':
      return 'Mật khẩu mới chưa đủ mạnh. Vui lòng chọn mật khẩu mạnh hơn.'
    case 'auth/too-many-requests':
      return 'Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.'
    case 'auth/no-current-user':
    case 'auth/user-token-expired':
    case 'auth/invalid-user-token':
    case 'auth/requires-recent-login':
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.'
    default:
      return 'Chưa đổi được mật khẩu. Vui lòng thử lại sau.'
  }
}
