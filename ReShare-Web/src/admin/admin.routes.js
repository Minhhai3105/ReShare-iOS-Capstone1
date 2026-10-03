import { ADMIN_ROLES, ADMIN_ROUTE, FORBIDDEN_REASON, SESSION_EXPIRED_REASON } from './auth/auth.constants'
import {
  canAccessWarehouse,
  currentUser,
  getAccessDeniedReason,
  isAuthenticated,
  isSessionExpired,
  restoreSession,
  setAccessChangedHandler,
  setSessionExpiredHandler,
  signOut,
  staffAssignment,
} from './auth/auth.store'

const SESSION_EXPIRED_LOCATION = { name: ADMIN_ROUTE.login, query: { reason: SESSION_EXPIRED_REASON } }

export const adminRoutes = [
  { path: '/admin/login', name: ADMIN_ROUTE.login, component: () => import('./auth/views/AdminLogin.vue') },
  {
    path: '/admin/forgot-password',
    name: ADMIN_ROUTE.forgotPassword,
    component: () => import('./auth/views/AdminForgotPassword.vue'),
  },
  {
    path: '/admin/403',
    name: ADMIN_ROUTE.forbidden,
    component: () => import('./auth/views/AdminForbidden.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin',
    name: ADMIN_ROUTE.home,
    component: () => import('./AdminHome.vue'),
    meta: { requiresAuth: true, roles: ADMIN_ROLES },
  },
  { path: '/admin/:pathMatch(.*)*', redirect: () => ({ name: ADMIN_ROUTE.home, params: {} }) },
]

// Kho trên URL (params hoặc query warehouseId) phải nằm trong phân công của nhân sự.
function getRouteDeniedReason(to) {
  if (to.meta.roles && !to.meta.roles.includes(staffAssignment.value.role)) return FORBIDDEN_REASON.role
  const warehouseId = to.params.warehouseId ?? to.query.warehouseId
  if (warehouseId !== undefined && !canAccessWarehouse(warehouseId)) return FORBIDDEN_REASON.warehouse
  return null
}

export async function adminAuthGuard(to) {
  await restoreSession()
  if (to.name === ADMIN_ROUTE.login && isAuthenticated.value && !getAccessDeniedReason()) {
    return { name: ADMIN_ROUTE.home }
  }
  if (!to.meta.requiresAuth) return true
  if (!currentUser.value) return { name: ADMIN_ROUTE.login, query: { redirect: to.fullPath } }
  if (isSessionExpired()) {
    signOut()
    return SESSION_EXPIRED_LOCATION
  }
  if (to.name === ADMIN_ROUTE.forbidden) return true

  const deniedReason = getAccessDeniedReason() ?? getRouteDeniedReason(to)
  return deniedReason ? { name: ADMIN_ROUTE.forbidden, query: { reason: deniedReason } } : true
}

export function installAdminAuth(router) {
  setSessionExpiredHandler(() => {
    if (router.currentRoute.value.meta.requiresAuth) router.replace(SESSION_EXPIRED_LOCATION)
  })
  // AC3: phân công đổi → kiểm tra lại trang đang mở theo quyền mới.
  setAccessChangedHandler(async () => {
    const route = router.currentRoute.value
    if (route.name === ADMIN_ROUTE.forbidden && !getAccessDeniedReason()) {
      router.replace({ name: ADMIN_ROUTE.home })
      return
    }
    const location = await adminAuthGuard(route)
    if (location !== true) router.replace(location)
  })
  restoreSession()
  router.beforeEach(adminAuthGuard)
}
