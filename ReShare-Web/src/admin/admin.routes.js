import { ADMIN_ROLES, ADMIN_ROUTE, FORBIDDEN_REASON } from './auth/auth.constants'
import {
  canAccessWarehouse,
  currentUser,
  getAccessDeniedReason,
  isAuthenticated,
  restoreSession,
  setAccessChangedHandler,
  staffAssignment,
} from './auth/auth.store'

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
  {
    path: '/admin/staff',
    name: ADMIN_ROUTE.staff,
    component: () => import('./staff/StaffManagement.vue'),
    meta: { requiresAuth: true, roles: ['system_admin'] },
  },
  {
    path: '/admin/donations',
    name: ADMIN_ROUTE.donationQueue,
    component: () => import('./donations/views/DonationQueue.vue'),
    meta: { requiresAuth: true, roles: ADMIN_ROLES },
  },
  ...(import.meta.env.DEV ? [{
    path: '/admin/receipt-preview',
    name: 'admin-donation-receipt-preview',
    component: () => import('./receipt/views/ActualReceipt.vue'),
    meta: { requiresAuth: true, roles: ADMIN_ROLES, devPreview: true },
  }] : []),
  {
    path: '/admin/donations/:donationId/receipt',
    name: 'admin-donation-receipt',
    component: () => import('./receipt/views/ActualReceipt.vue'),
    meta: { requiresAuth: true, roles: ADMIN_ROLES },
  },
  ...(import.meta.env.DEV ? [{
    path: '/admin/ai-review-preview',
    name: 'admin-ai-review-preview',
    component: () => import('./DonationAiReviewDemo.vue'),
    meta: { requiresAuth: true, roles: ADMIN_ROLES },
  }] : []),
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
  if (!to.path.startsWith('/admin')) return true
  await restoreSession()
  if (to.name === ADMIN_ROUTE.login && isAuthenticated.value && !getAccessDeniedReason()) {
    return { name: ADMIN_ROUTE.home }
  }
  if (!to.meta.requiresAuth) return true
  if (!currentUser.value) return { name: ADMIN_ROUTE.login, query: { redirect: to.fullPath } }
  if (to.name === ADMIN_ROUTE.forbidden) return true

  const deniedReason = getAccessDeniedReason() ?? getRouteDeniedReason(to)
  return deniedReason ? { name: ADMIN_ROUTE.forbidden, query: { reason: deniedReason } } : true
}

export function installAdminAuth(router) {
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
