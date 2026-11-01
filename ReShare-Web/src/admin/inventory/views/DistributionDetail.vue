<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InventoryLayout from '../InventoryLayout.vue'
import AuthIcon from '../../auth/components/AuthIcon.vue'
import { staffAssignment } from '../../auth/auth.store'
import { ADMIN_ROUTE, USER_ROLE } from '../../auth/auth.constants'
import { resolveQueueAccess } from '../../donations/donation.service'
import {
  INVENTORY_ERROR,
  UNIT_LABEL,
  VOUCHER_STATUS_LABEL,
  fetchDistributionVoucher,
  formatDateTime,
  getAccessibleWarehouses,
} from '../inventory.service'

const STATE_MESSAGE = {
  [INVENTORY_ERROR.notConfigured]: { icon: 'server', title: 'Chưa kết nối nguồn dữ liệu kho', text: 'Phiên bản này chưa có dữ liệu phiếu xuất chính thức từ hệ thống, nên chưa xem được chi tiết phiếu.' },
  [INVENTORY_ERROR.forbidden]: { icon: 'shield', title: 'Không có quyền xem phiếu này', text: 'Phiếu xuất thuộc kho bạn không được phân công.' },
  [INVENTORY_ERROR.notFound]: { icon: 'search', title: 'Không tìm thấy phiếu xuất', text: 'Mã phiếu không tồn tại hoặc không thuộc hệ thống.' },
  [INVENTORY_ERROR.server]: { icon: 'cloud-off', title: 'Không tải được phiếu xuất', text: 'Máy chủ hoặc kết nối mạng đang gặp sự cố. Vui lòng thử lại.' },
}
// Dữ liệu mẫu ở dev dùng mã hồ sơ giả, không có trên hệ thống thật nên không mở liên kết hồ sơ.
const IS_SAMPLE_DATA = import.meta.env.DEV

const route = useRoute()
const router = useRouter()
const data = ref(null)
const errorStatus = ref(null)
const isLoading = ref(true)
const loadedAt = ref(null)
const selectedIndex = ref(0)
let latestRequestId = 0

const access = computed(() => resolveQueueAccess(staffAssignment.value))
const voucher = computed(() => data.value?.voucher ?? null)
const beneficiary = computed(() => data.value?.beneficiary ?? null)
const lines = computed(() => data.value?.lines ?? [])
const selectedLine = computed(() => lines.value[selectedIndex.value] ?? null)
const warehouses = computed(() => (voucher.value ? [voucher.value.warehouse] : getAccessibleWarehouses(access.value)))
const stateMessage = computed(() => STATE_MESSAGE[errorStatus.value] ?? null)
const isSystemAdmin = computed(() => staffAssignment.value?.role === USER_ROLE.systemAdmin)
const scopeName = computed(() =>
  voucher.value?.warehouse.name ?? (isSystemAdmin.value ? 'Tất cả kho' : warehouses.value.map(({ name }) => name).join(', ') || '—'),
)
const infoFields = computed(() => [
  { label: 'Thời gian bàn giao', value: formatTime(voucher.value?.confirmedAt) },
  { label: 'Người xác nhận bàn giao', value: voucher.value?.confirmedBy ?? '—' },
  { label: 'Ghi chú bàn giao', value: voucher.value?.note || '—' },
])
const auditTrail = computed(() => [
  { label: 'Người tạo phiếu', value: voucher.value?.createdBy ?? '—' },
  { label: 'Thời gian tạo', value: formatTime(voucher.value?.createdAt) },
  { label: 'Người xác nhận bàn giao', value: voucher.value?.confirmedBy ?? '—' },
  { label: 'Thời gian xác nhận', value: formatTime(voucher.value?.confirmedAt) },
])

async function load() {
  const requestId = ++latestRequestId
  isLoading.value = true
  errorStatus.value = null
  // Đổi phiếu hoặc phân công thì không giữ phiếu và người thụ hưởng của lần xem trước.
  data.value = null
  selectedIndex.value = 0
  try {
    const nextData = await fetchDistributionVoucher(access.value, route.params.voucherId)
    if (requestId !== latestRequestId) return
    data.value = nextData
    loadedAt.value = new Date()
  } catch (error) {
    if (requestId !== latestRequestId) return
    data.value = null
    errorStatus.value = error.status ?? INVENTORY_ERROR.server
  } finally {
    if (requestId === latestRequestId) isLoading.value = false
  }
}

