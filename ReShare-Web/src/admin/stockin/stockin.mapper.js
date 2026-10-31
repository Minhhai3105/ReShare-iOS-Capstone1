// Ánh xạ thuần giữa API nhập kho và model của màn hình; không phụ thuộc Firebase để kiểm thử độc lập.

// Nhãn hiển thị cho mã đơn vị/tình trạng do API phiếu thực nhận trả về.
const UNIT_LABEL = Object.freeze({ piece: 'chiếc', kg: 'kg', bag: 'túi', box: 'thùng/hộp', set: 'bộ' })
const CONDITION_LABEL = Object.freeze({ good: 'Còn tốt', 'minor-wear': 'Có hao mòn nhẹ', damaged: 'Hư hỏng cần phân loại' })
const MOVEMENT_TYPE_LABEL = Object.freeze({ stock_in: 'Nhập kho' })

export const STOCK_IN_ERROR = Object.freeze({
  forbidden: 'forbidden',
  conflict: 'conflict',
  retryable: 'retryable',
  validation: 'validation',
  auth: 'auth',
  notFound: 'not-found',
  other: 'other',
})

const RETRYABLE_STATUSES = new Set([408, 429])

// Lỗi đã phân loại để màn hình chọn hướng xử lý; status 0 là lỗi mạng.
// existingEntry chỉ có khi 409 cho biết receipt đã được nhập kho bởi request khác.
export class StockInRequestError extends Error {
  constructor(kind, message, status = 0, existingEntry = null) {
    super(message)
    this.name = 'StockInRequestError'
    this.kind = kind
    this.status = status
    this.existingEntry = existingEntry
  }
}

function toDateString(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

// Phiếu nhập đã tồn tại cho receipt (đề xuất: 409 trả stockEntryId, người và thời điểm xử lý).
export function toExistingEntry(result) {
  const id = result?.stockEntryId || result?.stockEntry?.id
  if (!id) return null
  return {
    id,
    processedBy: result.processedByEmail || result.stockEntry?.createdByEmail || '',
    processedAt: toDateString(result.processedAt || result.stockEntry?.createdAt),
  }
}

export function errorFromResponse(status, result = {}) {
  const message = result.message
  if (status === 400) return new StockInRequestError(STOCK_IN_ERROR.validation, message || 'Dữ liệu nhập kho chưa hợp lệ.', status)
  if (status === 401) return new StockInRequestError(STOCK_IN_ERROR.auth, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', status)
  if (status === 403) return new StockInRequestError(STOCK_IN_ERROR.forbidden, message || 'Bạn không có quyền nhập kho tại kho này.', status)
  if (status === 404) return new StockInRequestError(STOCK_IN_ERROR.notFound, message || 'Không tìm thấy đơn quyên góp hoặc phiếu thực nhận.', status)
  if (status === 409) {
    return new StockInRequestError(STOCK_IN_ERROR.conflict, message || 'Đơn quyên góp không còn ở trạng thái có thể nhập kho.', status, toExistingEntry(result))
  }
  if (RETRYABLE_STATUSES.has(status) || status >= 500) {
    return new StockInRequestError(STOCK_IN_ERROR.retryable, message || 'Máy chủ tạm thời chưa xử lý được yêu cầu.', status)
  }
  return new StockInRequestError(STOCK_IN_ERROR.other, message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.', status)
}

export function toDonation(data) {
  return {
    id: data.id,
    status: data.status,
    itemName: data.title || data.itemName || 'Vật phẩm quyên góp',
    declaredQuantity: data.quantity ?? null,
    declaredUnitName: UNIT_LABEL[data.unitId] || data.unitName || data.unit || '',
    expectedWarehouseId: data.warehouseId || '',
    expectedWarehouseName: data.warehouseName || '',
    stockEntryId: data.stockEntryId || '',
  }
}

export function toReceipt(data) {
  return {
    id: data.id,
    warehouseId: data.warehouseId || '',
    quantity: data.quantity,
    unitId: data.unitId || '',
    unitName: UNIT_LABEL[data.unitId] || data.unitId || '',
    conditionName: CONDITION_LABEL[data.conditionId] || data.conditionId || '',
    actorName: data.actorEmail || data.actorUid || '',
    receivedAt: toDateString(data.createdAt),
    stockEntryId: data.stockEntryId || '',
  }
}

// Client chỉ gửi tham chiếu chứng từ và thông tin lưu kho; số lượng và kho do Backend lấy từ receipt.
export function toStockInBody(payload) {
  return {
    receiptId: payload.receiptId,
    location: payload.location,
    note: payload.note,
    idempotencyKey: payload.idempotencyKey,
  }
}

export function toStockInResult(result) {
  const entry = result?.stockEntry || result || {}
  return { ...entry, replayed: result?.idempotentReplay === true }
}

function toMovement(data) {
  if (!data) return null
  return {
    id: data.id || '',
    typeName: MOVEMENT_TYPE_LABEL[data.type] || data.type || '',
    quantity: data.quantity,
    unitName: UNIT_LABEL[data.unitId] || data.unitId || '',
    warehouseName: data.warehouseName || data.warehouseId || '',
    receiptId: data.receiptId || '',
    actor: data.actorEmail || data.actorUid || '',
    createdAt: toDateString(data.createdAt),
  }
}

export function toStockEntry(data) {
  return {
    id: data.id,
    status: data.status || '',
    warehouseId: data.warehouseId || '',
    warehouseName: data.warehouseName || data.warehouseId || '',
    donationId: data.donationId || '',
    receiptId: data.receiptId || '',
    note: data.note || '',
    createdBy: data.createdByEmail || data.createdByUid || '',
    createdAt: toDateString(data.createdAt),
    confirmedBy: data.confirmedByEmail || data.confirmedByUid || '',
    confirmedAt: toDateString(data.confirmedAt),
    items: (Array.isArray(data.items) ? data.items : []).map((item, index) => ({
      id: item.id || `${data.id}-${index}`,
      name: item.itemName || item.name || '',
      quantity: item.quantity,
      unitName: UNIT_LABEL[item.unitId] || item.unitId || '',
      conditionName: CONDITION_LABEL[item.conditionId] || item.conditionId || '',
      location: item.location || '',
    })),
    movement: toMovement(data.movement),
  }
}
