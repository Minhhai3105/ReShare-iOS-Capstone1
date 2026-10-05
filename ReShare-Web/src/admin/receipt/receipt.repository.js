import { auth, db } from '../auth/firebase'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { demoReceiptAdapter } from './receipt.demo'

const apiBase = (import.meta.env.VITE_ADMIN_API_BASE_URL || 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

async function request(path, body, method = 'POST') {
  const user = auth?.currentUser
  if (!user) throw new Error('Vui lòng đăng nhập lại để tiếp tục.')
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
    })
  } catch {
    throw new Error('Không thể kết nối máy chủ quản trị. Vui lòng kiểm tra mạng và thử lại.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    if (response.status === 403) throw new Error(result.message || 'Bạn không có quyền thao tác tại kho này.')
    if (response.status === 404) throw new Error(result.message || 'Không tìm thấy đơn quyên góp.')
    if (response.status === 409) throw new Error(result.message || 'Đơn quyên góp không ở trạng thái hợp lệ.')
    throw new Error(result.message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.')
  }
  return result
}

export const liveReceiptAdapter = {
  async getDonation(donationId) {
    try {
      const res = await request(`donations/${donationId}`, null, 'GET')
      if (res?.donation) return res.donation
    } catch (err) {
      if (db) {
        try {
          const snap = await getDoc(doc(db, 'donations', donationId))
          if (snap.exists()) {
            const data = snap.data()
            return {
              id: snap.id,
              status: data.status,
              itemName: data.title || data.itemName || 'Vật phẩm quyên góp',
              donorName: data.donorName || data.donorDisplayName || 'Người gửi ẩn danh',
              declaredQuantity: data.quantity || 1,
              declaredUnitName: data.unitName || data.unit || 'chiếc',
              expectedWarehouseId: data.warehouseId || data.hubId || '',
              expectedWarehouseName: data.warehouseName || data.hubName || 'Kho tiếp nhận',
              declaredConditionName: data.condition || 'Chưa phân loại',
            }
          }
        } catch {}
      }
      throw err
    }
  },

  async getOptions() {
    let warehouses = []
    try {
      const res = await request('warehouses', null, 'GET')
      if (res?.warehouses?.length) warehouses = res.warehouses
    } catch {
      if (db) {
        try {
          const snap = await getDocs(collection(db, 'warehouses'))
          warehouses = snap.docs.map(d => ({ id: d.id, name: d.data().name || d.id }))
        } catch {}
      }
    }

    if (!warehouses.length) {
      warehouses = [
        { id: 'demo-warehouse-hai-chau', name: 'Kho Hải Châu' },
        { id: 'demo-warehouse-son-tra', name: 'Kho Sơn Trà' },
      ]
    }

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
    const res = await request(`donations/${payload.donationId}/receipt`, {
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
