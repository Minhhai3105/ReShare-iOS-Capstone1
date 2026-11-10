// Cấu hình điều hướng của khung quản trị: một nguồn duy nhất cho sidebar, tiêu đề trang và nút Quay lại.
import { ADMIN_ROUTE, USER_ROLE } from '../auth/auth.constants.js'

export const ADMIN_SECTIONS = Object.freeze([
  { key: 'home', label: 'Tổng quan', icon: 'dashboard', to: { name: ADMIN_ROUTE.home } },
  { key: 'donations', label: 'Tiếp nhận quyên góp', icon: 'inbox', to: { name: ADMIN_ROUTE.donationQueue } },
  { key: 'campaigns', label: 'Chiến dịch quyên góp', icon: 'heart-handshake', to: { name: ADMIN_ROUTE.campaignList }, roles: [USER_ROLE.systemAdmin] },
  { key: 'inventory', label: 'Kho hàng', icon: 'shelves', to: { name: ADMIN_ROUTE.inventory } },
  { key: 'beneficiaries', label: 'Người thụ hưởng', icon: 'users', to: { name: ADMIN_ROUTE.beneficiaryList } },
  { key: 'distribution', label: 'Xuất kho & phân phối', icon: 'warehouse', to: { name: 'admin-distribution' } },
  { key: 'reports', label: 'Báo cáo', icon: 'chart', to: { name: 'admin-reports' } },
  { key: 'staff', label: 'Nhân sự & phân quyền', icon: 'shield-check', to: { name: ADMIN_ROUTE.staff }, roles: [USER_ROLE.systemAdmin] },
  { key: 'contacts', label: 'Liên hệ từ landing', icon: 'mail', to: { name: ADMIN_ROUTE.contacts }, roles: [USER_ROLE.systemAdmin] },
])

const toHome = () => ({ name: ADMIN_ROUTE.home })
const toDonation = (route) => ({ name: 'admin-donation-detail', params: { donationId: route.params.donationId } })

// Mỗi route trong khung: thuộc mục nào trên sidebar, tiêu đề hiển thị, và trang cha khi bấm Quay lại.
export const ADMIN_PAGES = Object.freeze({
  [ADMIN_ROUTE.home]: { section: 'home', title: 'Tổng quan' },
  [ADMIN_ROUTE.donationQueue]: { section: 'donations', title: 'Tiếp nhận quyên góp', parent: toHome },
  'admin-donation-detail': { section: 'donations', title: 'Chi tiết đơn quyên góp', parent: () => ({ name: ADMIN_ROUTE.donationQueue }) },
  'admin-donation-receipt': { section: 'donations', title: 'Ghi nhận hàng thực nhận', parent: toDonation },
  'admin-donation-stock-in': { section: 'donations', title: 'Nhập kho', parent: toDonation },
  'admin-stock-entry-detail': { section: 'donations', title: 'Chi tiết phiếu nhập kho', parent: () => ({ name: ADMIN_ROUTE.donationQueue }) },
  [ADMIN_ROUTE.campaignList]: { section: 'campaigns', title: 'Chiến dịch quyên góp', parent: toHome },
  [ADMIN_ROUTE.campaignNew]: { section: 'campaigns', title: 'Tạo chiến dịch', parent: () => ({ name: ADMIN_ROUTE.campaignList }) },
  [ADMIN_ROUTE.campaignDetail]: { section: 'campaigns', title: 'Chi tiết chiến dịch', parent: () => ({ name: ADMIN_ROUTE.campaignList }) },
  [ADMIN_ROUTE.campaignEdit]: {
    section: 'campaigns',
    title: 'Sửa chiến dịch',
    parent: (route) => ({ name: ADMIN_ROUTE.campaignDetail, params: { campaignId: route.params.campaignId } }),
  },
  [ADMIN_ROUTE.inventory]: { section: 'inventory', title: 'Kho hàng', parent: toHome },
  [ADMIN_ROUTE.inventoryDetail]: { section: 'inventory', title: 'Chi tiết vật phẩm', parent: () => ({ name: ADMIN_ROUTE.inventory }) },
  [ADMIN_ROUTE.distributionDetail]: { section: 'inventory', title: 'Chi tiết phiếu xuất kho', parent: () => ({ name: ADMIN_ROUTE.inventory }) },
  [ADMIN_ROUTE.beneficiaryList]: { section: 'beneficiaries', title: 'Người thụ hưởng', parent: toHome },
  [ADMIN_ROUTE.beneficiaryNew]: { section: 'beneficiaries', title: 'Thêm người thụ hưởng', parent: () => ({ name: ADMIN_ROUTE.beneficiaryList }) },
  [ADMIN_ROUTE.beneficiaryDetail]: { section: 'beneficiaries', title: 'Hồ sơ người thụ hưởng', parent: () => ({ name: ADMIN_ROUTE.beneficiaryList }) },
  [ADMIN_ROUTE.beneficiaryEdit]: {
    section: 'beneficiaries',
    title: 'Cập nhật hồ sơ',
    parent: (route) => ({ name: ADMIN_ROUTE.beneficiaryDetail, params: { beneficiaryId: route.params.beneficiaryId } }),
  },
  'admin-distribution': { section: 'distribution', title: 'Xuất kho & phân phối', parent: toHome },
  'admin-reports': { section: 'reports', title: 'Báo cáo', parent: toHome },
  [ADMIN_ROUTE.staff]: { section: 'staff', title: 'Nhân sự & phân quyền', parent: toHome },
  [ADMIN_ROUTE.contacts]: { section: 'contacts', title: 'Liên hệ từ landing', parent: toHome },
})

export function visibleSections(role) {
  return ADMIN_SECTIONS.filter((section) => !section.roles || section.roles.includes(role))
}

export function pageFor(routeName) {
  return ADMIN_PAGES[routeName] ?? null
}

// Trang cha cố định của route hiện tại; null nghĩa là trang gốc (không cần nút Quay lại).
export function parentLocation(route) {
  const page = pageFor(route?.name)
  return page?.parent ? page.parent(route) : null
}

// Quay lại theo lịch sử nếu trang trước nằm trong khu quản trị; nếu không có thì về trang cha cố định.
export function canGoBackInHistory(historyState) {
  const back = historyState?.back
  return typeof back === 'string' && back.startsWith('/admin') && !back.startsWith('/admin/login')
}