const formatCode = (code) => (code ? code.toUpperCase() : '—')
const unitName = (unitId) => UNIT_LABEL[unitId] || unitId || '—'
const formatTime = (value) => (value ? formatDateTime(value) : '—')

watch([() => route.params.voucherId, staffAssignment], load, { immediate: true })
onBeforeUnmount(() => { latestRequestId += 1 })
</script>

<template>
  <InventoryLayout
    :warehouses="warehouses"
    :selected-warehouse-id="voucher?.warehouseId ?? (isSystemAdmin ? '' : warehouses[0]?.id ?? '')"
    @select-warehouse="(warehouseId) => router.push({ name: ADMIN_ROUTE.inventory, query: { warehouseId: warehouseId || undefined } })"
  >
    <nav class="px-crumbs">
      <span><AuthIcon name="dashboard" :size="16" />Hệ thống › Vận hành kho › <b>Quản lý kho hàng</b></span>
      <button type="button" class="px-refresh" :disabled="isLoading" @click="load">
        Cập nhật: {{ loadedAt ? formatDateTime(loadedAt) : '—' }}<AuthIcon name="refresh" :size="16" />
      </button>
    </nav>

    <div class="px-chips">
      <RouterLink :to="{ name: ADMIN_ROUTE.inventory, query: voucher ? { warehouseId: voucher.warehouseId } : {} }" class="inv-chip px-back">
        <AuthIcon name="arrow-left" :size="16" />Quay lại kho hàng
      </RouterLink>
      <span class="inv-chip px-chip-blue"><AuthIcon name="warehouse" :size="15" />Phạm vi kho: {{ scopeName }}</span>
      <span class="inv-chip px-chip-blue"><AuthIcon name="lock" :size="15" />Chỉ xem (read-only)</span>
      <span class="inv-chip inv-chip--green"><AuthIcon name="file-text" :size="15" />Chứng từ xuất kho</span>
      <span class="inv-chip mono px-code">Mã chứng từ: {{ formatCode(voucher?.id) }}</span>
    </div>

    <header>
      <h1 class="px-title">Chi tiết phiếu xuất kho <span class="inv-chip">Chỉ xem</span></h1>
      <p class="px-muted">Tra cứu chứng từ xuất kho phân phối thực tế, đối soát người thụ hưởng và biến động tồn kho tại thời điểm xuất.</p>
    </header>

    <div v-if="stateMessage" class="inv-card inv-state inv-state--danger" role="alert">
      <span class="inv-state__icon"><AuthIcon :name="stateMessage.icon" :size="34" /></span>
      <h2>{{ stateMessage.title }}</h2>
      <p>{{ stateMessage.text }}</p>
      <div class="px-actions">
        <button v-if="errorStatus === INVENTORY_ERROR.server" type="button" class="inv-btn inv-btn--primary" @click="load"><AuthIcon name="refresh" :size="18" />Thử lại</button>
        <RouterLink :to="{ name: ADMIN_ROUTE.inventory }" class="inv-btn"><AuthIcon name="arrow-left" :size="18" />Về kho hàng</RouterLink>
      </div>
    </div>

    <div v-else class="px-grid" :aria-busy="isLoading" :class="{ 'is-loading': isLoading }">
      <div class="px-col">
        <section class="inv-card">
          <div class="px-head">
            <span class="px-icon"><AuthIcon name="clipboard-check" :size="20" /></span>
            <div><h2>Thông tin phiếu xuất</h2><p class="px-muted">Dữ liệu định danh giao dịch xuất kho chính thức</p></div>
            <span class="inv-chip">Hồ sơ xuất kho</span>
          </div>
          <div class="px-fields">
            <div><p class="px-label">Mã phiếu xuất</p><b class="mono">{{ formatCode(voucher?.id) }}</b> <span class="px-muted">(Gốc)</span></div>
            <div><p class="px-label">Trạng thái phiếu</p><span class="inv-chip" :class="{ 'inv-chip--green': voucher?.status === 'confirmed' }">{{ VOUCHER_STATUS_LABEL[voucher?.status] ?? '—' }}</span></div>
            <div><p class="px-label">Kho xuất</p><b class="px-warehouse"><AuthIcon name="warehouse" :size="17" />{{ voucher?.warehouse.name ?? '—' }} <span v-if="voucher" class="inv-chip mono">{{ formatCode(voucher.warehouseId) }}</span></b></div>
            <div v-for="field in infoFields" :key="field.label"><p class="px-label">{{ field.label }}</p><b>{{ field.value }}</b></div>
          </div>
          <p class="px-note"><AuthIcon name="shield-check" :size="17" />Giá trị hiển thị được đối chiếu từ giao dịch xuất kho đã xác nhận và không thể chỉnh sửa trực tiếp.</p>
        </section>

        <section class="inv-card">
          <div class="px-head">
            <span class="px-icon"><AuthIcon name="user" :size="20" /></span>
            <div><h2>Người thụ hưởng</h2><p class="px-muted">Thông tin đối tượng tiếp nhận hỗ trợ từ kho</p></div>
            <span class="inv-chip">Hồ sơ tiếp nhận</span>
          </div>
          <div class="px-fields px-fields--3">
            <div><p class="px-label">Mã hồ sơ</p><b class="mono">{{ formatCode(beneficiary?.id) }}</b></div>
            <div><p class="px-label">Tên hiển thị</p><b>{{ beneficiary?.displayName ?? '—' }}</b></div>
            <div><p class="px-label">Lần hỗ trợ tại kho</p><b>{{ beneficiary?.supportCount ?? '—' }}</b></div>
          </div>
          <RouterLink v-if="beneficiary?.id && !IS_SAMPLE_DATA" :to="{ name: ADMIN_ROUTE.beneficiaryDetail, params: { beneficiaryId: beneficiary.id } }" class="inv-btn px-profile"><AuthIcon name="eye" :size="17" />Xem hồ sơ người thụ hưởng</RouterLink>
          <button v-else type="button" class="inv-btn px-profile" disabled><AuthIcon name="eye" :size="17" />Xem hồ sơ người thụ hưởng</button>
          <p class="px-caption">{{ IS_SAMPLE_DATA ? 'Dữ liệu mẫu: hồ sơ này không có trên hệ thống nên chưa mở được.' : 'Hồ sơ chỉ mở được khi tài khoản có quyền với kho của người thụ hưởng.' }}</p>
          <p class="px-note"><AuthIcon name="shield" :size="17" /><span><b>Bảo mật danh tính:</b> Không hiển thị số điện thoại, địa chỉ chi tiết hoặc CCCD/CMND trên chứng từ xuất kho.</span></p>
        </section>

        <section class="inv-card">
          <div class="px-head">
            <span class="px-icon"><AuthIcon name="list-check" :size="20" /></span>
            <div><h2>Vật phẩm đã phân phối</h2><p class="px-muted">Chi tiết danh mục hiện vật thực xuất trong đợt bàn giao</p></div>
            <span class="inv-chip">Danh mục phân phối</span>
          </div>
          <div class="px-table">
            <table class="inv-table">
              <thead><tr><th>Vật phẩm</th><th>Số lượng xuất</th><th>Đơn vị</th><th>Phiếu nhập nguồn</th><th>Thao tác</th></tr></thead>
              <tbody v-if="lines.length">
                <tr v-for="(line, index) in lines" :key="line.inventoryItemId" :class="{ 'is-selected': index === selectedIndex }">
                  <td><b>{{ line.itemName }}</b><small class="mono">{{ formatCode(line.inventoryItemId) }}</small></td>
                  <td class="mono"><b>{{ line.quantity }}</b></td>
                  <td>{{ unitName(line.unitId) }}</td>
                  <td class="mono">{{ formatCode(line.stockEntryId) }}</td>
                  <td><button type="button" class="px-link" :aria-pressed="index === selectedIndex" @click="selectedIndex = index">Xem biến động</button></td>
                </tr>
              </tbody>
            </table>
            <div v-if="!lines.length" class="inv-state">
              <span class="inv-state__icon"><AuthIcon :name="isLoading ? 'loader' : 'archive'" :size="30" /></span>
              <h2>{{ isLoading ? 'Đang tải vật phẩm…' : 'Chưa có vật phẩm để hiển thị' }}</h2>
              <p>Danh mục vật phẩm phân phối sẽ tự động hiển thị khi nạp phiếu xuất kho hợp lệ.</p>
            </div>
          </div>
        </section>
      </div>

      <aside class="px-col">
        <section class="inv-card">
          <div class="px-head">
            <span class="px-icon"><AuthIcon name="chart" :size="20" /></span>
            <div><h2>Biến động tồn</h2><p class="px-muted">Tại thời điểm xuất kho</p></div>
            <span class="inv-chip inv-chip--green">Snapshot giao dịch</span>
          </div>
          <div class="px-stock">
            <div><span>Tồn trước</span><b class="mono">{{ selectedLine?.stockBefore ?? '—' }}</b><small>{{ selectedLine ? unitName(selectedLine.unitId) : 'Đơn vị' }}</small></div>
            <div class="is-green"><span>SL xuất</span><b class="mono">{{ selectedLine?.quantity ?? '—' }}</b><small>Khấu trừ</small></div>
            <div><span>Tồn sau</span><b class="mono">{{ selectedLine?.stockAfter ?? '—' }}</b><small>Khả dụng</small></div>
          </div>
          <p class="px-hint"><AuthIcon name="clock" :size="16" />Số tồn {{ selectedLine ? `của ${selectedLine.itemName} ` : '' }}được ghi nhận tại thời điểm xác nhận phiếu xuất.</p>
          <p class="px-note"><span><b>Lưu ý:</b> "Tồn sau xuất" là ảnh chụp dữ liệu tại thời điểm lập phiếu, không phản ánh tồn kho khả dụng hiện tại của vật phẩm.</span></p>
        </section>

        <section class="inv-card">
          <div class="px-head">
            <span class="px-icon"><AuthIcon name="link" :size="20" /></span>
            <div><h2>Bản ghi liên quan</h2><p class="px-muted">Truy vết chuỗi cung ứng</p></div>
            <span class="inv-chip">Chuỗi chứng từ</span>
          </div>
          <div class="px-related">
            <AuthIcon name="archive" :size="18" />
            <div><p class="px-label">Vật phẩm trong kho</p><b class="mono">{{ formatCode(selectedLine?.inventoryItemId) }}</b></div>
            <RouterLink v-if="selectedLine" :to="{ name: ADMIN_ROUTE.inventoryDetail, params: { itemId: selectedLine.inventoryItemId } }" class="inv-btn px-small">Xem chi tiết</RouterLink>
          </div>
          <div class="px-related">
            <AuthIcon name="download" :size="18" />
            <div><p class="px-label">Phiếu nhập nguồn</p><b class="mono">{{ formatCode(selectedLine?.stockEntryId) }}</b></div>
            <RouterLink v-if="selectedLine?.stockEntryId && !IS_SAMPLE_DATA" :to="{ name: 'admin-stock-entry-detail', params: { entryId: selectedLine.stockEntryId } }" class="inv-btn px-small">Xem phiếu nhập</RouterLink>
            <span v-else class="px-unsupported">Chưa hỗ trợ</span>
          </div>
          <div class="px-related">
            <AuthIcon name="user" :size="18" />
            <div><p class="px-label">Hồ sơ người thụ hưởng</p><b class="mono">{{ formatCode(beneficiary?.id) }}</b></div>
            <RouterLink v-if="beneficiary?.id && !IS_SAMPLE_DATA" :to="{ name: ADMIN_ROUTE.beneficiaryDetail, params: { beneficiaryId: beneficiary.id } }" class="inv-btn px-small">Xem hồ sơ</RouterLink>
            <span v-else class="px-unsupported">Chưa hỗ trợ</span>
          </div>
          <p class="px-caption">Số lượng xuất kho thực tế làm giảm tồn kho tương ứng của lô nhập nguồn, không mặc định phân phối toàn bộ lô.</p>
        </section>

        <section class="inv-card">
          <div class="px-head">
            <span class="px-icon"><AuthIcon name="history" :size="20" /></span>
            <div><h2>Dấu vết xác nhận</h2><p class="px-muted">Nhật ký kiểm toán giao dịch</p></div>
            <span class="inv-chip">Audit Trail</span>
          </div>
          <dl class="px-audit">
            <div v-for="row in auditTrail" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
          </dl>
          <div class="px-immutable">
            <p class="px-label is-green"><AuthIcon name="badge-check" :size="17" />Bản ghi bất biến (append-only)</p>
            <p>Phiếu xuất đã xác nhận không thể sửa đổi hoặc xóa bỏ. Trường hợp cần điều chỉnh hoàn trả hàng hoặc sửa đổi sai sót số liệu, vui lòng thực hiện quy trình "Điều chỉnh tồn kho" có thẩm quyền riêng.</p>
          </div>
        </section>
      </aside>
    </div>
  </InventoryLayout>
