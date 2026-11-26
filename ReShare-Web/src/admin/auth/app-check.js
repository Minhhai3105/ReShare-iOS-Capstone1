// RC1D-145: cấu hình Firebase App Check cho Web Admin (reCAPTCHA Enterprise).
// Tách khỏi firebase.js để test bằng node mà không khởi tạo Firebase.

/**
 * Đọc cấu hình App Check từ biến môi trường của Vite.
 * - Không có VITE_APPCHECK_SITE_KEY: trả null, Web Admin chạy như trước (chưa gửi token App Check).
 * - VITE_APPCHECK_DEBUG_TOKEN chỉ dùng khi dev (localhost không qua được reCAPTCHA thật);
 *   đặt "true" để SDK tự sinh token in ra Console, hoặc dán token đã đăng ký trong Firebase Console.
 *   Bản build bỏ qua biến này để token debug không bao giờ lọt ra production.
 */
export function readAppCheckConfig(env = {}) {
  const siteKey = typeof env.VITE_APPCHECK_SITE_KEY === 'string' ? env.VITE_APPCHECK_SITE_KEY.trim() : ''
  if (!siteKey) return null
  const rawDebug = env.DEV && typeof env.VITE_APPCHECK_DEBUG_TOKEN === 'string' ? env.VITE_APPCHECK_DEBUG_TOKEN.trim() : ''
  const debugToken = rawDebug === 'true' ? true : rawDebug || null
  return { siteKey, debugToken }
}
