// Lớp dữ liệu tồn kho. Hiện dùng mock khi dev; bản build báo "chưa kết nối" (chưa nối API #47).
// Tên field giữ đúng như BE (itemName, conditionId, unitId, quantityReceived, quantityAvailable,
// stockEntryId, inventoryItemId) để khi nối API không phải đổi tên.
import { MOCK_WAREHOUSES, createMockInventory, getInventoryScenario } from './inventory.mock'
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

// Màn xem chứng từ đã có: chi tiết yêu cầu quyên góp (US10). Biên bản thực nhận chỉ có màn tạo (US12)
// và phiếu nhập chưa có màn xem, nên chỉ hiển thị mã, không gắn đường dẫn.
export const DONATION_DETAIL_ROUTE = 'admin-donation-detail'

/** Nguồn nhập & chứng từ gốc của vật phẩm; `to` = null khi chưa có màn xem. */
export function getItemSources(item) {
  return [
    {
      label: 'Yêu cầu quyên góp', icon: 'heart-handshake', code: item?.donationId, linked: 'Đã liên kết', empty: 'Chưa liên kết',
      to: item?.donationId ? { name: DONATION_DETAIL_ROUTE, params: { donationId: item.donationId } } : null,
    },
    { label: 'Biên bản thực nhận', icon: 'clipboard-check', code: item?.receiptId, linked: 'Chưa hỗ trợ mở biên bản', empty: 'Chưa xác nhận', to: null },
    { label: 'Phiếu nhập kho', icon: 'file-text', code: item?.stockEntryId, linked: 'Chưa hỗ trợ xem phiếu', empty: 'Chưa tạo phiếu', to: null },
  ]
}

// Mock chỉ dùng khi dev; bản build không tham chiếu tới nên dữ liệu mẫu bị loại khỏi bundle.
const IS_MOCK = import.meta.env.DEV
const mock = IS_MOCK
  ? { ...createMockInventory(), warehouses: MOCK_WAREHOUSES, getScenario: getInventoryScenario }
  : { items: [], movements: [], vouchers: [], beneficiaries: [], warehouses: [], getScenario: () => 'normal' }
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
  const warehouse = mock.warehouses.find(({ id }) => id === warehouseId)
  return { id: warehouseId, name: warehouse?.name ?? warehouseId, area: warehouse?.area ?? '' }
}

/** Kho được chọn trong ô "Kho làm việc" theo phân công. */
export function getAccessibleWarehouses(access) {
  if (!access) return []
  if (!access.isAllWarehouses) return access.warehouseIds.map(getWarehouseInfo)
  return mock.warehouses.map(({ id }) => getWarehouseInfo(id))
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
