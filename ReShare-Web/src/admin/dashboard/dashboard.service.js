import { auth } from '../auth/firebase.js'

const API_BASE = (import.meta.env.VITE_ADMIN_API_BASE_URL
  || 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

export async function fetchDashboardMetrics({ warehouseId, dateFrom, dateTo }, signal) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw Object.assign(new Error('Sign in required'), { status: 401 })

  const url = new URL(`${API_BASE}/v1/admin/dashboard/metrics`)
  if (warehouseId) url.searchParams.set('warehouseId', warehouseId)
  if (dateFrom) url.searchParams.set('from', dateFrom)
  if (dateTo) url.searchParams.set('to', dateTo)

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal })
  if (!response.ok) throw Object.assign(new Error('Dashboard metrics unavailable'), { status: response.status })

  const payload = await response.json()
  const metrics = payload?.metrics
  const units = metrics?.inventoryAvailableByUnit
  if (!metrics || !['pendingDonations', 'approvedDonations', 'confirmedDistributions']
    .every((key) => Number.isFinite(metrics[key]))
    || !units || Array.isArray(units) || typeof units !== 'object'
    || !['piece', 'kg', 'bag', 'box', 'set', 'other'].every((key) => Number.isFinite(units[key]))) {
    throw new Error('Invalid dashboard metrics response')
  }
  return payload
}
