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

const ADMIN_PAGE_META = Object.freeze({ requiresAuth: true, roles: ADMIN_ROLES })
const SYSTEM_ADMIN_META = Object.freeze({ requiresAuth: true, roles: ['system_admin'] })

// Các trang vận hành thật nằm trong một khung chung (AdminLayout): sidebar và thanh trên cùng không đổi khi chuyển trang.
const adminPageRoutes = [
  { path: '', name: ADMIN_ROUTE.home, component: () => import('./AdminHome.vue'), meta: ADMIN_PAGE_META },
  { path: 'staff', name: ADMIN_ROUTE.staff, component: () => import('./staff/StaffManagement.vue'), meta: SYSTEM_ADMIN_META },
  { path: 'contacts', name: ADMIN_ROUTE.contacts, component: () => import('./contacts/ContactInbox.vue'), meta: SYSTEM_ADMIN_META },
  { path: 'moderation', name: ADMIN_ROUTE.moderation, component: () => import('./moderation/ModerationInbox.vue'), meta: SYSTEM_ADMIN_META },
  { path: 'campaigns', name: ADMIN_ROUTE.campaignList, component: () => import('./campaigns/CampaignList.vue'), meta: SYSTEM_ADMIN_META },
  { path: 'campaigns/new', name: ADMIN_ROUTE.campaignNew, component: () => import('./campaigns/CampaignForm.vue'), meta: SYSTEM_ADMIN_META },
  { path: 'campaigns/:campaignId', name: ADMIN_ROUTE.campaignDetail, component: () => import('./campaigns/CampaignDetail.vue'), meta: SYSTEM_ADMIN_META },
  { path: 'campaigns/:campaignId/edit', name: ADMIN_ROUTE.campaignEdit, component: () => import('./campaigns/CampaignForm.vue'), meta: SYSTEM_ADMIN_META },
  { path: 'donations', name: ADMIN_ROUTE.donationQueue, component: () => import('./donations/views/DonationQueue.vue'), meta: ADMIN_PAGE_META },
  { path: 'donations/:donationId', name: 'admin-donation-detail', component: () => import('./donations/DonationDetailRoute.vue'), meta: ADMIN_PAGE_META },
  { path: 'donations/:donationId/receipt', name: 'admin-donation-receipt', component: () => import('./receipt/views/ActualReceipt.vue'), meta: ADMIN_PAGE_META },
  { path: 'donations/:donationId/stock-in', name: 'admin-donation-stock-in', component: () => import('./stockin/views/StockIn.vue'), meta: ADMIN_PAGE_META },
  { path: 'stock-entries/:entryId', name: 'admin-stock-entry-detail', component: () => import('./stockin/views/StockEntryDetail.vue'), meta: ADMIN_PAGE_META },
  { path: 'inventory', name: ADMIN_ROUTE.inventory, component: () => import('./inventory/views/InventoryList.vue'), meta: ADMIN_PAGE_META },
  { path: 'inventory/:itemId', name: ADMIN_ROUTE.inventoryDetail, component: () => import('./inventory/views/InventoryDetail.vue'), meta: ADMIN_PAGE_META },
  { path: 'inventory/distributions/:voucherId', name: ADMIN_ROUTE.distributionDetail, component: () => import('./inventory/views/DistributionDetail.vue'), meta: ADMIN_PAGE_META },
  { path: 'beneficiaries', name: ADMIN_ROUTE.beneficiaryList, component: () => import('./beneficiaries/BeneficiaryList.vue'), meta: ADMIN_PAGE_META },
  { path: 'beneficiaries/new', name: ADMIN_ROUTE.beneficiaryNew, component: () => import('./beneficiaries/BeneficiaryForm.vue'), meta: ADMIN_PAGE_META },
  { path: 'beneficiaries/:beneficiaryId', name: ADMIN_ROUTE.beneficiaryDetail, component: () => import('./beneficiaries/BeneficiaryDetail.vue'), meta: ADMIN_PAGE_META },
  { path: 'beneficiaries/:beneficiaryId/edit', name: ADMIN_ROUTE.beneficiaryEdit, component: () => import('./beneficiaries/BeneficiaryForm.vue'), meta: ADMIN_PAGE_META },
  { path: 'distribution', name: 'admin-distribution', component: () => import('./distribution/DistributionRoute.vue'), meta: ADMIN_PAGE_META },
  { path: 'reports', name: 'admin-reports', component: () => import('./reports/ReportsRoute.vue'), meta: ADMIN_PAGE_META },
]

// Route xem thử chỉ có khi chạy DEV: dùng dữ liệu mẫu, cố ý nằm ngoài khung để không lẫn với trang thật.
const devPreviewRoutes = import.meta.env.DEV ? [
  { path: '/admin/reports-preview', name: 'admin-reports-preview', component: () => import('./reports/ReportsPreviewRoute.vue'), meta: { ...ADMIN_PAGE_META, devPreview: true } },
  { path: '/admin/distribution-preview', name: 'admin-distribution-preview', component: () => import('./distribution/DistributionPreviewRoute.vue'), meta: { ...ADMIN_PAGE_META, devPreview: true } },
  { path: '/admin/warehouses/:warehouseId/donations/:donationId', name: 'admin-donation-detail-preview', component: () => import('./donations/DonationDetailRoute.vue'), meta: ADMIN_PAGE_META },
  { path: '/admin/receipt-preview', name: 'admin-donation-receipt-preview', component: () => import('./receipt/views/ActualReceipt.vue'), meta: { ...ADMIN_PAGE_META, devPreview: true } },
  { path: '/admin/stock-in-preview', name: 'admin-donation-stock-in-preview', component: () => import('./stockin/views/StockIn.vue'), meta: { ...ADMIN_PAGE_META, devPreview: true } },
  { path: '/admin/stock-entry-preview', name: 'admin-stock-entry-preview', component: () => import('./stockin/views/StockEntryDetail.vue'), meta: { ...ADMIN_PAGE_META, devPreview: true } },
  { path: '/admin/ai-review-preview', name: 'admin-ai-review-preview', component: () => import('./DonationAiReviewDemo.vue'), meta: ADMIN_PAGE_META },
] : []

export const adminRoutes = [
  { path: '/admin/login', name: ADMIN_ROUTE.login, component: () => import('./auth/views/AdminLogin.vue') },
  { path: '/admin/forgot-password', name: ADMIN_ROUTE.forgotPassword, component: () => import('./auth/views/AdminForgotPassword.vue') },
  { path: '/admin/403', name: ADMIN_ROUTE.forbidden, component: () => import('./auth/views/AdminForbidden.vue'), meta: { requiresAuth: true } },
  ...devPreviewRoutes,
  {
    path: '/admin',
    component: () => import('./layout/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: adminPageRoutes,
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
