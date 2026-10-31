export const REPORT_TIMEZONE = 'Asia/Ho_Chi_Minh'
export const REPORT_TYPES = [
  { id: 'donation', label: 'Yêu cầu được gửi', icon: 'donation', description: 'Đếm yêu cầu quyên góp được tạo trong khoảng thời gian đã chọn.' },
  { id: 'receipt', label: 'Lượt thực nhận', icon: 'check', description: 'Đếm sự kiện xác nhận hàng vật lý thực tế tại kho.' },
  { id: 'intake', label: 'Phiếu nhập kho', icon: 'box', description: 'Đếm phiếu nhập kho đã được xác nhận ghi sổ.' },
  { id: 'distribution', label: 'Phiếu xuất kho', icon: 'box', description: 'Đếm phiếu xuất phân phối đã xác nhận cho người thụ hưởng.' },
]
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
export function reportDay(timestamp) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = Object.fromEntries(dayFormatter.formatToParts(date).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function validateReportFilters(filters) {
  const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  return !isDate(filters.from) || !isDate(filters.to) || filters.from > filters.to ? 'Hãy chọn khoảng thời gian hợp lệ (từ ngày ≤ đến ngày).' : ''
}
export function allowedWarehouseIds(data, assignment) {
  if (assignment?.active !== true) return []
  if (assignment.role === 'system_admin') return data.warehouses.map((entry) => entry.id)
  if (assignment.role !== 'warehouse_admin' || !Array.isArray(assignment.warehouseIds)) return []
  return data.warehouses.filter((entry) => assignment.warehouseIds.includes(entry.id)).map((entry) => entry.id)
}

// An allowlist prevents source documents from leaking donor/beneficiary PII.
export function projectSource(row) {
  return Object.fromEntries(['id', 'type', 'timestamp', 'warehouseId', 'categoryId', 'item', 'quantity', 'unit', 'reference', 'status'].map((key) => [key, row[key]]))
}
export function projectInventory(row) {
  return Object.fromEntries(['id', 'warehouseId', 'categoryId', 'item', 'available', 'unit'].map((key) => [key, row[key]]))
}
export function calculateReports(data, filters, assignment) {
  const error = validateReportFilters(filters)
  if (error) throw new Error(error)
  const allowed = new Set(allowedWarehouseIds(data, assignment))
  if (filters.warehouseId && !allowed.has(filters.warehouseId)) throw new Error('Bạn không có quyền xem kho đã chọn.')
  if (filters.categoryId && !data.categories.some((entry) => entry.id === filters.categoryId)) throw new Error('Danh mục không hợp lệ.')
  const inScope = (row) => (
    allowed.has(row.warehouseId) ||
    (!row.warehouseId && row.type === 'donation' && assignment?.role === 'system_admin' && assignment.active === true)
  ) && (!filters.warehouseId || row.warehouseId === filters.warehouseId) && (!filters.categoryId || row.categoryId === filters.categoryId)
  const rows = data.sources.filter((row) => {
    const day = reportDay(row.timestamp)
    const validType = REPORT_TYPES.some((type) => type.id === row.type)
    return inScope(row) && validType && (row.type === 'donation' || row.status === 'confirmed') && day && day >= filters.from && day <= filters.to
  }).map(projectSource).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id))
  const summary = REPORT_TYPES.map((type) => {
    const records = rows.filter((row) => row.type === type.id)
    const byUnit = new Map()
    for (const row of records) byUnit.set(row.unit, (byUnit.get(row.unit) || 0) + row.quantity)
    return { ...type, count: records.length, quantities: Array.from(byUnit, ([unit, quantity]) => ({ unit, quantity })) }
  })
  const days = [...new Set(rows.map((row) => reportDay(row.timestamp)))].sort()
  const series = days.map((day) => ({ day, counts: Object.fromEntries(REPORT_TYPES.map((type) => [type.id, rows.filter((row) => reportDay(row.timestamp) === day && row.type === type.id).length])) }))
  const stock = data.inventory.filter(inScope).filter((row) => row.available > 0).map(projectInventory)
  return { rows, summary, series, stock, snapshotAt: data.snapshotAt, filters: { ...filters }, demo: true }
}
