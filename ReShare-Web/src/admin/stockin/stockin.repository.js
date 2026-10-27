import { auth } from '../auth/firebase'
import { demoStockInAdapter } from './stockin.demo'

const apiBase = (import.meta.env?.VITE_ADMIN_API_BASE_URL || 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

// Nhãn hiển thị cho mã đơn vị/tình trạng do API phiếu thực nhận trả về.
const UNIT_LABEL = Object.freeze({ piece: 'chiếc', kg: 'kg', bag: 'túi', box: 'thùng/hộp', set: 'bộ' })
const CONDITION_LABEL = Object.freeze({ good: 'Còn tốt', 'minor-wear': 'Có hao mòn nhẹ', damaged: 'Hư hỏng cần phân loại' })

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
export class StockInRequestError extends Error {
  constructor(kind, message, status = 0) {
    super(message)
    this.name = 'StockInRequestError'
    this.kind = kind
    this.status = status
  }
}

function errorFromResponse(status, message) {
  if (status === 400) return new StockInRequestError(STOCK_IN_ERROR.validation, message || 'Dữ liệu nhập kho chưa hợp lệ.', status)
  if (status === 401) return new StockInRequestError(STOCK_IN_ERROR.auth, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', status)
  if (status === 403) return new StockInRequestError(STOCK_IN_ERROR.forbidden, message || 'Bạn không có quyền nhập kho tại kho này.', status)
  if (status === 404) return new StockInRequestError(STOCK_IN_ERROR.notFound, message || 'Không tìm thấy đơn quyên góp hoặc phiếu thực nhận.', status)
  if (status === 409) return new StockInRequestError(STOCK_IN_ERROR.conflict, message || 'Đơn quyên góp không còn ở trạng thái có thể nhập kho.', status)
  if (RETRYABLE_STATUSES.has(status) || status >= 500) {
    return new StockInRequestError(STOCK_IN_ERROR.retryable, message || 'Máy chủ tạm thời chưa xử lý được yêu cầu.', status)
  }
  return new StockInRequestError(STOCK_IN_ERROR.other, message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.', status)
}

async function request(path, body, method = 'POST') {
  const user = auth?.currentUser
  if (!user) throw new StockInRequestError(STOCK_IN_ERROR.auth, 'Vui lòng đăng nhập lại để tiếp tục.')
  const token = await user.getIdToken()
  let response
  try {
    response = await fetch(`${apiBase}/v1/admin/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined || body === null ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    })
  } catch {
    throw new StockInRequestError(STOCK_IN_ERROR.retryable, 'Không thể kết nối máy chủ quản trị. Vui lòng kiểm tra mạng.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw errorFromResponse(response.status, result.message)
  return result
}

function toDateString(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export const liveStockInAdapter = {
  async getDonation(donationId) {
    const res = await request(`donations/${encodeURIComponent(donationId)}`, null, 'GET')
    const data = res.donation
    if (!data) throw new StockInRequestError(STOCK_IN_ERROR.notFound, 'Không tìm thấy đơn quyên góp.', 404)
    return {
      id: data.id,
      status: data.status,
      itemName: data.title || data.itemName || 'Vật phẩm quyên góp',
      expectedWarehouseId: data.warehouseId || '',
      expectedWarehouseName: data.warehouseName || '',
    }
  },

  async getReceipt(donationId) {
    const res = await request(`donations/${encodeURIComponent(donationId)}/receipt`, null, 'GET')
    const data = res.receipt
    if (!data) throw new StockInRequestError(STOCK_IN_ERROR.notFound, 'Phiếu thực nhận không tồn tại.', 404)
    return {
      id: data.id,
      warehouseId: data.warehouseId || '',
      quantity: data.quantity,
      unitId: data.unitId || '',
      unitName: UNIT_LABEL[data.unitId] || data.unitId || '',
      conditionName: CONDITION_LABEL[data.conditionId] || data.conditionId || '',
      actorName: data.actorEmail || data.actorUid || '',
      receivedAt: toDateString(data.createdAt),
    }
  },

  // Hợp đồng đề xuất, Backend chưa có endpoint này.
  async createStockIn(payload) {
    const res = await request(`donations/${encodeURIComponent(payload.donationId)}/stock-in`, {
      receiptId: payload.receiptId,
      warehouseId: payload.warehouseId,
      quantity: payload.quantity,
      unitId: payload.unitId,
      location: payload.location,
      note: payload.note,
      idempotencyKey: payload.idempotencyKey,
    })
    return res.stockEntry || res
  },
}

let adapter = liveStockInAdapter

export function setStockInRepository(nextAdapter) {
  adapter = nextAdapter ?? liveStockInAdapter
}

export const stockInRepository = Object.freeze({
  getDonation: (...args) => adapter.getDonation(...args),
  getReceipt: (...args) => adapter.getReceipt(...args),
  createStockIn: (...args) => adapter.createStockIn(...args),
})

// Explicitly selected by the development preview route; never selected implicitly.
export const demoStockInRepository = Object.freeze({
  getDonation: (...args) => demoStockInAdapter.getDonation(...args),
  getReceipt: (...args) => demoStockInAdapter.getReceipt(...args),
  createStockIn: (...args) => demoStockInAdapter.createStockIn(...args),
})
