import test from 'node:test'
import assert from 'node:assert/strict'
import { createLiveInventorySource } from '../src/admin/inventory/inventory.live.js'

// fetch giả: trả theo pathname + query, ghi lại từng URL đã gọi để kiểm tham số.
function setup(routes) {
  const calls = []
  const fetchImpl = async (href, init) => {
    const url = new URL(href)
    calls.push({ url, authorization: init.headers.Authorization })
    const route = routes[`${url.pathname}?stock=${url.searchParams.get('stock') ?? ''}`] ?? routes[url.pathname]
    const [status, body] = typeof route === 'function' ? route(url) : route ?? [404, {}]
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }
  const source = createLiveInventorySource({ apiBase: 'https://api.test', getToken: async () => 'token-1', fetchImpl })
  return { source, calls }
}

const item = (id, quantityAvailable, extra = {}) => ({
  id, warehouseId: 'wh_dn_02', itemName: `Vật phẩm ${id}`, unitId: 'piece', quantityAvailable, stockEntryId: `ste_${id}`, ...extra,
})

test('Danh sách: gửi bộ lọc lên API, số đếm lấy từ "Tất cả", tab khác gọi riêng theo stock', async () => {
  const { source, calls } = setup({
    '/v1/admin/inventory?stock=all': [200, { items: [item('a', 2), item('b', 0), item('c', 1)], nextCursor: null }],
    '/v1/admin/inventory?stock=out_of_stock': [200, { items: [item('b', 0)], nextCursor: null }],
  })
  const result = await source.listInventory({ warehouseId: 'wh_dn_02', search: ' ao ', category: 'clothing', condition: '', stock: 'out_of_stock' })
  assert.deepEqual(result.counts, { all: 3, in_stock: 2, out_of_stock: 1 })
  assert.deepEqual(result.items.map(({ id }) => id), ['b'])
  const first = calls[0].url.searchParams
  assert.equal(first.get('warehouseId'), 'wh_dn_02')
  assert.equal(first.get('search'), 'ao')
  assert.equal(first.get('category'), 'clothing')
  assert.equal(first.has('condition'), false, 'bộ lọc rỗng không gửi lên')
  assert.equal(first.get('limit'), '50')
  assert.equal(calls[0].authorization, 'Bearer token-1')
})

test('Danh sách còn trang sau thì số đếm ghi "+" thay vì báo thiếu', async () => {
  const { source, calls } = setup({
    '/v1/admin/inventory?stock=all': [200, { items: [item('a', 2), item('b', 0)], nextCursor: 'next' }],
  })
  const { counts } = await source.listInventory({ stock: 'all' })
  assert.deepEqual(counts, { all: '2+', in_stock: '1+', out_of_stock: '1+' })
  assert.equal(calls.length, 1, 'tab "Tất cả" không gọi API lần hai')
})

test('Chi tiết vật phẩm: phiếu nhập hiện mã phiếu nhập, người thao tác hiện email (thiếu thì UID)', async () => {
  const { source } = setup({
    '/v1/admin/inventory/inv-1': [200, {
      item: item('inv-1', 0),
      movements: [
        { id: 'm2', type: 'distribution', quantity: -2, voucherId: 'PX-1', actorUid: 'uid-2', actorEmail: 'kho@reshare.vn', createdAt: '2026-11-01T03:59:31Z' },
        { id: 'm1', type: 'stock_in', quantity: 2, voucherId: null, stockEntryId: 'ste_rcp_1', actorUid: 'uid-1', createdAt: '2026-10-31T19:31:00Z' },
      ],
      nextCursor: null,
    }],
  })
  const { movements } = await source.getInventoryItem('inv-1')
  assert.deepEqual(movements.map(({ voucherId, actor }) => [voucherId, actor]), [['PX-1', 'kho@reshare.vn'], ['ste_rcp_1', 'uid-1']])
})

