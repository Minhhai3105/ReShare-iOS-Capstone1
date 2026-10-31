<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import AdminIcon from './AdminIcon.vue'
import AdminChrome from './AdminChrome.vue'
import { calculateReviewMetrics } from './reviewMetrics'
import { calculateReports, REPORT_TYPES, reportDay, validateReportFilters } from './reports/reports.model.js'
import { createMockReportsRepository } from './reports/reports.repository.js'
import { buildReportsCsv } from './reports/reports.csv.js'
import { mapLqError } from './lq-errors.js'

const props = defineProps({
  items: { type: Array, default: () => [] }, role: { type: String, default: 'system_admin' },
  assignment: { type: Object, default: null }, actorName: { type: String, default: 'Nhân sự mẫu' },
  authenticatedContext: { type: Boolean, default: false },
  dataMode: { type: String, default: 'demo' },
  repository: { type: Object, default: null },
})
const isLive = computed(() => props.dataMode === 'live')
const emit = defineEmits(['navigate', 'role'])
const localRole = ref(props.role)
watch(() => props.role, (role) => { localRole.value = role })
const assignment = computed(() => props.assignment || (props.authenticatedContext
  ? { active: false, role: 'viewer', warehouseIds: [] }
  : { active: true, role: localRole.value, warehouseIds: localRole.value === 'warehouse_admin' ? ['hai-chau'] : [] }))
const displayRole = computed(() => assignment.value.role)
function onRole(role) { if (props.assignment || props.authenticatedContext) return; localRole.value = role; emit('role', role) }

function getDefaultFilters(isLive) {
  if (!isLive) {
    return { from: '2025-05-01', to: '2025-05-31', warehouseId: '', categoryId: '' }
  }
  const now = new Date()
  const vnFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
  const toParts = Object.fromEntries(vnFormatter.formatToParts(now).map(({ type, value }) => [type, value]))
  const to = `${toParts.year}-${toParts.month}-${toParts.day}`

  const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const fromParts = Object.fromEntries(vnFormatter.formatToParts(past).map(({ type, value }) => [type, value]))
  const from = `${fromParts.year}-${fromParts.month}-${fromParts.day}`

  return { from, to, warehouseId: '', categoryId: '' }
}

const filters = reactive(getDefaultFilters(isLive.value))
const applied = ref({ ...filters })
const filterError = ref('')
const loadError = ref('')
const exportError = ref('')
const loading = ref(true)
const data = ref(null)
const scenario = ref('normal')
const dialog = ref(null)
const drillType = ref('donation')
let controller
let requestId = 0

async function load() {
  const id = ++requestId
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  data.value = null
  loadError.value = ''
  exportError.value = ''
  dialog.value?.close()
  try {
    const repository = props.repository || createMockReportsRepository({ scenario: scenario.value })
    const access = assignment.value
    const response = await repository.load({
      assignment: { active: access.active, role: access.role, warehouseIds: Array.isArray(access.warehouseIds) ? [...access.warehouseIds] : [] },
      filters: applied.value,
      signal: controller.signal,
    })
    if (id !== requestId) return
    if (applied.value.warehouseId && !response.warehouses.some((entry) => entry.id === applied.value.warehouseId)) {
      applied.value = { ...applied.value, warehouseId: '' }
    }
    filters.warehouseId = applied.value.warehouseId
    data.value = response
  } catch (error) {
    if (id === requestId && error.name !== 'AbortError') {
      // RC1D-114: phân loại lỗi thay vì in error.message trần. Kịch bản preview ném
      // mockError(scenario) nên message chính là mã lỗi — hiện ra sẽ thành "FORBIDDEN".
      // report computed trả null khi có loadError, nên dữ liệu cũ đã được ẩn sẵn.
      const mapped = mapLqError(error)
      loadError.value = `${mapped.title}. ${mapped.message}`
    }
  } finally { if (id === requestId) loading.value = false }
}
watch([assignment, scenario, () => props.repository], load, { immediate: true, deep: true })
onBeforeUnmount(() => { requestId += 1; controller?.abort() })

const report = computed(() => {
  if (!data.value || loading.value || loadError.value) return null
  return calculateReports(data.value, applied.value, assignment.value)
})
const warehouseLabel = computed(() => applied.value.warehouseId
  ? data.value?.warehouses.find((entry) => entry.id === applied.value.warehouseId)?.name || 'Kho được phân công'
  : data.value?.warehouses.length === 1 ? data.value.warehouses[0].name : 'Các kho được phân quyền')
