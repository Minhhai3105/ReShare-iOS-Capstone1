import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

let server
let service
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)), logLevel: 'error',
    define: {
      'import.meta.env.VITE_INVENTORY_SOURCE': JSON.stringify('live'),
      'import.meta.env.VITE_ADMIN_API_BASE_URL': JSON.stringify(''),
    },
    server: { middlewareMode: true }, appType: 'custom',
  })
  service = await server.ssrLoadModule('/src/admin/inventory/inventory.service.js')
})
after(() => server?.close())

test('An unconfigured dev API fails visibly instead of returning mock inventory', async () => {
  assert.equal(service.INVENTORY_IS_MOCK, false)
  await assert.rejects(service.fetchInventory(
    { isAllWarehouses: true, warehouseIds: [] },
    { warehouseId: '', search: '', category: '', condition: '', stock: 'all' },
  ), { status: 'NOT_CONFIGURED' })
})