test('Phiếu xuất: tồn trước/sau tính từ lịch sử vật phẩm; người thụ hưởng chỉ mã, tên, số lần hỗ trợ', async () => {
  const { source } = setup({
    '/v1/admin/distributions/PX-1': [200, {
      voucher: { id: 'PX-1', warehouseId: 'wh_dn_02', status: 'confirmed', lines: [{ inventoryItemId: 'inv-1', quantity: 2, unitId: 'piece' }],
        createdByUid: 'uid-2', confirmedByUid: 'uid-2', confirmedByEmail: 'kho@reshare.vn', createdAt: '2026-11-01T03:59:31Z' },
      movements: [],
      beneficiary: { id: 'ben-1', displayName: '[TEST E2E] Nguoi nhan thu', supportCount: 1 },
    }],
    '/v1/admin/inventory/inv-1': [200, {
      item: item('inv-1', 0, { itemName: 'TEST E2E' }),
      movements: [
        { id: 'm2', type: 'distribution', quantity: -2, voucherId: 'PX-1', createdAt: '2026-11-01T03:59:31Z' },
        { id: 'm1', type: 'stock_in', quantity: 2, voucherId: null, createdAt: '2026-10-31T19:31:00Z' },
      ],
      nextCursor: null,
    }],
  })
  const { voucher, beneficiary, lines } = await source.getDistributionVoucher('PX-1')
  assert.deepEqual(lines, [{ inventoryItemId: 'inv-1', itemName: 'TEST E2E', unitId: 'piece', stockEntryId: 'ste_inv-1', quantity: 2, stockBefore: 2, stockAfter: 0 }])
  assert.deepEqual(beneficiary, { id: 'ben-1', displayName: '[TEST E2E] Nguoi nhan thu', supportCount: 1 })
  assert.equal(voucher.confirmedBy, 'kho@reshare.vn')
  assert.equal(voucher.createdBy, 'uid-2', 'thiếu email thì hiện UID')
})

test('Phiếu xuất: lịch sử vật phẩm bị cắt trang hoặc không đọc được thì tồn trước/sau để trống', async () => {
  const voucher = { id: 'PX-2', warehouseId: 'wh_dn_02', lines: [{ inventoryItemId: 'inv-2', quantity: 1 }, { inventoryItemId: 'inv-gone', quantity: 1 }] }
  const { source } = setup({
    '/v1/admin/distributions/PX-2': [200, { voucher, movements: [], beneficiary: { id: 'ben-1' } }],
    '/v1/admin/inventory/inv-2': [200, { item: item('inv-2', 5), movements: [{ id: 'x', quantity: -1, voucherId: 'PX-2', createdAt: '2026-11-01T00:00:00Z' }], nextCursor: 'more' }],
    '/v1/admin/inventory/inv-gone': [404, {}],
  })
  const { lines, beneficiary } = await source.getDistributionVoucher('PX-2')
  assert.deepEqual(lines.map(({ stockBefore, stockAfter }) => [stockBefore, stockAfter]), [[null, null], [null, null]])
  assert.equal(lines[1].itemName, 'inv-gone')
  assert.equal(beneficiary.displayName, 'ben-1', 'thiếu tên thì hiện mã hồ sơ')
})

test('Mã lỗi: 401/403 → 403, 404 và 400 ở màn chi tiết → 404, còn lại và lỗi mạng → 500', async () => {
  const statusOf = (promise) => promise.then(() => 'ok', (error) => error.status)
  const { source } = setup({
    '/v1/admin/inventory?stock=all': [401, {}],
    '/v1/admin/inventory/bad': [400, {}],
    '/v1/admin/distributions/PX-404': [404, {}],
    '/v1/admin/distributions/PX-500': [500, {}],
  })
  assert.equal(await statusOf(source.listInventory({ stock: 'all' })), 403)
  assert.equal(await statusOf(source.getInventoryItem('bad')), 404)
  assert.equal(await statusOf(source.getDistributionVoucher('PX-404')), 404)
  assert.equal(await statusOf(source.getDistributionVoucher('PX-500')), 500)
  const offline = createLiveInventorySource({ apiBase: 'https://api.test', getToken: async () => 't', fetchImpl: async () => { throw new TypeError('Failed to fetch') } })
  assert.equal(await statusOf(offline.listInventory({ stock: 'all' })), 500)
})