const categoryLabel = computed(() => data.value?.categories.find((entry) => entry.id === applied.value.categoryId)?.name || 'Tất cả danh mục')
const pending = computed(() => Object.keys(filters).some((key) => filters[key] !== applied.value[key]))
const maxCount = computed(() => Math.max(1, ...(report.value?.series.flatMap((entry) => Object.values(entry.counts)) || [])))
const aiMetrics = computed(() => calculateReviewMetrics(props.items, applied.value.from, applied.value.to))
const dateText = (value) => value?.split('-').reverse().join('/') || '—'
const typeLabel = (type) => REPORT_TYPES.find((entry) => entry.id === type)?.label || type
const warehouseName = (id) => id ? data.value?.warehouses.find((entry) => entry.id === id)?.name || '—' : 'Chưa phân kho'
const categoryName = (id) => data.value?.categories.find((entry) => entry.id === id)?.name || '—'
const drillRows = computed(() => drillType.value === 'stock' ? report.value?.stock || [] : report.value?.rows.filter((row) => row.type === drillType.value) || [])
const drillTitle = computed(() => drillType.value === 'stock' ? 'Tồn kho snapshot — dữ liệu nguồn' : `${typeLabel(drillType.value)} — bản ghi nguồn`)
const exportReady = computed(() => !!report.value?.rows.length && !loading.value && !loadError.value && !filterError.value)

