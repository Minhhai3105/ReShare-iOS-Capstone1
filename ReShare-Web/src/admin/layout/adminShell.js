import { inject } from 'vue'

// AdminLayout cung cấp cờ này cho các trang con. Trang nằm trong khung thì không tự vẽ sidebar/topbar riêng;
// các route xem thử chỉ có ở DEV không nằm trong khung nên vẫn giữ giao diện cũ.
export const ADMIN_SHELL_KEY = Symbol('reshare-admin-shell')

export function useInAdminShell() {
  return inject(ADMIN_SHELL_KEY, false)
}
