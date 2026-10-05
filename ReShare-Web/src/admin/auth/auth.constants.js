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
  unavailable: 'unavailable',
})

export const ADMIN_ROUTE = Object.freeze({
  home: 'admin-home',
  staff: 'admin-staff',
  login: 'admin-login',
  forgotPassword: 'admin-forgot-password',
  forbidden: 'admin-forbidden',
  donationQueue: 'admin-donation-queue',
})

export const AUTH_ERROR = Object.freeze({
  invalidCredentials: 401,
  server: 500,
  network: 'NETWORK_ERROR',
})

export const SESSION_EXPIRED_REASON = 'session_expired'
