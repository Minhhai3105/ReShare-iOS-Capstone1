import test from 'node:test'
import assert from 'node:assert/strict'
import { DASHBOARD_ERROR, fetchDashboardMetrics } from '../src/admin/dashboard/dashboard.service.js'

const API_BASE = 'https://api.example.test'
const authWithToken = { currentUser: { getIdToken: async () => 'token-abc' } }

function okMetrics(overrides = {}) {
  return {
    scope: { warehouseId: null, from: null, to: null },
    metrics: {
      pendingDonations: 2,
      approvedDonations: 1,
      confirmedDistributions: 3,
      inventoryAvailableByUnit: { piece: 5, kg: 3, bag: 0, box: 0, set: 0, other: 0 },
      ...overrides,
    },
    definitions: {},
  }
}

function stubFetch(body, { ok = true, status = 200 } = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: url.toString(), init })
    return { ok, status, json: async () => body }
  }
  return { fetchImpl, calls }
}

const run = (filters, stub, authInstance = authWithToken) =>
  fetchDashboardMetrics(filters, undefined,
    { apiBase: API_BASE, authInstance, fetchImpl: stub.fetchImpl })

test('US20: chỉ gửi bộ lọc có giá trị và đính kèm ID token', async () => {
  const stub = stubFetch(okMetrics())
  await run({ warehouseId: 'kho-a', dateFrom: '2026-10-01', dateTo: '2026-10-02' }, stub)
  const url = new URL(stub.calls[0].url)
  assert.equal(url.pathname, '/v1/admin/dashboard/metrics')
  assert.equal(url.searchParams.get('warehouseId'), 'kho-a')
  assert.equal(url.searchParams.get('from'), '2026-10-01')
  assert.equal(url.searchParams.get('to'), '2026-10-02')
  assert.equal(stub.calls[0].init.headers.Authorization, 'Bearer token-abc')

  const empty = stubFetch(okMetrics())
  await run({ warehouseId: '', dateFrom: '', dateTo: '' }, empty)
  assert.equal(new URL(empty.calls[0].url).search, '', 'bộ lọc rỗng không được gửi lên')
})

test('US20: chưa đăng nhập trả 401 và không gọi API', async () => {
  const stub = stubFetch(okMetrics())
  await assert.rejects(run({}, stub, { currentUser: null }), { status: 401 })
  assert.equal(stub.calls.length, 0)
})

test('US20: giữ nguyên status lỗi của API để giao diện phân biệt được', async () => {
  for (const status of [400, 403, 404, 500]) {
    const stub = stubFetch({}, { ok: false, status })
    await assert.rejects(run({}, stub), { status })
  }
})

test('US20: payload lệch contract bị từ chối thay vì hiển thị số thiếu', async () => {
  const broken = [
    ['thiếu metrics', { scope: {}, definitions: {} }],
    ['thiếu khoá other', okMetrics({ inventoryAvailableByUnit: { piece: 1, kg: 0, bag: 0, box: 0, set: 0 } })],
    ['đơn vị không phải số', okMetrics({ inventoryAvailableByUnit: { piece: '5', kg: 0, bag: 0, box: 0, set: 0, other: 0 } })],
    ['chỉ số đếm là null', okMetrics({ pendingDonations: null })],
    ['đơn vị là mảng', okMetrics({ inventoryAvailableByUnit: [1, 2, 3] })],
  ]
  for (const [label, body] of broken) {
    await assert.rejects(run({}, stubFetch(body)),
      { status: DASHBOARD_ERROR.invalidPayload }, label)
  }
})

test('US20: payload đúng thì trả nguyên vẹn, giữ cả definitions', async () => {
  const body = okMetrics()
  body.definitions.inventoryAvailableByUnit = 'Tổng delta đến hết ngày to; from không áp dụng.'
  const result = await run({}, stubFetch(body))
  assert.equal(result.metrics.pendingDonations, 2)
  assert.equal(result.metrics.inventoryAvailableByUnit.other, 0)
  assert.match(result.definitions.inventoryAvailableByUnit, /from không áp dụng/)
})

test('US20: tồn âm và nhóm other khác 0 vẫn là payload hợp lệ', async () => {
  const result = await run({}, stubFetch(okMetrics({
    inventoryAvailableByUnit: { piece: -2, kg: 0, bag: 0, box: 0, set: 0, other: 7 },
  })))
  assert.equal(result.metrics.inventoryAvailableByUnit.piece, -2)
  assert.equal(result.metrics.inventoryAvailableByUnit.other, 7)
})
