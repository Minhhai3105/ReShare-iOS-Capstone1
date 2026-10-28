import { reportFixtures } from './reports.mock.js'
import { allowedWarehouseIds, projectInventory, projectSource } from './reports.model.js'

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
      const ids = new Set(allowedWarehouseIds(reportFixtures, assignment))
      if (!ids.size) throw new Error('Không có kho mẫu phù hợp với quyền được phân công.')
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
