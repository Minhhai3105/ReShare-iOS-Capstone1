import test from 'node:test'
import assert from 'node:assert/strict'
import { reportFixtures } from '../src/admin/reports/reports.mock.js'
import { calculateReports, reportDay, validateReportFilters, REPORT_TYPES } from '../src/admin/reports/reports.model.js'
import { buildReportsCsv, csvCell, REPORT_CSV_NOTICE } from '../src/admin/reports/reports.csv.js'
import { createLiveReportsRepository, createMockReportsRepository } from '../src/admin/reports/reports.repository.js'
import { mapLqError } from '../src/admin/lq-errors.js'

const admin = { active: true, role: 'system_admin', warehouseIds: [] }
const staff = { active: true, role: 'warehouse_admin', warehouseIds: ['hai-chau'] }
const filters = { from: '2025-05-01', to: '2025-05-31', warehouseId: '', categoryId: '' }
const counts = (report) => report.summary.map((entry) => entry.count)

// Independent CSV parser so escaping and exported cells are checked by round trip.
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false
  const input = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (!quoted && ch === ',') { row.push(cell); cell = '' }
    else if (!quoted && ch === '\r' && input[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++ }
    else cell += ch
  }
  return rows
}

test('May report totals match independently identified source documents', () => {
  const report = calculateReports(reportFixtures, filters, admin)
  assert.deepEqual(counts(report), [6, 3, 4, 3])
  assert.equal(report.rows.length, 16)
  assert.deepEqual(report.rows.filter((row) => row.type === 'donation').map((row) => row.id).sort(), ['DEMO-D001', 'DEMO-D002', 'DEMO-D003', 'DEMO-D004', 'DEMO-D006', 'DEMO-D007'])
  assert.equal(report.rows.some((row) => row.id === 'DEMO-X-DRAFT'), false)
})

test('unassigned donation is visible only to System Admin without a warehouse filter', () => {
  const data = structuredClone(reportFixtures)
  data.sources.push({
    id: 'DON-UNASSIGNED', type: 'donation', timestamp: '2025-05-04T02:00:00Z',
    warehouseId: '', categoryId: 'clothing', item: 'Áo chưa phân kho',
    quantity: 1, unit: 'chiếc', reference: '', status: 'pending',
  })
  assert.ok(calculateReports(data, filters, admin).rows.some(row => row.id === 'DON-UNASSIGNED'))
  assert.ok(!calculateReports(data, filters, staff).rows.some(row => row.id === 'DON-UNASSIGNED'))
  assert.ok(!calculateReports(data, { ...filters, warehouseId: 'hai-chau' }, admin).rows.some(row => row.id === 'DON-UNASSIGNED'))
  const csv = parseCsv(buildReportsCsv(data, filters, admin))
  assert.ok(csv.some(row => row[1] === 'DON-UNASSIGNED' && row[5] === 'Chưa phân kho' && row[0] === REPORT_CSV_NOTICE))
  const liveCsv = parseCsv(buildReportsCsv(data, filters, admin, 'Dữ liệu chính thức'))
  assert.ok(liveCsv.some(row => row[1] === 'DON-UNASSIGNED' && row[0] === 'Dữ liệu chính thức'))
})

test('same filtered rows drive summary, daily series and source table', () => {
  for (const warehouseId of ['', 'hai-chau', 'son-tra']) {
    for (const categoryId of ['', 'clothing', 'blankets', 'household']) {
      const report = calculateReports(reportFixtures, { ...filters, warehouseId, categoryId }, admin)
      for (const type of REPORT_TYPES) {
        const ids = report.rows.filter((row) => row.type === type.id).map((row) => row.id)
        assert.equal(new Set(ids).size, ids.length)
        assert.equal(report.summary.find((entry) => entry.id === type.id).count, ids.length)
        assert.equal(report.series.reduce((sum, day) => sum + day.counts[type.id], 0), ids.length)
      }
      assert.ok(report.rows.every((row) => (!warehouseId || row.warehouseId === warehouseId) && (!categoryId || row.categoryId === categoryId)))
    }
  }
  assert.deepEqual(counts(calculateReports(reportFixtures, { ...filters, warehouseId: 'hai-chau', categoryId: 'clothing' }, admin)), [2, 1, 1, 1])
})

test('UTC+7 start/end boundaries include the whole selected day', () => {
  assert.equal(reportDay('2025-04-30T17:00:00Z'), '2025-05-01')
  assert.equal(reportDay('2025-05-31T16:59:59Z'), '2025-05-31')
  assert.equal(reportDay('2025-05-31T17:00:00Z'), '2025-06-01')
  const rows = calculateReports(reportFixtures, filters, admin).rows.map((row) => row.id)
  assert.ok(rows.includes('DEMO-D006') && rows.includes('DEMO-D007'))
  assert.ok(!rows.includes('DEMO-D005') && !rows.includes('DEMO-D008'))
  const firstDay = calculateReports(reportFixtures, { ...filters, to: '2025-05-01' }, admin)
  assert.deepEqual(counts(firstDay), [2, 0, 0, 0])
})

