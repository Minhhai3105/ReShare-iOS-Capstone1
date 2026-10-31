// Guard `import.meta.env` và cho inject phụ thuộc giống reports.repository.js, để file
// import được ngoài Vite — nếu không thì không viết được test cho phần kiểm payload.
const DEFAULT_API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_API_BASE_URL
  ? import.meta.env.VITE_ADMIN_API_BASE_URL
  : 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

const COUNT_KEYS = ['pendingDonations', 'approvedDonations', 'confirmedDistributions']
// Khớp UNIT_IDS của dashboard-api cộng nhóm 'other'. Thiếu khoá nào thì coi là lệch
// contract và báo lỗi, thà không có số còn hơn hiện số thiếu mà nhìn như đủ.
const STOCK_UNIT_KEYS = ['piece', 'kg', 'bag', 'box', 'set', 'other']

export const DASHBOARD_ERROR = Object.freeze({ invalidPayload: 'INVALID_PAYLOAD' })

async function resolveAuth(authInstance) {
  if (authInstance) return authInstance
  try {
    const mod = await import('../auth/firebase.js')
    return mod.auth
  } catch {
    return null
  }
}

export async function fetchDashboardMetrics({ warehouseId, dateFrom, dateTo }, signal, overrides = {}) {
  const { apiBase = DEFAULT_API_BASE, authInstance = null, fetchImpl = fetch } = overrides
  const authRef = await resolveAuth(authInstance)
  const token = await authRef?.currentUser?.getIdToken()
  if (!token) throw Object.assign(new Error('Sign in required'), { status: 401 })

  const url = new URL(`${apiBase}/v1/admin/dashboard/metrics`)
  if (warehouseId) url.searchParams.set('warehouseId', warehouseId)
  if (dateFrom) url.searchParams.set('from', dateFrom)
  if (dateTo) url.searchParams.set('to', dateTo)

  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal })
  if (!response.ok) throw Object.assign(new Error('Dashboard metrics unavailable'), { status: response.status })

  const payload = await response.json()
  const metrics = payload?.metrics
  const units = metrics?.inventoryAvailableByUnit
  if (!metrics || !COUNT_KEYS.every((key) => Number.isFinite(metrics[key]))
    || !units || typeof units !== 'object' || Array.isArray(units)
    || !STOCK_UNIT_KEYS.every((key) => Number.isFinite(units[key]))) {
    // Có status riêng để giao diện không khuyên "thử lại" cho một lỗi lệch contract.
    throw Object.assign(new Error('Invalid dashboard metrics response'),
      { status: DASHBOARD_ERROR.invalidPayload })
  }
  return payload
}
