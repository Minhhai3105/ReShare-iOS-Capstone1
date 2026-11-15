// Gọi API Điểm tiếp nhận của backend. Không ghi thẳng Firestore: rules chặn mọi thao tác ghi vào `hubs`.
const defaultBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_API_BASE_URL
  ? import.meta.env.VITE_ADMIN_API_BASE_URL
  : 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

export function createHubRepository({ apiBase = defaultBase, authInstance = null, fetchImpl = fetch } = {}) {
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

  async function writeHub(path, payload) {
    const data = await request(path, { method: 'POST', body: JSON.stringify(payload) })
    if (!data.hub?.id) throw Object.assign(new Error('Kết quả lưu điểm tiếp nhận chưa rõ.'), { status: 0, code: 'UNCERTAIN' })
    return data.hub
  }

  const hubPath = (id) => `/v1/admin/hubs/${encodeURIComponent(id)}`

  return {
    async list() {
      const data = await request('/v1/admin/hubs')
      if (!Array.isArray(data.hubs)) throw Object.assign(new Error('Danh sách không hợp lệ.'), { status: 0 })
      return data.hubs
    },
    create: (payload) => writeHub('/v1/admin/hubs', payload),
    update: (id, payload, expectedVersion) => writeHub(`${hubPath(id)}/update`, { ...payload, expectedVersion }),
    changeStatus: (id, status, expectedVersion) => writeHub(`${hubPath(id)}/status`, { status, expectedVersion }),
  }
}

export const hubRepository = createHubRepository()