</template>

<style scoped>
.px-crumbs { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 15px; color: var(--inv-muted); }
.px-crumbs > span { display: inline-flex; align-items: center; gap: 6px; }
.px-crumbs b { color: var(--inv-text); }
.px-refresh { display: inline-flex; align-items: center; gap: 8px; border: none; background: none; font: inherit; color: inherit; cursor: pointer; }
.px-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.px-chips .inv-chip { padding: 6px 12px; text-transform: uppercase; }
.px-back { background: #fff; color: var(--inv-text); text-decoration: none; text-transform: none !important; }
.px-chip-blue { background: #e6eefb; color: #2f4f86; }
.px-code { margin-left: auto; background: #fff; }
.px-title { display: flex; align-items: center; gap: 14px; font-size: 32px; }
.px-muted { color: var(--inv-muted); }
.px-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); gap: 22px; align-items: start; }
.px-grid.is-loading { opacity: 0.7; }
.px-col { display: flex; flex-direction: column; gap: 22px; }
.px-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 20px; }
.px-head > div { flex: 1; }
.px-head h2 { font-size: 21px; }
.px-head .px-muted { font-size: 15px; }
.px-icon { display: grid; place-items: center; flex-shrink: 0; width: 38px; height: 38px; border-radius: 10px; background: var(--inv-accent); color: var(--inv-green); }
.px-label { display: flex; align-items: center; gap: 6px; margin-bottom: 6px !important; font-size: 14px; font-weight: 600; color: var(--inv-muted); }
.px-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.px-fields--3 { grid-template-columns: repeat(3, 1fr); }
.px-fields > div { padding: 14px 16px; border-radius: 12px; background: var(--inv-accent); }
.px-warehouse { display: flex; align-items: center; gap: 8px; }
.px-warehouse svg { color: var(--inv-green); }
.px-note { display: flex; gap: 10px; padding: 14px 16px; border-radius: 10px; background: var(--inv-accent); font-size: 15px; color: var(--inv-muted); }
.px-note svg { flex-shrink: 0; margin-top: 3px; }
.px-profile { min-height: 40px; }
.px-caption { margin: 8px 0 12px !important; font-size: 14px; font-style: italic; color: var(--inv-muted); }
.px-table { overflow-x: auto; border-radius: 12px; background: var(--inv-accent); }
.px-table .inv-table { min-width: 620px; }
.px-table td { background: #fff; }
.px-table tr.is-selected td { background: var(--inv-green-soft); }
.px-link { border: none; background: none; padding: 0; font: inherit; font-size: 14px; font-weight: 600; color: var(--inv-green); white-space: nowrap; cursor: pointer; }
.px-stock { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
.px-stock > div { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 6px; border-radius: 12px; background: var(--inv-accent); text-align: center; font-size: 14px; font-weight: 600; }
.px-stock b { font-size: 22px; }
.px-stock small { font-size: 12px; text-transform: uppercase; color: var(--inv-muted); }
.px-stock .is-green { background: var(--inv-green-soft); }
.px-hint { display: flex; gap: 8px; margin-bottom: 12px !important; font-size: 14px; font-weight: 600; color: var(--inv-muted); }
.px-hint svg { flex-shrink: 0; margin-top: 2px; }
.px-related { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; padding: 12px 14px; border-radius: 12px; background: var(--inv-accent); }
.px-related > svg { flex-shrink: 0; color: var(--inv-muted); }
.px-related > div { flex: 1; min-width: 0; }
.px-small { min-height: 34px; padding: 0 12px; background: #e6eefb; font-size: 14px; }
.px-unsupported { font-size: 13px; color: var(--inv-faint); }
.px-audit { display: flex; flex-direction: column; gap: 8px; margin: 0 0 16px; }
.px-audit > div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: 10px; background: var(--inv-accent); font-size: 14px; }
.px-audit dt { font-weight: 600; color: var(--inv-muted); }
.px-audit dd { margin: 0; text-align: right; }
.px-immutable { padding: 16px; border-radius: 12px; background: var(--inv-accent); color: var(--inv-muted); }
.px-immutable .px-label { text-transform: uppercase; }
.px-actions { display: flex; gap: 12px; margin-top: 8px; }
.is-green { color: var(--inv-green); }
@media (max-width: 1100px) {
  .px-grid, .px-fields, .px-fields--3 { grid-template-columns: 1fr; }
  .px-code { margin-left: 0; }
}
</style>
