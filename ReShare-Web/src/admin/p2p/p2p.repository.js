// Gọi API Kho đồ 0đ (backend/p2p-listings-api.cjs). Web không đọc/ghi `catalog_items` trực tiếp:
// phạm vi theo quận và thao tác gỡ / khôi phục đều do backend quyết định.
const defaultBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_API_BASE_URL
  ? import.meta.env.VITE_ADMIN_API_BASE_URL
  : 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

const listingPath = (id) => `/v1/admin/p2p/listings/${encodeURIComponent(id)}`

export function createP2pRepository({ apiBase = defaultBase, authInstance = null, fetchImpl = fetch } = {}) {
  async function token() {
    const auth = authInstance || (await import('../auth/firebase.js')).auth
    if (!auth?.currentUser) throw Object.assign(new Error('Vui lòng đăng nhập lại.'), { status: 401 })
    return auth.currentUser.getIdToken()
  }

  async function request(path, options = {}) {
    const isWrite = options.method && options.method !== 'GET'
    let response
    try {
      response = await fetchImpl(`${apiBase}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${await token()}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      })
    } catch (error) {
      if (error?.status === 401) throw error
      throw Object.assign(new Error('Không thể kết nối máy chủ.'), { status: 0, code: isWrite ? 'UNCERTAIN' : 'NETWORK_ERROR' })
    }
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw Object.assign(new Error(data?.message || 'Yêu cầu không thành công.'), {
        status: response.status, code: data?.code, details: data?.details,
      })
    }
    if (!data || typeof data !== 'object') {
      throw Object.assign(new Error('Máy chủ trả dữ liệu không hợp lệ.'), { status: 0, code: isWrite ? 'UNCERTAIN' : undefined })
    }
    return data
  }

  return {
    async list() {
      const data = await request('/v1/admin/p2p/listings')
      if (!Array.isArray(data.listings) || !data.scope) throw Object.assign(new Error('Danh sách không hợp lệ.'), { status: 0 })
      return { listings: data.listings, scope: data.scope, truncated: data.truncated === true }
    },
    async detail(id) {
      const data = await request(listingPath(id))
      if (!data.listing) throw Object.assign(new Error('Chi tiết không hợp lệ.'), { status: 0 })
      return { listing: data.listing, reports: data.reports || [], history: data.history || [] }
    },
    remove: (id, expectedStatus, reason = '') => request(`${listingPath(id)}/remove`, {
      method: 'POST', body: JSON.stringify(reason.trim() ? { expectedStatus, reason: reason.trim() } : { expectedStatus }),
    }),
    restore: (id) => request(`${listingPath(id)}/restore`, { method: 'POST', body: JSON.stringify({ expectedStatus: 'removed' }) }),
  }
}

export const p2pRepository = createP2pRepository()
