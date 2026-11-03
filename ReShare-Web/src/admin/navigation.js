import { ADMIN_ROUTE, USER_ROLE } from './auth/auth.constants.js'

// Một nguồn route cho các sidebar; quyền dữ liệu vẫn được kiểm tra ở router/API.
export function adminNavigation(role) {
  if (![USER_ROLE.systemAdmin, USER_ROLE.warehouseAdmin].includes(role)) return []
  return [
    { key: 'home', label: 'Tổng quan', icon: 'grid', authIcon: 'dashboard', to: { name: ADMIN_ROUTE.home } },
    { key: 'donations', label: 'Yêu cầu quyên góp', icon: 'donation', authIcon: 'inbox', to: { name: ADMIN_ROUTE.donationQueue } },
    { key: 'inventory', label: 'Kho hàng', icon: 'box', authIcon: 'shelves', to: { name: ADMIN_ROUTE.inventory } },
    { key: 'distribution', label: 'Xuất kho & phân phối', icon: 'box', authIcon: 'warehouse', to: { name: 'admin-distribution' } },
    { key: 'beneficiaries', label: 'Người thụ hưởng', icon: 'users', authIcon: 'users', to: { name: ADMIN_ROUTE.beneficiaryList } },
    { key: 'reports', label: 'Báo cáo', icon: 'chart', authIcon: 'chart', to: { name: 'admin-reports' } },
    ...(role === USER_ROLE.systemAdmin
      ? [{ key: 'staff', label: 'Nhân sự & phân quyền', icon: 'shield', authIcon: 'users', to: { name: ADMIN_ROUTE.staff } }]
      : []),
  ]
}