function applyFilters() {
  filterError.value = validateReportFilters(filters)
  exportError.value = ''
  if (filterError.value || !data.value) return
  try { calculateReports(data.value, filters, assignment.value) }
  catch (error) { filterError.value = error.message; return }
  applied.value = { ...filters }
  dialog.value?.close()
  if (props.authenticatedContext || props.repository) {
    load()
  }
}
async function openDrill(type) { drillType.value = type; await nextTick(); dialog.value?.showModal() }
function exportCsv() {
  if (!exportReady.value) return
  try {
    const text = buildReportsCsv(data.value, applied.value, assignment.value, isLive.value ? 'Dữ liệu chính thức' : null)
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = isLive.value
      ? `bao-cao-${applied.value.from}-${applied.value.to}.csv`
      : `DU-LIEU-MAU-bao-cao-${applied.value.from}-${applied.value.to}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch { exportError.value = 'Không thể xuất CSV. Vui lòng tải lại báo cáo và thử lại.' }
}
</script>

<template>
  <AdminChrome screen="Q" :role="displayRole" :warehouse-label="warehouseLabel" :actor-name="actorName" :lock-role="authenticatedContext || !!props.assignment" reports-page @navigate="emit('navigate', $event)" @role="onRole">
    <div class="reports-page">
      <section v-if="!isLive" class="q-sandbox"><span class="q-icon"><AdminIcon name="flask" :size="27" /></span><div><b>MÔI TRƯỜNG THỬ NGHIỆM (SANDBOX NODE) <code>RC1D-94 / STAGING-HC01</code></b><p><strong>Dữ liệu mẫu — không dùng làm báo cáo chính thức.</strong> Dữ liệu dưới đây chỉ mô phỏng hoạt động kho, không phản ánh số liệu vận hành thực tế.</p></div><span class="q-badge">● Sandbox Active</span></section>
      <header class="q-heading"><div class="q-tags"><span>PHẠM VI KHO: {{ warehouseLabel }}</span><span>PHÂN HỆ BÁO CÁO VẬN HÀNH (REPORTS)</span></div><h1>Báo cáo</h1><p>Theo dõi yêu cầu và hoạt động kho theo phạm vi được phân quyền</p></header>

      <form class="q-card q-filter" @submit.prevent="applyFilters" novalidate>
        <h2><AdminIcon name="calendar" />Khoảng thời gian thống kê:</h2>
        <fieldset :disabled="loading || !data"><div class="q-filter-controls"><label>Từ ngày<input aria-label="Từ ngày" v-model="filters.from" type="date" /></label><span class="q-date-separator">–</span><label>Đến ngày<input aria-label="Đến ngày" v-model="filters.to" type="date" /></label><label>Kho<select aria-label="Kho" v-model="filters.warehouseId"><option value="">Tất cả kho được phép</option><option v-for="entry in data?.warehouses || []" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></label><label>Danh mục<select aria-label="Danh mục" v-model="filters.categoryId"><option value="">Tất cả danh mục</option><option v-for="entry in data?.categories || []" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></label><button class="q-primary" type="submit"><AdminIcon name="filter" :size="16" />Áp dụng</button></div></fieldset>
        <p class="q-filter-note"><AdminIcon name="lock" :size="13" />Chỉ hiển thị kho trong phạm vi quyền. Ngày tính theo múi giờ Việt Nam (UTC+7), gồm cả ngày bắt đầu và kết thúc.</p>
        <p v-if="filterError" class="q-error" role="alert">{{ filterError }}</p><p v-else-if="pending" class="q-pending">Bộ lọc chưa áp dụng. Bảng, biểu đồ và CSV vẫn dùng phạm vi đã áp dụng bên dưới.</p>
      </form>

      <div v-if="loading" class="q-card q-state" role="status" aria-live="polite"><AdminIcon name="clock" :size="30" /><h2>Đang tải {{ isLive ? 'dữ liệu báo cáo' : 'dữ liệu báo cáo mẫu' }}...</h2><p>Đang đối chiếu bản ghi và phạm vi kho được phép.</p></div>
      <div v-else-if="loadError" class="q-card q-state q-error-state" role="alert"><AdminIcon name="warning" :size="30" /><h2>Không thể hiển thị báo cáo</h2><p>{{ loadError }}</p><button class="q-primary" @click="load">Thử lại</button></div>

      <template v-if="report">
        <section class="q-section"><h2><AdminIcon name="clock" :size="21" />Hoạt động trong khoảng thời gian</h2><p>Đang áp dụng: {{ dateText(applied.from) }} – {{ dateText(applied.to) }} · {{ warehouseLabel }} · {{ categoryLabel }}</p>
          <div class="q-activity-grid"><article v-for="metric in report.summary" :key="metric.id" class="q-card"><h3>{{ metric.label }}<AdminIcon :name="metric.icon" :size="20" /></h3><p>{{ metric.description }}</p><div><strong :data-testid="`count-${metric.id}`">{{ metric.count }}</strong><button :aria-label="`Xem chi tiết ${metric.label}`" @click="openDrill(metric.id)">Xem chi tiết →</button></div></article></div>
          <div class="q-principle"><AdminIcon name="check" /><p><b>Nguyên tắc dữ liệu hoạt động:</b><br />Đếm bản ghi nguồn; không cộng số lượng khác đơn vị. Không tính một yêu cầu đã duyệt là đã thực nhận hay đã nhập kho khi chưa có chứng từ tương ứng.</p></div>
        </section>

        <section class="q-section"><h2><AdminIcon name="chart" :size="21" />Diễn biến hoạt động</h2><p>Số bản ghi theo ngày có phát sinh · cùng bộ lọc với bảng và CSV</p><div class="q-card">
          <ul class="q-legend"><li v-for="type in REPORT_TYPES" :key="type.id"><i :class="`q-color-${type.id}`" />{{ type.label }}</li></ul>
          <div v-if="report.series.length" class="q-chart-scroll"><div class="q-chart" role="img" aria-label="Biểu đồ số bản ghi theo ngày, số liệu tương ứng trong bảng tổng hợp bên dưới"><div v-for="point in report.series" :key="point.day" class="q-chart-day"><div class="q-bars"><span v-for="type in REPORT_TYPES" :key="type.id" :class="`q-color-${type.id}`" :style="{ height: `${point.counts[type.id] / maxCount * 100}%` }" :title="`${dateText(point.day)} · ${type.label}: ${point.counts[type.id]}`" /></div><small>{{ point.day.slice(8) }}/{{ point.day.slice(5, 7) }}</small></div></div></div><p v-else class="q-empty">Không có hoạt động trong khoảng thời gian này.</p>
          <div class="q-table-wrap"><table aria-label="Tổng hợp đối chiếu biểu đồ"><thead><tr><th>Loại bản ghi</th><th>Số bản ghi</th><th>Số lượng theo đơn vị riêng</th><th>Đối chiếu</th></tr></thead><tbody><tr v-for="metric in report.summary" :key="metric.id"><td>{{ metric.label }}</td><td :data-testid="`summary-${metric.id}`">{{ metric.count }}</td><td>{{ metric.quantities.map(entry => `${entry.quantity} ${entry.unit}`).join(' · ') || '—' }}</td><td><button class="q-link" @click="openDrill(metric.id)">Bản ghi nguồn →</button></td></tr></tbody></table></div>
        </div></section>

        <section class="q-section q-stock"><h2><AdminIcon name="warehouse" :size="21" />Tồn kho hiện tại</h2><p>{{ isLive ? 'Snapshot lúc' : 'Snapshot mẫu cố định tại' }} {{ dateText(reportDay(report.snapshotAt)) }} · bộ lọc khoảng ngày KHÔNG thay đổi snapshot. Kho và danh mục vẫn áp dụng.</p><div class="q-card q-stock-card"><span class="q-stock-icon"><AdminIcon name="warehouse" :size="32" /></span><div><h3>Mặt hàng còn tồn <code>{{ isLive ? 'SNAPSHOT THẬT' : 'SNAPSHOT MẪU' }}</code></h3><strong data-testid="stock-count">{{ report.stock.length }}</strong><p>Số dòng vật phẩm–kho có lượng còn lớn hơn 0</p></div><div class="q-stock-note"><b>Tính toàn vẹn kiểm kê</b><p>Không cộng tồn khác đơn vị (chiếc, kg, bộ). Snapshot độc lập từ {{ isLive ? 'sổ kho' : 'sổ kho mẫu' }}, không suy diễn từ số yêu cầu.</p><button class="q-link" @click="openDrill('stock')">Xem kho hàng →</button></div></div></section>

        <section class="q-section"><div class="q-ledger-heading"><div><h2><AdminIcon name="log" :size="21" />Dữ liệu báo cáo &amp; Sổ kế toán kho</h2><p>Các bản ghi nguồn khớp phạm vi đang áp dụng. Không hiển thị danh tính hoặc thông tin liên hệ cá nhân.</p></div><button class="q-primary" :disabled="!exportReady" @click="exportCsv">Xuất CSV · {{ isLive ? 'Dữ liệu thật' : 'Dữ liệu mẫu' }}</button></div><p v-if="exportError" class="q-error" role="alert">{{ exportError }}</p>
          <div class="q-card"><div v-if="!report.rows.length" class="q-state"><AdminIcon name="box" :size="34" /><h3>Chưa có dữ liệu trong phạm vi đã chọn</h3><p>Thử thay đổi khoảng ngày, kho hoặc danh mục. {{ isLive ? 'Không có bản ghi nguồn trong bộ lọc hiện tại.' : 'Đây là dữ liệu mẫu, không phải số liệu vận hành chính thức.' }}</p></div><template v-else><p class="q-row-count" data-testid="row-count">{{ report.rows.length }} bản ghi nguồn · CSV xuất đúng các dòng trong bảng này</p><div class="q-table-wrap"><table aria-label="Bản ghi nguồn báo cáo" data-testid="source-table"><thead><tr><th>Mã bản ghi</th><th>Loại</th><th>Ngày (UTC+7)</th><th>Kho</th><th>Danh mục / Vật phẩm</th><th>Số lượng</th><th>Tham chiếu</th></tr></thead><tbody><tr v-for="row in report.rows" :key="row.id"><td><code>{{ row.id }}</code></td><td>{{ typeLabel(row.type) }}</td><td>{{ dateText(reportDay(row.timestamp)) }}</td><td>{{ warehouseName(row.warehouseId) }}</td><td>{{ categoryName(row.categoryId) }}<small>{{ row.item }}</small></td><td>{{ row.quantity }} {{ row.unit }}</td><td><code>{{ row.reference || '—' }}</code></td></tr></tbody></table></div></template></div>
        </section>

        <section v-if="items.length" class="q-card q-ai"><h2><AdminIcon name="flask" />Độ trùng khớp AI và staff <code>RC1D-59 · DEMO RIÊNG</code></h2><p>Chỉ số demo AI cũ, độc lập bộ dữ liệu báo cáo kho và CSV. Chỉ áp dụng khoảng ngày đã chọn.</p><strong>{{ aiMetrics.rate === null ? '—' : `${aiMetrics.rate}%` }}</strong><p>{{ aiMetrics.matched }} / {{ aiMetrics.withAi }} mẫu AI trùng staff · {{ aiMetrics.confirmed }} đơn staff xác nhận · {{ aiMetrics.noModel }} thiếu model · {{ aiMetrics.donorManual }} donor nhập thủ công</p></section>
      </template>

      <div class="q-bottom"><section class="q-card"><h2><AdminIcon name="shield" />Nguyên tắc kiến trúc báo cáo &amp; Thẩm quyền dữ liệu</h2><div><b>Phân quyền theo phạm vi kho</b><p>Quản trị viên kho chỉ xem kho được giao. System Admin có thể lọc các kho trong hệ thống và xem đơn chưa phân kho.</p></div><div><b>Nguồn dữ liệu có căn cứ</b><p>Donation, thực nhận, nhập kho và phân phối có bản ghi riêng. Số tổng, biểu đồ, bảng và CSV lấy cùng dữ liệu đã lọc.</p></div></section><section class="q-card"><h2><AdminIcon name="monitor" />Trạng thái kỹ thuật &amp; Giới hạn báo cáo</h2><div><b>Không suy diễn trạng thái</b><p>Đếm sự kiện xác nhận và chứng từ, không suy từ trạng thái sau cùng của donation.</p></div><div><b>Không tính toán số học giả định</b><p>Tồn kho là snapshot riêng, không lấy số yêu cầu trừ số phân phối.</p></div><div><b>Giao diện mục tiêu</b><p>{{ isLive ? 'Dữ liệu được tải từ API có kiểm tra quyền theo kho; tồn kho là snapshot hiện tại.' : 'Bản demo chưa dùng API thật; không dùng số liệu này làm báo cáo chính thức.' }}</p></div></section></div>
      <section v-if="!props.repository" class="q-demo-controls"><label>Kịch bản demo<select aria-label="Kịch bản demo" v-model="scenario"><option value="normal">Dữ liệu mẫu bình thường</option><option value="empty">Mô phỏng dữ liệu rỗng</option><option value="error">Mô phỏng lỗi tải</option></select></label><p>Chỉ phục vụ kiểm tra loading, rỗng và lỗi; không thay đổi dữ liệu thật.</p></section>
      <footer class="q-footer">● {{ isLive ? 'Dữ liệu từ API theo quyền hiện tại' : 'Dữ liệu mẫu — không dùng làm báo cáo chính thức' }} <span>ReShare · RC1D-94</span></footer>

      <dialog ref="dialog" class="q-dialog" aria-labelledby="q-drill-title"><header><div><span class="q-badge">{{ isLive ? 'Dữ liệu thật' : 'Dữ liệu mẫu' }}</span><h2 id="q-drill-title">{{ drillTitle }}</h2></div><button class="q-secondary" autofocus @click="dialog.close()">Đóng</button></header><p>{{ warehouseLabel }} · {{ categoryLabel }} · {{ drillType === 'stock' ? `Snapshot ${dateText(reportDay(report?.snapshotAt))}, không lọc theo ngày` : `${dateText(applied.from)} – ${dateText(applied.to)}` }}</p><p v-if="!drillRows.length" class="q-empty">Không có bản ghi nguồn tương ứng.</p><div v-else class="q-table-wrap"><table aria-label="Chi tiết bản ghi nguồn"><thead><tr><th>Mã nguồn</th><th>Kho</th><th>Vật phẩm</th><th>{{ drillType === 'stock' ? 'Tồn' : 'Số lượng' }}</th><th>{{ drillType === 'stock' ? 'Danh mục' : 'Ngày / Tham chiếu' }}</th></tr></thead><tbody><tr v-for="row in drillRows" :key="row.id"><td><code>{{ row.id }}</code></td><td>{{ warehouseName(row.warehouseId) }}</td><td>{{ row.item }}</td><td>{{ drillType === 'stock' ? row.available : row.quantity }} {{ row.unit }}</td><td>{{ drillType === 'stock' ? categoryName(row.categoryId) : `${dateText(reportDay(row.timestamp))} · ${row.reference || '—'}` }}</td></tr></tbody></table></div><p class="q-dialog-note">Chỉ đối chiếu dữ liệu nguồn tại màn Q. Không mở hoặc triển khai màn Y.</p></dialog>
    </div>
  </AdminChrome>
</template>

<style scoped src="./reports/reports.css"></style>
