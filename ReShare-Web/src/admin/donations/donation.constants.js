// Khớp DonationStatus (iOS); giá trị lưu Firestore giữ nguyên.
export const DONATION_STATUS = Object.freeze({
  pending: 'pending',
  approved: 'approved',
  received: 'received',
  inStock: 'in_stock',
  distributed: 'distributed',
  rejected: 'rejected',
})

export const DONATION_STATUS_LABEL = Object.freeze({
  [DONATION_STATUS.pending]: 'Chờ duyệt',
  [DONATION_STATUS.approved]: 'Đã duyệt',
  [DONATION_STATUS.received]: 'Đã thực nhận',
  [DONATION_STATUS.inStock]: 'Trong kho',
  [DONATION_STATUS.distributed]: 'Đã phân phối',
  [DONATION_STATUS.rejected]: 'Đã từ chối',
})

// Khớp DonationCategory (iOS).
export const DONATION_CATEGORY = Object.freeze({
  clothing: 'clothing',
  books: 'books',
  household: 'household',
})

export const DONATION_CATEGORY_LABEL = Object.freeze({
  [DONATION_CATEGORY.clothing]: 'Quần áo',
  [DONATION_CATEGORY.books]: 'Sách',
  [DONATION_CATEGORY.household]: 'Đồ gia dụng',
})

export const DONATION_SORT = Object.freeze({
  oldestFirst: 'oldest_first',
  newestFirst: 'newest_first',
})

export const DONATION_QUEUE_ERROR = Object.freeze({
  forbidden: 403,
  server: 500,
  network: 'NETWORK_ERROR',
})

export const DONATION_PAGE_SIZE = 10

export const DEFAULT_DONATION_FILTERS = Object.freeze({
  search: '',
  status: '',
  warehouseId: '',
  category: '',
  dateFrom: '',
  dateTo: '',
  sort: DONATION_SORT.oldestFirst,
})
