// Lớp dữ liệu tồn kho. Khi dev dùng mock; bản build đọc API thật qua inventory.live.js
// (inventory-api #47, distribution-history-api #48). Tên field giữ đúng như BE (itemName, conditionId,
// unitId, quantityReceived, quantityAvailable, stockEntryId, inventoryItemId).
import { ref } from 'vue'
import { MOCK_WAREHOUSES, createMockInventory, getInventoryScenario } from './inventory.mock'
import { createLiveInventorySource } from './inventory.live.js'
import { normalizeText } from '../shared/text.js'

export const INVENTORY_ERROR = Object.freeze({
  forbidden: 403,
  notFound: 404,
  server: 500,
  notConfigured: 'NOT_CONFIGURED',
})

export const STOCK_FILTER = Object.freeze({ all: 'all', inStock: 'in_stock', outOfStock: 'out_of_stock' })

// Tình trạng nhân sự ghi khi thực nhận (receipt-api, US12), kho giữ nguyên giá trị này;
// khác ItemCondition (iOS) là tình trạng donor tự khai.
export const CONDITION_LABEL = Object.freeze({
  good: 'Còn tốt',
  'minor-wear': 'Có hao mòn nhẹ',
  damaged: 'Hư hỏng cần phân loại',
})

// Đơn vị của biên bản thực nhận (US12); kho lưu mã unitId.
export const UNIT_LABEL = Object.freeze({ piece: 'chiếc', kg: 'kg', bag: 'túi', box: 'thùng/hộp', set: 'bộ' })

export const MOVEMENT_TYPE_LABEL = Object.freeze({
  stock_in: 'Nhập kho',
  distribution: 'Phân phối',
  adjustment: 'Điều chỉnh',
})

export const VOUCHER_STATUS_LABEL = Object.freeze({
  confirmed: 'Đã xác nhận bàn giao',
  pending: 'Chờ xác nhận',
})

// Màn xem chứng từ đã có: chi tiết yêu cầu quyên góp (US10) và chi tiết phiếu nhập kho (US13).
// Biên bản thực nhận chỉ có màn tạo (US12) nên chỉ hiển thị mã, không gắn đường dẫn.
export const DONATION_DETAIL_ROUTE = 'admin-donation-detail'
export const STOCK_ENTRY_DETAIL_ROUTE = 'admin-stock-entry-detail'

/**
 * Nguồn nhập & chứng từ gốc của vật phẩm; `to` = null khi chưa có màn xem.
 * Phiếu nhập chỉ mở với dữ liệu thật: mã phiếu trong dữ liệu mẫu không có trên máy chủ.
 */
export function getItemSources(item, live = !IS_MOCK) {
  return [
    {
      label: 'Yêu cầu quyên góp', icon: 'heart-handshake', code: item?.donationId, linked: 'Đã liên kết', empty: 'Chưa liên kết',
      to: item?.donationId ? { name: DONATION_DETAIL_ROUTE, params: { donationId: item.donationId } } : null,
    },
    { label: 'Biên bản thực nhận', icon: 'clipboard-check', code: item?.receiptId, linked: 'Chưa hỗ trợ mở biên bản', empty: 'Chưa xác nhận', to: null },
    {
      label: 'Phiếu nhập kho', icon: 'file-text', code: item?.stockEntryId,
      linked: live ? 'Đã liên kết' : 'Dữ liệu mẫu: chưa mở phiếu', empty: 'Chưa tạo phiếu',
      to: live && item?.stockEntryId ? { name: STOCK_ENTRY_DETAIL_ROUTE, params: { entryId: item.stockEntryId } } : null,
    },
  ]
}

// Mock chỉ dùng khi dev; bản build không tham chiếu tới nên dữ liệu mẫu bị loại khỏi bundle.
const IS_MOCK = import.meta.env.DEV
const mock = IS_MOCK
  ? { ...createMockInventory(), warehouses: MOCK_WAREHOUSES, getScenario: getInventoryScenario }
  : { items: [], movements: [], vouchers: [], beneficiaries: [], warehouses: [], getScenario: () => 'normal' }
// Bản build: tên kho đọc theo phạm vi quyền (như hàng đợi donation). Ref để ô "Kho làm việc"
// và tên kho trên các dòng tự cập nhật khi danh sách tải xong.
const liveWarehouses = ref([])
let liveWarehousesKey = ''
let liveWarehousesLoad = null
let live = null

