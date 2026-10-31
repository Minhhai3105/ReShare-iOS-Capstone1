const defaultBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_API_BASE_URL
  ? import.meta.env.VITE_ADMIN_API_BASE_URL
  : 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

export function createBeneficiaryRepository({ apiBase = defaultBase, authInstance = null, fetchImpl = fetch } = {}) {
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
    if (!data && response.ok) {
      throw Object.assign(new Error('Không đọc được kết quả từ máy chủ.'), { status: 0, code: isWrite ? 'UNCERTAIN' : 'NETWORK_ERROR' })
    }
    if (!response.ok) {
      throw Object.assign(new Error(data?.message || 'Yêu cầu không thành công.'), {
        status: response.status, code: data?.code, details: data?.details,
      })
    }
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      throw Object.assign(new Error('Máy chủ trả dữ liệu không hợp lệ.'), { status: 0 })
    }
    return data
  }

  async function writeProfile(path, method, payload) {
    const data = await request(path, { method, body: JSON.stringify(payload) })
    if (!data.beneficiary?.id) {
      throw Object.assign(new Error('Kết quả ghi hồ sơ chưa rõ.'), { status: 0, code: 'UNCERTAIN' })
    }
    return data
  }

  return {
    async list({ warehouseId, search, cursor } = {}) {
      const params = new URLSearchParams({ limit: '25' })
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (search) params.set('search', search)
      if (cursor) params.set('cursor', cursor)
      const data = await request(`/v1/admin/beneficiaries?${params}`)
      if (!Array.isArray(data.items)) throw Object.assign(new Error('Danh sách không hợp lệ.'), { status: 0 })
      return { beneficiaries: data.items, nextCursor: data.nextCursor || null }
    },
    async get(id, { cursor } = {}) {
      const path = `/v1/admin/beneficiaries/${encodeURIComponent(id)}`
      const data = await request(cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path)
      if (!data.beneficiary?.id || !Array.isArray(data.supportHistory)) {
        throw Object.assign(new Error('Hồ sơ không hợp lệ.'), { status: 0 })
      }
      return {
        beneficiary: data.beneficiary,
        history: {
          supportCount: data.supportCount,
          vouchers: data.supportHistory.map(voucher => ({
            id: voucher.voucherId, confirmedAt: voucher.confirmedAt, lines: voucher.lines,
          })),
          nextCursor: data.nextCursor || null,
        },
      }
    },
    create: profile => writeProfile('/v1/admin/beneficiaries', 'POST', profile),
    update: (id, profile) => {
      const { warehouseId: _warehouseId, ...fields } = profile
      return writeProfile(`/v1/admin/beneficiaries/${encodeURIComponent(id)}/update`, 'POST', fields)
    },
    decide: (id, decision, reason, expectedVersion) => writeProfile(`/v1/admin/beneficiaries/${encodeURIComponent(id)}/verify`,
      'POST', { status: decision, reason, expectedVersion }),
  }
}

export const beneficiaryRepository = createBeneficiaryRepository()
