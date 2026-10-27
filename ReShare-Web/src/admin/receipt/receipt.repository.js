import { auth } from '../auth/firebase'
import { demoReceiptAdapter } from './receipt.demo'

const apiBase = (import.meta.env?.VITE_ADMIN_API_BASE_URL || 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

export const RECEIPT_ERROR = Object.freeze({
  forbidden: 'forbidden',
  conflict: 'conflict',
  retryable: 'retryable',
  auth: 'auth',
  notFound: 'not-found',
  other: 'other',
})

const RETRYABLE_STATUSES = new Set([408, 429])

// Lỗi đã phân loại để màn hình chọn hướng xử lý; status 0 là lỗi mạng.
export class ReceiptRequestError extends Error {
  constructor(kind, message, status = 0) {
    super(message)
    this.name = 'ReceiptRequestError'
    this.kind = kind
    this.status = status
  }
}

function errorFromResponse(status, message) {
  if (status === 401) return new ReceiptRequestError(RECEIPT_ERROR.auth, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', status)
  if (status === 403) return new ReceiptRequestError(RECEIPT_ERROR.forbidden, message || 'Bạn không có quyền thao tác tại kho này.', status)
  if (status === 404) return new ReceiptRequestError(RECEIPT_ERROR.notFound, message || 'Không tìm thấy đơn quyên góp.', status)
  if (status === 409) return new ReceiptRequestError(RECEIPT_ERROR.conflict, message || 'Đơn quyên góp không còn ở trạng thái hợp lệ.', status)
  if (RETRYABLE_STATUSES.has(status) || status >= 500) {
    return new ReceiptRequestError(RECEIPT_ERROR.retryable, message || 'Máy chủ tạm thời chưa xử lý được yêu cầu.', status)
  }
  return new ReceiptRequestError(RECEIPT_ERROR.other, message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.', status)
}

async function request(path, body, method = 'POST') {
  const user = auth?.currentUser
  if (!user) throw new ReceiptRequestError(RECEIPT_ERROR.auth, 'Vui lòng đăng nhập lại để tiếp tục.')
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
    throw new ReceiptRequestError(RECEIPT_ERROR.retryable, 'Không thể kết nối máy chủ quản trị. Vui lòng kiểm tra mạng.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw errorFromResponse(response.status, result.message)
  return result
}

export const liveReceiptAdapter = {
  async getDonation(donationId) {
    const res = await request(`donations/${encodeURIComponent(donationId)}`, null, 'GET')
    const data = res.donation
    if (!data) throw new Error('Không tìm thấy đơn quyên góp.')
    return {
      id: data.id,
      status: data.status,
      itemName: data.title || data.itemName || 'Vật phẩm quyên góp',
      donorName: data.donor?.name || data.donorName || data.donorId || 'Người gửi',
      declaredQuantity: data.quantity ?? 1,
      declaredUnitName: data.unitName || data.unit || 'chiếc',
      expectedWarehouseId: data.warehouseId || '',
      expectedWarehouseName: data.warehouseName || '',
      declaredConditionName: data.condition || 'Chưa phân loại',
    }
  },

  async getOptions() {
    const res = await request('warehouses', null, 'GET')
    const warehouses = res.warehouses || []

    return {
      warehouses,
      units: [
        { id: 'piece', name: 'chiếc' },
        { id: 'kg', name: 'kg' },
        { id: 'bag', name: 'túi' },
        { id: 'box', name: 'thùng/hộp' },
        { id: 'set', name: 'bộ' },
      ],
      conditions: [
        { id: 'good', name: 'Còn tốt' },
        { id: 'minor-wear', name: 'Có hao mòn nhẹ' },
        { id: 'damaged', name: 'Hư hỏng cần phân loại' },
      ],
    }
  },

  async createReceipt(payload) {
    const res = await request(`donations/${encodeURIComponent(payload.donationId)}/receipt`, {
      warehouseId: payload.warehouseId,
      quantity: payload.quantity,
      unitId: payload.unitId,
      conditionId: payload.conditionId,
      note: payload.note,
      actorId: payload.actorId,
    })
    return res.receipt || res
  },
}

let adapter = liveReceiptAdapter

export function setReceiptRepository(nextAdapter) {
  adapter = nextAdapter ?? liveReceiptAdapter
}

export const receiptRepository = Object.freeze({
  getDonation: (...args) => adapter.getDonation(...args),
  getOptions: (...args) => adapter.getOptions(...args),
  createReceipt: (...args) => adapter.createReceipt(...args),
})

// Explicitly selected by the development preview route; never selected implicitly.
export const demoReceiptRepository = Object.freeze({
  getDonation: (...args) => demoReceiptAdapter.getDonation(...args),
  getOptions: (...args) => demoReceiptAdapter.getOptions(...args),
  createReceipt: (...args) => demoReceiptAdapter.createReceipt(...args),
})