function liveSource() {
  live ||= createLiveInventorySource({
    apiBase: (import.meta.env.VITE_ADMIN_API_BASE_URL || 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, ''),
    getToken: async () => {
      const { auth } = await import('../auth/firebase.js')
      if (!auth.currentUser) throw createError(INVENTORY_ERROR.forbidden)
      return auth.currentUser.getIdToken()
    },
  })
  return live
}

function ensureWarehouses(access) {
  if (IS_MOCK || !access) return Promise.resolve()
  const key = JSON.stringify([access.isAllWarehouses, access.warehouseIds])
  if (key !== liveWarehousesKey) {
    liveWarehousesKey = key
    liveWarehousesLoad = import('../donations/donation.service.js')
      .then(({ fetchQueueWarehouses }) => fetchQueueWarehouses(access))
      .then((warehouses) => { if (key === liveWarehousesKey) liveWarehouses.value = warehouses })
      // Không có tên kho thì hiện mã kho; lần sau đổi phạm vi sẽ thử tải lại.
      .catch(() => { if (key === liveWarehousesKey) liveWarehousesKey = '' })
  }
  return liveWarehousesLoad
}

const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
const hourFormatter = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' })

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return `${dateFormatter.format(date)} ${hourFormatter.format(date)}`
}

const createError = (status) => Object.assign(new Error(String(status)), { status })
const canView = (access, warehouseId) => access.isAllWarehouses || access.warehouseIds.includes(warehouseId)

async function simulateRequest(access) {
  if (!access) throw createError(INVENTORY_ERROR.forbidden)
  if (!IS_MOCK) throw createError(INVENTORY_ERROR.notConfigured)
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 300))
  if (mock.getScenario() === 'error') throw createError(INVENTORY_ERROR.server)
}

export function getWarehouseInfo(warehouseId) {
  const warehouse = (IS_MOCK ? mock.warehouses : liveWarehouses.value).find(({ id }) => id === warehouseId)
  return { id: warehouseId, name: warehouse?.name ?? warehouseId, area: warehouse?.area ?? '' }
}

/** Kho được chọn trong ô "Kho làm việc" theo phân công. */
export function getAccessibleWarehouses(access) {
  if (!access) return []
  ensureWarehouses(access)
  if (!access.isAllWarehouses) return access.warehouseIds.map(getWarehouseInfo)
  return (IS_MOCK ? mock.warehouses : liveWarehouses.value).map(({ id }) => getWarehouseInfo(id))
}

// Kiểm quyền phía client trước khi gọi API, giống mock; API vẫn kiểm lại theo phân công thật.
async function liveRequest(access, warehouseId, load) {
  if (!access) throw createError(INVENTORY_ERROR.forbidden)
  if (warehouseId && !canView(access, warehouseId)) throw createError(INVENTORY_ERROR.forbidden)
  const [result] = await Promise.all([load(liveSource()), ensureWarehouses(access)])
  return result
}

// AC1: số còn là quantityAvailable do BE cập nhật nguyên tử cùng mỗi biến động; FE không tự cộng.
// Mock không có ô đó nên tính bằng tổng biến động để luôn khớp lịch sử.
function withStock(item) {
  const movements = mock.movements.filter(({ inventoryItemId }) => inventoryItemId === item.id)
  return {
    ...item,
    quantityAvailable: movements.reduce((sum, { quantity }) => sum + quantity, 0),
    updatedAt: movements.at(-1)?.createdAt ?? null,
    warehouse: getWarehouseInfo(item.warehouseId),
  }
}

