// Dùng cho request mang Firebase ID token. Không chuyển tiếp token qua redirect,
// không gửi cookie kèm theo, không cache phản hồi quản trị hoặc URL ảnh riêng tư.
let sessionExpiredHandler
export function setSessionExpiredHandler(handler) { sessionExpiredHandler = handler }

export function protectedFetch(url, options = {}, fetchImpl = globalThis.fetch) {
  let target
  try { target = new URL(url) } catch { throw new Error('Cấu hình URL máy chủ không hợp lệ.') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  if ((target.protocol !== 'https:' && !(target.protocol === 'http:' && local)) ||
      target.username || target.password || target.hash) {
    throw new Error('Máy chủ quản trị phải dùng HTTPS.')
  }
  return Promise.resolve(fetchImpl(url, {
    ...options, redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    signal: options.signal || AbortSignal.timeout(90000),
  })).then(async response => {
    const authorization = new Headers(options.headers).get('Authorization')
    if (response.status === 401 && authorization?.startsWith('Bearer ') && sessionExpiredHandler) {
      // Không tự gửi lại thao tác ghi. Hủy phiên cũ rồi để người dùng đăng nhập lại.
      try { await sessionExpiredHandler(authorization.slice(7)) } catch { /* Vẫn giữ phản hồi 401 gốc. */ }
    }
    return response
  })
}