test('rejects missing, reversed and impossible dates or unknown category', () => {
  for (const changes of [{ from: '' }, { to: '2025-04-30' }, { from: '2025-02-30' }, { to: '2025-13-01' }, { from: '01/05/2025' }]) {
    assert.ok(validateReportFilters({ ...filters, ...changes }))
    assert.throws(() => calculateReports(reportFixtures, { ...filters, ...changes }, admin))
  }
  assert.equal(validateReportFilters(filters), '')
  assert.throws(() => calculateReports(reportFixtures, { ...filters, categoryId: 'private' }, admin))
})

test('warehouse scope applies to rows, snapshot, summary, CSV and repository', async () => {
  const report = calculateReports(reportFixtures, filters, staff)
  assert.deepEqual(counts(report), [4, 2, 3, 2])
  assert.equal(report.rows.length, 11)
  assert.ok(report.rows.every((row) => row.warehouseId === 'hai-chau'))
  assert.ok(report.stock.every((row) => row.warehouseId === 'hai-chau'))
  assert.throws(() => calculateReports(reportFixtures, { ...filters, warehouseId: 'son-tra' }, staff))
  assert.throws(() => buildReportsCsv(reportFixtures, { ...filters, warehouseId: 'son-tra' }, staff))
  const data = await createMockReportsRepository({ delayMs: 0 }).load({ assignment: staff })
  assert.deepEqual(data.warehouses.map((row) => row.id), ['hai-chau'])
  assert.ok(data.sources.every((row) => row.warehouseId === 'hai-chau'))
  assert.ok(data.inventory.every((row) => row.warehouseId === 'hai-chau'))
})

test('inactive and non-staff roles receive no data', async () => {
  for (const assignment of [{ ...staff, active: false }, { active: true, role: 'donor' }, { active: true, role: 'viewer' }, null]) {
    assert.equal(calculateReports(reportFixtures, filters, assignment).rows.length, 0)
    assert.equal(calculateReports(reportFixtures, filters, assignment).stock.length, 0)
    await assert.rejects(createMockReportsRepository({ delayMs: 0 }).load({ assignment }))
  }
})

test('current stock snapshot ignores date, retains warehouse/category scope', () => {
  const may = calculateReports(reportFixtures, filters, admin)
  const june = calculateReports(reportFixtures, { ...filters, from: '2025-06-01', to: '2025-06-30' }, admin)
  assert.notDeepEqual(counts(may), counts(june))
  assert.deepEqual(may.stock, june.stock)
  assert.equal(may.stock.length, 4)
  assert.equal(calculateReports(reportFixtures, { ...filters, warehouseId: 'hai-chau', categoryId: 'clothing' }, admin).stock.length, 1)
  assert.ok(!may.stock.some((row) => row.available === 0))
})

test('stock fixture reconciles to posted intakes and exports, not donations', () => {
  for (const stock of reportFixtures.inventory) {
    const ledger = reportFixtures.sources.filter((row) => row.status === 'confirmed' && row.warehouseId === stock.warehouseId && row.item === stock.item && row.unit === stock.unit)
    const balance = ledger.reduce((sum, row) => sum + (row.type === 'intake' ? row.quantity : row.type === 'distribution' ? -row.quantity : 0), 0)
    assert.equal(balance, stock.available)
  }
})

test('mixed quantity units stay separate and approved donation creates no intake', () => {
  const report = calculateReports(reportFixtures, filters, admin)
  const quantities = report.summary.find((entry) => entry.id === 'donation').quantities
  assert.deepEqual(Object.fromEntries(quantities.map((entry) => [entry.unit, entry.quantity])), { 'chiếc': 20, 'bộ': 2, kg: 4 })
  const isolated = structuredClone(reportFixtures)
  isolated.sources = isolated.sources.filter((row) => row.type === 'donation')
  assert.deepEqual(counts(calculateReports(isolated, filters, admin)), [6, 0, 0, 0])
})

test('CSV contains exact filtered source IDs, Vietnamese BOM and scope/date metadata', () => {
  for (const assignment of [admin, staff]) {
    const applied = { ...filters, categoryId: 'clothing' }
    const csv = buildReportsCsv(reportFixtures, applied, assignment)
    assert.equal(csv.charCodeAt(0), 0xfeff)
    assert.ok(csv.includes('Quần áo'))
    const [header, ...rows] = parseCsv(csv)
    assert.equal(header.length, 13)
    assert.deepEqual(rows.map((row) => row[1]), calculateReports(reportFixtures, applied, assignment).rows.map((row) => row.id))
    assert.ok(rows.every((row) => row.length === 13 && row[0] === REPORT_CSV_NOTICE && row[11] === filters.from && row[12] === filters.to))
    if (assignment === staff) assert.ok(rows.every((row) => row[5] === 'Kho demo Hải Châu'))
  }
})