/** @returns { items, counts: { all, in_stock, out_of_stock } } */
export async function fetchInventory(access, { warehouseId, search, category, condition, stock }) {
  if (!IS_MOCK) {
    const { items, counts } = await liveRequest(access, warehouseId,
      (source) => source.listInventory({ warehouseId, search, category, condition, stock }))
    return { items: items.map((item) => ({ ...item, warehouse: getWarehouseInfo(item.warehouseId) })), counts }
  }
  await simulateRequest(access)
  // AC2: từ chối khi request chỉ định kho ngoài phân công, kể cả sửa URL thủ công.
  if (warehouseId && !canView(access, warehouseId)) throw createError(INVENTORY_ERROR.forbidden)

  const keyword = normalizeText(search ?? '')
  const source = mock.getScenario() === 'empty' ? [] : mock.items
  const matched = source
    .filter((item) =>
      canView(access, item.warehouseId) &&
      (!warehouseId || item.warehouseId === warehouseId) &&
      (!category || item.category === category) &&
      (!condition || item.conditionId === condition) &&
      (!keyword || normalizeText(`${item.itemName} ${item.id} ${item.stockEntryId}`).includes(keyword)))
    .map(withStock)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))

  const inStockCount = matched.filter(({ quantityAvailable }) => quantityAvailable > 0).length
  const counts = { all: matched.length, in_stock: inStockCount, out_of_stock: matched.length - inStockCount }
  const items = stock === STOCK_FILTER.all
    ? matched
    : matched.filter(({ quantityAvailable }) => (quantityAvailable > 0) === (stock === STOCK_FILTER.inStock))
  return { items, counts }
}

/** @returns { item, movements } — movements mới nhất trước. */
export async function fetchInventoryItem(access, itemId) {
  if (!IS_MOCK) {
    const { item, movements } = await liveRequest(access, '', (source) => source.getInventoryItem(itemId))
    if (!canView(access, item.warehouseId)) throw createError(INVENTORY_ERROR.forbidden)
    return { item: { ...item, warehouse: getWarehouseInfo(item.warehouseId) }, movements }
  }
  await simulateRequest(access)
  const item = mock.items.find(({ id }) => id === itemId)
  if (!item) throw createError(INVENTORY_ERROR.notFound)
  if (!canView(access, item.warehouseId)) throw createError(INVENTORY_ERROR.forbidden)
  const movements = mock.movements.filter((movement) => movement.inventoryItemId === itemId).reverse()
  return { item: withStock(item), movements }
}

/**
 * Chi tiết phiếu xuất (US17). Mỗi dòng kèm tồn trước/sau tính từ biến động tại thời điểm xuất.
 * Người thụ hưởng chỉ trả mã hồ sơ, tên hiển thị và số lần hỗ trợ tại kho.
 * @returns { voucher, beneficiary, lines }
 */
export async function fetchDistributionVoucher(access, voucherId) {
  if (!IS_MOCK) {
    const result = await liveRequest(access, '', (source) => source.getDistributionVoucher(voucherId))
    if (!canView(access, result.voucher.warehouseId)) throw createError(INVENTORY_ERROR.forbidden)
    return { ...result, voucher: { ...result.voucher, warehouse: getWarehouseInfo(result.voucher.warehouseId) } }
  }
  await simulateRequest(access)
  const voucher = mock.vouchers.find(({ id }) => id === voucherId)
  if (!voucher) throw createError(INVENTORY_ERROR.notFound)
  if (!canView(access, voucher.warehouseId)) throw createError(INVENTORY_ERROR.forbidden)

  const beneficiary = mock.beneficiaries.find(({ id }) => id === voucher.beneficiaryId)
  const supportCount = mock.vouchers.filter(
    ({ beneficiaryId, warehouseId }) => beneficiaryId === voucher.beneficiaryId && warehouseId === voucher.warehouseId,
  ).length
  const lines = voucher.lines.map(({ inventoryItemId, quantity }) => {
    const item = mock.items.find(({ id }) => id === inventoryItemId)
    const itemMovements = mock.movements.filter((movement) => movement.inventoryItemId === inventoryItemId)
    const index = itemMovements.findIndex((movement) => movement.voucherId === voucher.id)
    // Thiếu vật phẩm hoặc biến động của phiếu thì để trống (giao diện hiện "—") thay vì làm hỏng cả màn.
    const stockBefore = index < 0 ? null : itemMovements.slice(0, index).reduce((sum, movement) => sum + movement.quantity, 0)
    return {
      inventoryItemId,
      itemName: item?.itemName ?? inventoryItemId,
      unitId: item?.unitId ?? '',
      stockEntryId: item?.stockEntryId ?? '',
      quantity,
      stockBefore,
      stockAfter: index < 0 ? null : stockBefore + itemMovements[index].quantity,
    }
  })
  return {
    voucher: { ...voucher, warehouse: getWarehouseInfo(voucher.warehouseId) },
    beneficiary: beneficiary ? { id: beneficiary.id, displayName: beneficiary.displayName, supportCount } : null,
    lines,
  }
}
