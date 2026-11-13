// Gọi API xử lý báo cáo vi phạm (System Admin). Client không đọc `reports` từ Firestore được.
const defaultBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_API_BASE_URL
  ? import.meta.env.VITE_ADMIN_API_BASE_URL
  : 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

export function createModerationRepository({ apiBase = defaultBase, authInstance = null, fetchImpl = fetch } = {}) {
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
      throw Object.assign(new Error(data?.message || 'Yêu cầu không thành công.'), { status: response.status, code: data?.code })
    }
    if (!data || typeof data !== 'object') {
      throw Object.assign(new Error('Máy chủ trả dữ liệu không hợp lệ.'), { status: 0, code: isWrite ? 'UNCERTAIN' : undefined })
    }
    return data
  }

  return {
    async list(status = 'open') {
      const data = await request(`/v1/admin/moderation/reports?status=${encodeURIComponent(status)}`)
      if (!Array.isArray(data.reports)) throw Object.assign(new Error('Danh sách không hợp lệ.'), { status: 0 })
      return { reports: data.reports, truncated: data.truncated === true }
    },
    resolve: (reportId, action, note = '') => request(`/v1/admin/moderation/reports/${encodeURIComponent(reportId)}/resolve`, {
      method: 'POST', body: JSON.stringify(note.trim() ? { action, note: note.trim() } : { action }),
    }),
  }
}

export const moderationRepository = createModerationRepository()