test('PII is removed from model, repository projection and CSV; CSV escaping handles formulas and quotes', async () => {
  const data = structuredClone(reportFixtures)
  const row = data.sources[0]
  Object.assign(row, { donorName: 'PRIVATE_NAME', donorEmail: 'PRIVATE_EMAIL', phone: 'PRIVATE_PHONE', address: 'PRIVATE_ADDRESS', actor: { name: 'PRIVATE_ACTOR' } })
  row.item = '=HYPERLINK("private"),\nÁo "mẫu"'
  const report = calculateReports(data, filters, admin)
  assert.equal(JSON.stringify(report).includes('PRIVATE_'), false)
  const csv = buildReportsCsv(data, filters, admin)
  assert.equal(csv.includes('PRIVATE_'), false)
  assert.equal(parseCsv(csv).find((line) => line[1] === row.id)[7], `'${row.item}`)
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@cmd', '\t=1+1', '  =1']) assert.ok(csvCell(value).startsWith('"\''))
  assert.equal(csvCell('Áo "mẫu", xanh'), '"Áo ""mẫu"", xanh"')
  const repositoryData = await createMockReportsRepository({ delayMs: 0 }).load({ assignment: admin })
  assert.ok(repositoryData.sources.every((entry) => !('actor' in entry) && !('donorName' in entry)))
})

test('empty, failed and aborted requests do not provide fallback data', async () => {
  const empty = await createMockReportsRepository({ delayMs: 0, scenario: 'empty' }).load({ assignment: admin })
  const report = calculateReports(empty, filters, admin)
  assert.deepEqual(counts(report), [0, 0, 0, 0])
  assert.equal(report.stock.length, 0)
  await assert.rejects(createMockReportsRepository({ delayMs: 0, scenario: 'error' }).load({ assignment: admin }))
  const controller = new AbortController()
  const request = createMockReportsRepository({ delayMs: 100 }).load({ assignment: admin, signal: controller.signal })
  controller.abort()
  await assert.rejects(request, { name: 'AbortError' })
  const original = structuredClone(reportFixtures)
  const data = await createMockReportsRepository({ delayMs: 0 }).load({ assignment: admin })
  data.sources[0].quantity = 999
  assert.deepEqual(reportFixtures, original)
})

test('Live repository giữ mã lỗi để màn báo cáo hiện đúng lý do, không quy hết về lỗi kết nối', async (t) => {
  const authInstance = { currentUser: { getIdToken: async () => 'token' } }
  const repository = createLiveReportsRepository({ apiBase: 'https://api.test', authInstance })
  const respond = (status, body) => { globalThis.fetch = async () => ({ ok: false, status, json: async () => body }) }
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })

  respond(422, { message: 'Khoảng thời gian có quá nhiều bản ghi để tổng hợp trong một lần. Hãy thu hẹp khoảng ngày.', code: 'VALIDATION' })
  const tooLarge = await repository.load({ filters }).catch((error) => error)
  assert.equal(mapLqError(tooLarge).kind, 'validation')
  assert.match(mapLqError(tooLarge).message, /thu hẹp khoảng ngày/)

  respond(403, { message: 'Bạn không có quyền xem kho đã chọn.', code: 'FORBIDDEN' })
  assert.equal(mapLqError(await repository.load({ filters }).catch((error) => error)).kind, 'permission')

  respond(401, { message: 'Invalid session' })
  assert.equal(mapLqError(await repository.load({ filters }).catch((error) => error)).kind, 'session')
})

test('Báo cáo gộp mã đơn vị với nhãn cũ cùng nghĩa và hiển thị nhãn tiếng Việt', () => {
  const data = {
    warehouses: [{ id: 'hai-chau', name: 'Kho Hải Châu' }],
    categories: [{ id: 'clothing', name: 'Quần áo' }],
    inventory: [{ id: 'inv-1', warehouseId: 'hai-chau', categoryId: 'clothing', item: 'Áo', available: 3, unit: 'piece' }],
    sources: [
      { id: 'don-old', type: 'donation', timestamp: '2025-05-02T02:00:00Z', warehouseId: 'hai-chau', categoryId: 'clothing', item: 'Áo cũ', quantity: 1, unit: 'chiếc', reference: '', status: 'approved' },
      { id: 'don-new', type: 'donation', timestamp: '2025-05-03T02:00:00Z', warehouseId: 'hai-chau', categoryId: 'clothing', item: 'Áo mới', quantity: 2, unit: 'piece', reference: '', status: 'pending' },
    ],
  }
  const report = calculateReports(data, filters, admin)
  assert.deepEqual(report.summary.find((entry) => entry.id === 'donation').quantities, [{ unit: 'chiếc', quantity: 3 }])
  assert.deepEqual(report.rows.map((row) => row.unit), ['chiếc', 'chiếc'])
  assert.equal(report.stock[0].unit, 'chiếc')
  const csv = parseCsv(buildReportsCsv(data, filters, admin, 'Dữ liệu chính thức'))
  assert.ok(csv.slice(1).every((row) => row[9] === 'chiếc'), 'CSV dùng cùng nhãn đơn vị với màn hình')
})
