// Gọi API chiến dịch của backend (System Admin). Không ghi thẳng Firestore: rules chặn mọi thao tác ghi.
const defaultBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_API_BASE_URL
  ? import.meta.env.VITE_ADMIN_API_BASE_URL
  : 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

export function createCampaignRepository({ apiBase = defaultBase, authInstance = null, fetchImpl = fetch } = {}) {
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

  async function writeCampaign(path, payload) {
    const data = await request(path, { method: 'POST', body: JSON.stringify(payload) })
    if (!data.campaign?.id) throw Object.assign(new Error('Kết quả lưu chiến dịch chưa rõ.'), { status: 0, code: 'UNCERTAIN' })
    return data.campaign
  }

  const campaignPath = (id) => `/v1/admin/campaigns/${encodeURIComponent(id)}`

  return {
    async list() {
      const data = await request('/v1/admin/campaigns')
      if (!Array.isArray(data.campaigns)) throw Object.assign(new Error('Danh sách không hợp lệ.'), { status: 0 })
      return data.campaigns
    },
    async options() {
      const data = await request('/v1/admin/campaigns/options')
      if (!Array.isArray(data.hubs)) throw Object.assign(new Error('Danh sách điểm tiếp nhận không hợp lệ.'), { status: 0 })
      return data.hubs
    },
    async get(id) {
      const data = await request(campaignPath(id))
      if (!data.campaign?.id || !Array.isArray(data.donations)) throw Object.assign(new Error('Chiến dịch không hợp lệ.'), { status: 0 })
      return { campaign: data.campaign, donations: data.donations, donationsTruncated: data.donationsTruncated === true }
    },
    create: (payload) => writeCampaign('/v1/admin/campaigns', payload),
    update: (id, payload, expectedVersion) => writeCampaign(`${campaignPath(id)}/update`, { ...payload, expectedVersion }),
    changeStatus: (id, status, expectedVersion) => writeCampaign(`${campaignPath(id)}/status`, { status, expectedVersion }),
  }
}

export const campaignRepository = createCampaignRepository()
