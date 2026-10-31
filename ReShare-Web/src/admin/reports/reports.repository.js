import { reportFixtures } from './reports.mock.js'
import { allowedWarehouseIds, projectInventory, projectSource } from './reports.model.js'
import { mockError } from '../lq-errors.js'

// Replace this adapter with authenticated API reads later. Never fall back to mock on API errors.
// A real API must apply authorization server-side before sending any source records.
export function createMockReportsRepository({ delayMs = 220, scenario = 'normal' } = {}) {
  return {
    async load({ assignment, signal } = {}) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      await new Promise((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, delayMs)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (scenario === 'error') throw new Error('Không thể tải báo cáo mẫu. Vui lòng thử lại.')
      if (['FORBIDDEN', 'UNAUTHENTICATED', 'STALE_DATA', 'STOCK_CONFLICT'].includes(scenario)) throw mockError(scenario)
      const ids = new Set(allowedWarehouseIds(reportFixtures, assignment))
      if (!ids.size) throw mockError('FORBIDDEN')
      return structuredClone({
        warehouses: reportFixtures.warehouses.filter((entry) => ids.has(entry.id)),
        categories: reportFixtures.categories,
        sources: scenario === 'empty' ? [] : reportFixtures.sources.filter((entry) => ids.has(entry.warehouseId)).map(projectSource),
        inventory: scenario === 'empty' ? [] : reportFixtures.inventory.filter((entry) => ids.has(entry.warehouseId)).map(projectInventory),
        snapshotAt: reportFixtures.snapshotAt,
      })
    },
  }
}

export function createLiveReportsRepository({
  apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_API_BASE_URL ? import.meta.env.VITE_ADMIN_API_BASE_URL : 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, ''),
  authInstance = null,
} = {}) {
  async function resolveAuth() {
    if (authInstance) return authInstance
    try {
      const mod = await import('../auth/firebase.js')
      return mod.auth
    } catch {
      return null
    }
  }

  return {
    async load({ assignment, filters, signal } = {}) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const authObj = await resolveAuth()
      const user = authObj?.currentUser
      if (!user) throw new Error('Vui lòng đăng nhập lại để tiếp tục.')
      const token = await user.getIdToken()
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      const params = new URLSearchParams()
      if (filters?.from) params.set('from', filters.from)
      if (filters?.to) params.set('to', filters.to)
      if (filters?.warehouseId) params.set('warehouseId', filters.warehouseId)
      if (filters?.categoryId) params.set('categoryId', filters.categoryId)

      const queryStr = params.toString() ? `?${params.toString()}` : ''
      let response
      try {
        response = await fetch(`${apiBase}/v1/admin/reports${queryStr}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal,
        })
      } catch (err) {
        if (err.name === 'AbortError') throw err
        throw new Error('Không thể kết nối máy chủ báo cáo. Vui lòng kiểm tra mạng.')
      }

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.message || 'Không thể tải báo cáo từ máy chủ.')
      }
      return result
    },
  }
}
