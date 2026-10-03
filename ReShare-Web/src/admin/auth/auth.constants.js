// Khớp UserProfile.UserRole bên iOS
export const USER_ROLE = Object.freeze({
  donor: 'donor',
  warehouseAdmin: 'warehouse_admin',
  systemAdmin: 'system_admin',
})

export const ADMIN_ROLES = Object.freeze([USER_ROLE.systemAdmin, USER_ROLE.warehouseAdmin])

export const USER_ROLE_LABEL = Object.freeze({
  [USER_ROLE.warehouseAdmin]: 'Quản trị viên kho',
  [USER_ROLE.systemAdmin]: 'Quản trị hệ thống',
})

export const FORBIDDEN_REASON = Object.freeze({
  notStaff: 'not_staff',
  revoked: 'revoked',
  role: 'role',
  warehouse: 'warehouse',
})

export const ADMIN_ROUTE = Object.freeze({
  home: 'admin-home',
  login: 'admin-login',
  forgotPassword: 'admin-forgot-password',
  forbidden: 'admin-forbidden',
})

export const AUTH_ERROR = Object.freeze({
  invalidCredentials: 401,
  server: 500,
  network: 'NETWORK_ERROR',
})

export const SESSION_STORAGE_KEY = 'reshare_admin_session'
export const SESSION_EXPIRED_REASON = 'session_expired'
export const SESSION_DURATION_MS = 30 * 60 * 1000
export const EXTENDED_SESSION_DURATION_MS = 8 * 60 * 60 * 1000

export const ADMIN_EMAIL_DOMAIN = '@reshare.vn'
export const MAX_SIGN_IN_ATTEMPTS = 5
export const RESET_LINK_TTL_MINUTES = 15
export const SUPPORT_EMAIL = 'support@reshare.vn'
