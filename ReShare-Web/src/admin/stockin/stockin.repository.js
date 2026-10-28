import { auth } from '../auth/firebase'
import { demoStockInAdapter } from './stockin.demo'
import {
  errorFromResponse,
  STOCK_IN_ERROR,
  StockInRequestError,
  toDonation,
  toReceipt,
  toStockEntry,
  toStockInBody,
  toStockInResult,
} from './stockin.mapper'

export { STOCK_IN_ERROR, StockInRequestError }

const apiBase = (import.meta.env?.VITE_ADMIN_API_BASE_URL || 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

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
  if (!response.ok) throw errorFromResponse(response.status, result)
  return result
}

export const liveStockInAdapter = {
  async getDonation(donationId) {
    const res = await request(`donations/${encodeURIComponent(donationId)}`, null, 'GET')
    if (!res.donation) throw new StockInRequestError(STOCK_IN_ERROR.notFound, 'Không tìm thấy đơn quyên góp.', 404)
    return toDonation(res.donation)
  },

  async getReceipt(donationId) {
    const res = await request(`donations/${encodeURIComponent(donationId)}/receipt`, null, 'GET')
    if (!res.receipt) throw new StockInRequestError(STOCK_IN_ERROR.notFound, 'Phiếu thực nhận không tồn tại.', 404)
    return toReceipt(res.receipt)
  },

  // Hợp đồng đề xuất, Backend chưa có endpoint này.
  async createStockIn(payload) {
    const res = await request(`donations/${encodeURIComponent(payload.donationId)}/stock-in`, toStockInBody(payload))
    return toStockInResult(res)
  },

  // Hợp đồng đề xuất cho màn hình chi tiết phiếu nhập, Backend chưa có endpoint này.
  async getStockEntry(entryId) {
    const res = await request(`stock-entries/${encodeURIComponent(entryId)}`, null, 'GET')
    if (!res.stockEntry) throw new StockInRequestError(STOCK_IN_ERROR.notFound, 'Không tìm thấy phiếu nhập kho.', 404)
    return toStockEntry(res.stockEntry)
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
  getStockEntry: (...args) => adapter.getStockEntry(...args),
})

// Explicitly selected by the development preview route; never selected implicitly.
export const demoStockInRepository = Object.freeze({
  getDonation: (...args) => demoStockInAdapter.getDonation(...args),
  getReceipt: (...args) => demoStockInAdapter.getReceipt(...args),
  createStockIn: (...args) => demoStockInAdapter.createStockIn(...args),
  getStockEntry: (...args) => demoStockInAdapter.getStockEntry(...args),
})
