import { calculateReports, REPORT_TYPES, reportDay } from './reports.model.js'

export const REPORT_CSV_NOTICE = 'Dữ liệu mẫu — không dùng làm báo cáo chính thức'
export function csvCell(value) {
  let text = String(value ?? '')
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function buildReportsCsv(data, filters, assignment, customNotice = null) {
  // Reapply the exact same filters, permission scope and projection used on screen.
  const report = calculateReports(data, filters, assignment)
  const header = ['Chế độ dữ liệu', 'Mã bản ghi', 'Loại bản ghi', 'Thời gian gốc (ISO)', 'Ngày (Asia/Ho_Chi_Minh)', 'Kho', 'Danh mục', 'Vật phẩm', 'Số lượng', 'Đơn vị', 'Chứng từ tham chiếu', 'Từ ngày', 'Đến ngày']
  const isLive = data?.demo === false || data?.live === true || customNotice !== null
  const notice = customNotice || (isLive ? 'Dữ liệu chính thức' : REPORT_CSV_NOTICE)
  const lines = report.rows.map((row) => [
    notice, row.id, REPORT_TYPES.find((type) => type.id === row.type).label,
    row.timestamp, reportDay(row.timestamp), row.warehouseId ? data.warehouses.find((entry) => entry.id === row.warehouseId)?.name : 'Chưa phân kho',
    data.categories.find((entry) => entry.id === row.categoryId)?.name, row.item, row.quantity, row.unit,
    row.reference, filters.from, filters.to,
  ])
  return '\uFEFF' + [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
