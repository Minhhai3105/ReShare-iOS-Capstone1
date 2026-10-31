// Test lớp dữ liệu tồn kho (US14). Chạy trong thư mục ReShare-Web:
//   node --test src/admin/inventory/inventory.service.test.mjs
// Dùng Vite có sẵn để nạp module (import.meta.env), không cần thêm thư viện test.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const SYSTEM_ADMIN = { role: 'system_admin', warehouseIds: [], isAllWarehouses: true }
const WAREHOUSE_ADMIN = { role: 'warehouse_admin', warehouseIds: ['wh_dn_01'], isAllWarehouses: false }
const query = (overrides = {}) => ({ warehouseId: '', search: '', category: '', condition: '', stock: 'all', ...overrides })
const statusOf = (promise) => promise.then(() => 'ok', (error) => error.status)

let server
let service
let mock

before(async () => {
  server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
  service = await server.ssrLoadModule('/src/admin/inventory/inventory.service.js')
  mock = await server.ssrLoadModule('/src/admin/inventory/inventory.mock.js')
})

after(() => server.close())

describe('US14 – tồn kho', () => {
  test('AC1: số còn mỗi vật phẩm bằng tổng biến động (nhập − xuất ± điều chỉnh)', async () => {
    const { movements } = mock.createMockInventory()
    const { items } = await service.fetchInventory(SYSTEM_ADMIN, query())
    assert.equal(items.length, 12)
    for (const item of items) {
      const total = movements.filter(({ inventoryItemId }) => inventoryItemId === item.id).reduce((sum, { quantity }) => sum + quantity, 0)
      assert.equal(item.quantityAvailable, total, item.id)
      assert.ok(item.quantityAvailable >= 0, item.id)
    }
  })

  test('Tab Còn hàng / Hết hàng đếm đúng và cộng lại bằng tổng', async () => {
    const { counts } = await service.fetchInventory(SYSTEM_ADMIN, query())
    const outOfStock = await service.fetchInventory(SYSTEM_ADMIN, query({ stock: 'out_of_stock' }))
    assert.equal(counts.in_stock + counts.out_of_stock, counts.all)
    assert.equal(outOfStock.items.length, counts.out_of_stock)
    assert.ok(outOfStock.items.every(({ quantityAvailable }) => quantityAvailable === 0))
  })

  test('Warehouse Admin chỉ thấy kho được giao; System Admin thấy mọi kho', async () => {
    const own = await service.fetchInventory(WAREHOUSE_ADMIN, query())
    assert.ok(own.items.length > 0 && own.items.every(({ warehouseId }) => warehouseId === 'wh_dn_01'))
    const all = await service.fetchInventory(SYSTEM_ADMIN, query())
    assert.equal(new Set(all.items.map(({ warehouseId }) => warehouseId)).size, 3)
  })

  test('AC2: kho khác (danh sách và chi tiết) hoặc không có quyền → 403', async () => {
    assert.equal(await statusOf(service.fetchInventory(WAREHOUSE_ADMIN, query({ warehouseId: 'wh_dn_02' }))), 403)
    assert.equal(await statusOf(service.fetchInventoryItem(WAREHOUSE_ADMIN, 'vp-0006')), 403)
    assert.equal(await statusOf(service.fetchInventory(null, query())), 403)
  })

  test('AC3: phiếu nhập trong lịch sử khớp chứng từ gốc và truy được đơn + biên bản', async () => {
    const { item, movements } = await service.fetchInventoryItem(SYSTEM_ADMIN, 'vp-0002')
    const stockIn = movements.find(({ type }) => type === 'stock_in')
    assert.equal(stockIn.voucherId, item.stockEntryId)
    assert.ok(item.donationId && item.receiptId)
    assert.ok(movements.every(({ voucherId, actor, createdAt }) => voucherId && actor && createdAt))
    assert.ok(movements[0].createdAt >= movements.at(-1).createdAt, 'mới nhất trước')
  })

  test('AC3: chỉ mã yêu cầu quyên góp mở màn xem chi tiết; biên bản và phiếu nhập chỉ hiện mã, ghi chưa hỗ trợ', async () => {
    const { item } = await service.fetchInventoryItem(SYSTEM_ADMIN, 'vp-0002')
    const [donation, receipt, stockIn] = service.getItemSources(item)
    assert.deepEqual(donation.to, { name: 'admin-donation-detail', params: { donationId: item.donationId } })
    assert.equal(receipt.code, item.receiptId)
    assert.equal(receipt.to, null, 'không dẫn tới màn tạo biên bản')
    assert.match(receipt.linked, /Chưa hỗ trợ/)
    assert.equal(stockIn.to, null)
  })

  test('Tình trạng dùng đúng 3 giá trị của biên bản thực nhận (receipt-api), mọi vật phẩm đều có nhãn', async () => {
    assert.deepEqual(Object.keys(service.CONDITION_LABEL), ['good', 'minor-wear', 'damaged'])
    const { items } = await service.fetchInventory(SYSTEM_ADMIN, query())
    assert.ok(items.every(({ conditionId }) => service.CONDITION_LABEL[conditionId]))
  })

  test('Tìm theo tên không dấu, mã vật phẩm, mã phiếu nhập', async () => {
    assert.equal((await service.fetchInventory(SYSTEM_ADMIN, query({ search: 'ao khoac' }))).items.length, 1)
    assert.equal((await service.fetchInventory(SYSTEM_ADMIN, query({ search: 'VP-0003' }))).items[0].id, 'vp-0003')
    assert.equal((await service.fetchInventory(SYSTEM_ADMIN, query({ search: 'pn-0005' }))).items[0].id, 'vp-0005')
  })

  test('Lọc kết hợp kho + danh mục + tình trạng', async () => {
    const { items } = await service.fetchInventory(SYSTEM_ADMIN, query({ warehouseId: 'wh_dn_02', category: 'books', condition: 'good' }))
    assert.deepEqual(items.map(({ itemName }) => itemName), ['Từ điển Anh – Việt'])
  })

  test('Không tìm thấy → 404; lỗi máy chủ → 500; rỗng → 0 vật phẩm', async () => {
    assert.equal(await statusOf(service.fetchInventoryItem(SYSTEM_ADMIN, 'vp-9999')), 404)
    globalThis.reshareMock.setInventoryScenario('error')
    assert.equal(await statusOf(service.fetchInventory(SYSTEM_ADMIN, query())), 500)
    globalThis.reshareMock.setInventoryScenario('empty')
    assert.equal((await service.fetchInventory(SYSTEM_ADMIN, query())).counts.all, 0)
    globalThis.reshareMock.setInventoryScenario('normal')
  })
})
