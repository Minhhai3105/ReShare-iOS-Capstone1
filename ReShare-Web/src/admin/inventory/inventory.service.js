// Lớp dữ liệu tồn kho. Hiện dùng mock khi dev; khi có API/Firestore chỉ thay phần thân hàm,
// giữ chữ ký và dạng kết quả để giao diện không phải sửa.
import { MOCK_WAREHOUSES, createMockInventory, getInventoryScenario } from './inventory.mock'
import { normalizeText } from '../shared/text.js'

export const INVENTORY_ERROR = Object.freeze({
  forbidden: 403,
  notFound: 404,
  server: 500,
  notConfigured: 'NOT_CONFIGURED',
})

export const STOCK_FILTER = Object.freeze({ all: 'all', inStock: 'in_stock', outOfStock: 'out_of_stock' })

// Khớp ItemCondition (iOS).
export const CONDITION_LABEL = Object.freeze({
  new: 'Mới 100%',
  like_new: 'Như mới (95%)',
  good: 'Còn tốt',
  fair: 'Dùng được',
})

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
    { label: 'Phiếu nhập kho', icon: 'file-text', code: item?.stockInVoucherId, linked: 'Chưa hỗ trợ xem phiếu', empty: 'Chưa tạo phiếu', to: null },
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

// AC1: số còn = tổng các biến động đã xác nhận, không đọc từ một ô số lưu sẵn.
function withStock(item) {
  const movements = mock.movements.filter(({ itemId }) => itemId === item.id)
  return {
    ...item,
    remainingQuantity: movements.reduce((sum, { quantity }) => sum + quantity, 0),
    updatedAt: movements.at(-1).createdAt,
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
      (!condition || item.condition === condition) &&
      (!keyword || normalizeText(`${item.name} ${item.id} ${item.stockInVoucherId}`).includes(keyword)))
    .map(withStock)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const inStockCount = matched.filter(({ remainingQuantity }) => remainingQuantity > 0).length
  const counts = { all: matched.length, in_stock: inStockCount, out_of_stock: matched.length - inStockCount }
  const items = stock === STOCK_FILTER.all
    ? matched
    : matched.filter(({ remainingQuantity }) => (remainingQuantity > 0) === (stock === STOCK_FILTER.inStock))
  return { items, counts }
}

/** @returns { item, movements } — movements mới nhất trước. */
export async function fetchInventoryItem(access, itemId) {
  await simulateRequest(access)
  const item = mock.items.find(({ id }) => id === itemId)
  if (!item) throw createError(INVENTORY_ERROR.notFound)
  if (!canView(access, item.warehouseId)) throw createError(INVENTORY_ERROR.forbidden)
  const movements = mock.movements.filter((movement) => movement.itemId === itemId).reverse()
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
  const lines = voucher.lines.map(({ itemId, quantity }) => {
    const item = mock.items.find(({ id }) => id === itemId)
    const itemMovements = mock.movements.filter((movement) => movement.itemId === itemId)
    const index = itemMovements.findIndex((movement) => movement.voucherId === voucher.id)
    const stockBefore = itemMovements.slice(0, index).reduce((sum, movement) => sum + movement.quantity, 0)
    return {
      itemId,
      name: item.name,
      unit: item.unit,
      stockInVoucherId: item.stockInVoucherId,
      quantity,
      stockBefore,
      stockAfter: stockBefore + itemMovements[index].quantity,
    }
  })
  return {
    voucher: { ...voucher, warehouse: getWarehouseInfo(voucher.warehouseId) },
    beneficiary: { id: beneficiary.id, displayName: beneficiary.displayName, supportCount },
    lines,
  }
}
