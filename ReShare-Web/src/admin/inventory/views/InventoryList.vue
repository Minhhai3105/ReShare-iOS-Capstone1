<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InventoryLayout from '../InventoryLayout.vue'
import AuthIcon from '../../auth/components/AuthIcon.vue'
import { staffAssignment } from '../../auth/auth.store'
import { ADMIN_ROUTE } from '../../auth/auth.constants'
import { resolveQueueAccess } from '../../donations/donation.service'
import { DONATION_CATEGORY_LABEL } from '../../donations/donation.constants'
import {
  CONDITION_LABEL,
  INVENTORY_ERROR,
  STOCK_FILTER,
  UNIT_LABEL,
  fetchInventory,
  formatDateTime,
  getAccessibleWarehouses,
} from '../inventory.service'

const DEFAULT_FILTERS = { search: '', category: '', condition: '', stock: STOCK_FILTER.all }
const STOCK_TABS = [
  { value: STOCK_FILTER.all, label: 'Tất cả' },
  { value: STOCK_FILTER.inStock, label: 'Còn hàng' },
  { value: STOCK_FILTER.outOfStock, label: 'Hết hàng' },
]
const RULES = [
  { icon: 'check-circle', title: 'Phiếu nhập kho chính thức:', text: 'Chỉ hiển thị hàng hóa đã hoàn tất thủ tục nhập kho chính thức (phiếu nhập kho đã duyệt qua khâu phân loại và khử khuẩn).' },
  { icon: 'x-circle', title: 'Không gán trước tồn khả dụng:', text: 'Các yêu cầu quyên góp ở trạng thái “Đã duyệt” hoặc chỉ mới “Đã thực nhận” KHÔNG được tính là tồn kho khả dụng.' },
  { icon: 'clipboard-check', title: 'Cơ chế “Số còn”:', text: 'Phản ánh tồn khả dụng sau các giao dịch xuất kho hoặc phân bổ người thụ hưởng. Phân bổ một phần chỉ làm giảm số còn, không đánh dấu toàn bộ vật phẩm đã phân phối.' },
  { icon: 'link', title: 'Nguồn nhập toàn vẹn:', text: '“Nguồn nhập” truy xuất trực tiếp từ Phiếu nhập kho và Yêu cầu quyên góp gốc, tuyệt đối không cho phép tạo mã hoặc nhập liệu tự do trên giao diện này.' },
  { icon: 'arrow-left', title: 'Tách biệt P2P:', text: 'Các bài đăng chia sẻ ngang hàng (P2P) trong hệ thống catalog_items hoàn toàn không xuất hiện tại đây và không đi qua luồng lưu kho vật lý.' },
]
const timeFormatter = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

// Dữ liệu mẫu chỉ có khi chạy dev (service chặn trên bản production); nhãn demo cũng chỉ hiện khi đó.
const IS_SAMPLE_DATA = import.meta.env.DEV
const route = useRoute()
const router = useRouter()
const filters = reactive({ ...DEFAULT_FILTERS })
const result = ref(null)
const errorStatus = ref(null)
const isLoading = ref(false)
const syncedAt = ref(null)
let latestRequestId = 0
let reloadTimer = null

const access = computed(() => resolveQueueAccess(staffAssignment.value))
const warehouses = computed(() => getAccessibleWarehouses(access.value))
// Kho đang xem nằm trên URL (?warehouseId=) để guard kiểm tra quyền khi sửa URL thủ công (AC2).
const selectedWarehouseId = computed(() =>
  route.query.warehouseId ?? (access.value?.isAllWarehouses ? '' : warehouses.value[0]?.id ?? ''),
)
const scopeName = computed(() =>
  warehouses.value.find(({ id }) => id === selectedWarehouseId.value)?.name ?? 'Tất cả kho',
)
const hasActiveFilters = computed(() => Object.keys(DEFAULT_FILTERS).some((key) => filters[key] !== DEFAULT_FILTERS[key]))
const viewState = computed(() => {
  if (errorStatus.value === INVENTORY_ERROR.forbidden) return 'forbidden'
  if (errorStatus.value === INVENTORY_ERROR.notConfigured) return 'not-configured'
  if (errorStatus.value) return 'error'
  if (!result.value && !errorStatus.value) return 'loading'
  if (result.value?.items.length) return 'ready'
  return hasActiveFilters.value ? 'no-match' : 'empty'
})

// Chỉ nhận kết quả của lần gọi mới nhất để đổi bộ lọc liên tục không bị kết quả cũ đè.
async function load() {
  const requestId = ++latestRequestId
  isLoading.value = true
  errorStatus.value = null
  try {
    const data = await fetchInventory(access.value, { ...filters, warehouseId: selectedWarehouseId.value })
    if (requestId !== latestRequestId) return
    result.value = data
    syncedAt.value = new Date()
  } catch (error) {
    if (requestId !== latestRequestId) return
    result.value = null
    errorStatus.value = error.status ?? INVENTORY_ERROR.server
  } finally {
    if (requestId === latestRequestId) isLoading.value = false
  }
}

function selectWarehouse(warehouseId) {
  router.replace({ query: { ...route.query, warehouseId: warehouseId || undefined } })
}

// Bộ lọc đổi thì watcher tự tải; nếu vốn đã mặc định thì tải lại trực tiếp (chỉ một đường tải).
function resetFilters() {
  if (!hasActiveFilters.value) {
    load()
    return
  }
  Object.assign(filters, DEFAULT_FILTERS)
}

// Đổi kho hoặc phân công: xóa ngay dữ liệu phạm vi cũ và bỏ qua lần tải đang chạy của phạm vi đó.
watch([selectedWarehouseId, staffAssignment], () => {
  latestRequestId += 1
  result.value = null
  errorStatus.value = null
})

watch([() => ({ ...filters }), selectedWarehouseId, staffAssignment], () => {
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(load, 250)
}, { immediate: true })

onBeforeUnmount(() => {
  clearTimeout(reloadTimer)
  latestRequestId += 1
})
</script>

<template>
  <InventoryLayout :warehouses="warehouses" :selected-warehouse-id="selectedWarehouseId" @select-warehouse="selectWarehouse">
    <section v-if="IS_SAMPLE_DATA" class="inv-sandbox">
      <AuthIcon name="flask" :size="30" />
      <div>
        <strong>Môi trường thử nghiệm (Sandbox Node)</strong> <span class="inv-chip">Độc lập vật lý</span>
        <p>
          Dữ liệu kho dưới đây thuộc phạm vi <strong>{{ scopeName }}</strong>. Không tác động đến các luồng
          intake thực tế tại trung tâm phân phối chính.
        </p>
      </div>
      <span class="inv-chip inv-scope"><i />Phạm vi: <span class="mono">{{ scopeName }}</span></span>
    </section>

    <header class="inventory-head">
      <div>
        <h1>Kho hàng <span class="inv-chip inv-chip--green">Tồn kho khả dụng</span></h1>
        <p>Theo dõi hàng đã nhập và số lượng còn tại kho đang chọn</p>
      </div>
      <RouterLink :to="{ name: ADMIN_ROUTE.donationQueue }" class="inv-btn">
        <AuthIcon name="download" :size="18" />Xem yêu cầu chờ nhập kho<AuthIcon name="arrow-right" :size="18" />
      </RouterLink>
    </header>

    <section class="inv-card inventory-filters" aria-label="Bộ lọc">
      <div class="inventory-filters__top">
        <div class="inventory-tabs" role="tablist">
          <button
            v-for="tab in STOCK_TABS"
            :key="tab.value"
            type="button"
            role="tab"
            :aria-selected="filters.stock === tab.value"
            :class="{ 'is-active': filters.stock === tab.value }"
            @click="filters.stock = tab.value"
          >
            {{ tab.label }}<span v-if="result" class="mono"> ({{ result.counts[tab.value] }})</span>
          </button>
        </div>
        <span v-if="syncedAt" class="inventory-sync">Cập nhật lúc: <b class="mono">{{ timeFormatter.format(syncedAt) }}</b></span>
      </div>
      <div class="inventory-filters__row">
        <label class="inventory-search">
          <AuthIcon name="search" :size="20" />
          <input v-model="filters.search" type="search" placeholder="Tìm vật phẩm hoặc mã phiếu nhập..." aria-label="Tìm vật phẩm hoặc mã phiếu nhập" />
          <button v-if="filters.search" type="button" aria-label="Xóa tìm kiếm" @click="filters.search = ''"><AuthIcon name="x" :size="18" /></button>
        </label>
        <select v-model="filters.category" aria-label="Danh mục">
          <option value="">Tất cả danh mục</option>
          <option v-for="(label, value) in DONATION_CATEGORY_LABEL" :key="value" :value="value">{{ label }}</option>
        </select>
        <select v-model="filters.condition" aria-label="Tình trạng">
          <option value="">Tất cả tình trạng</option>
          <option v-for="(label, value) in CONDITION_LABEL" :key="value" :value="value">{{ label }}</option>
        </select>
        <button type="button" class="inv-btn inventory-reset" :disabled="isLoading" @click="resetFilters">
          <AuthIcon :name="isLoading ? 'loader' : 'refresh'" :size="18" :class="{ 'inventory-spin': isLoading }" />Đặt lại
        </button>
      </div>
    </section>

    <section class="inv-card inventory-table" :aria-busy="isLoading">
      <div class="inventory-table__scroll">
        <table class="inv-table">
          <thead>
            <tr>
              <th>Vật phẩm</th><th>Số còn</th><th>Đơn vị</th><th>Vị trí lưu</th><th>Nguồn nhập</th><th>Cập nhật</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody v-if="viewState === 'ready'" :class="{ 'is-refreshing': isLoading }">
            <tr v-for="item in result.items" :key="item.id">
              <td><strong>{{ item.itemName }}</strong><small class="mono">{{ item.id.toUpperCase() }} · {{ DONATION_CATEGORY_LABEL[item.category] }}</small></td>
              <td class="mono inventory-qty" :class="{ 'is-out': item.quantityAvailable === 0 }">{{ item.quantityAvailable }}</td>
              <td>{{ UNIT_LABEL[item.unitId] ?? item.unitId }}</td>
              <td><span class="mono">{{ item.location }}</span><small>{{ item.warehouse.name }}</small></td>
              <td><span class="mono">{{ item.stockEntryId.toUpperCase() }}</span><small class="mono">{{ item.donationId.toUpperCase() }}</small></td>
              <td class="inventory-nowrap">{{ formatDateTime(item.updatedAt) }}</td>
              <td><RouterLink :to="{ name: ADMIN_ROUTE.inventoryDetail, params: { itemId: item.id } }" class="inventory-link">Xem chi tiết</RouterLink></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="viewState === 'loading'" class="inv-state"><AuthIcon name="loader" :size="32" class="inventory-spin" /><p>Đang tải tồn kho…</p></div>

      <div v-else-if="viewState === 'not-configured'" class="inv-state">
        <span class="inv-state__icon"><AuthIcon name="server" :size="36" /></span>
        <h2>Chưa kết nối nguồn tồn kho</h2>
        <p>Phiên bản này chưa có dữ liệu tồn kho chính thức từ hệ thống. Danh sách sẽ hiển thị khi backend kho được triển khai.</p>
        <RouterLink :to="{ name: ADMIN_ROUTE.donationQueue }" class="inv-btn"><AuthIcon name="download" :size="18" />Xem yêu cầu chờ nhập kho</RouterLink>
      </div>

      <div v-else-if="viewState === 'empty'" class="inv-state">
        <span class="inv-state__icon"><AuthIcon name="archive" :size="38" /></span>
        <h2>Chưa có dữ liệu kho thực tế</h2>
        <p>Hàng sẽ xuất hiện tại đây sau khi hoàn tất ghi nhận thực nhận và nhập kho. Tuyệt đối không có dữ liệu mô phỏng tự tạo.</p>
        <div class="inventory-actions">
          <RouterLink :to="{ name: ADMIN_ROUTE.donationQueue }" class="inv-btn inv-btn--primary"><AuthIcon name="download" :size="18" />Xem yêu cầu chờ nhập kho</RouterLink>
          <a href="#inventory-policy" class="inv-btn"><AuthIcon name="book-open" :size="18" />Quy trình kiểm định &amp; nhập kho</a>
        </div>
      </div>

      <div v-else-if="viewState === 'no-match'" class="inv-state">
        <span class="inv-state__icon"><AuthIcon name="search" :size="34" /></span>
        <h2>Không có vật phẩm phù hợp</h2>
        <p>Thử thay đổi từ khóa hoặc bộ lọc.</p>
        <button type="button" class="inv-btn" @click="resetFilters"><AuthIcon name="refresh" :size="18" />Đặt lại</button>
      </div>

      <div v-else-if="viewState === 'error'" class="inv-state inv-state--danger" role="alert">
        <span class="inv-state__icon"><AuthIcon name="cloud-off" :size="36" /></span>
        <h2>Không tải được tồn kho</h2>
        <p>Máy chủ hoặc kết nối mạng đang gặp sự cố. Vui lòng thử lại.</p>
        <button type="button" class="inv-btn inv-btn--primary" @click="load"><AuthIcon name="refresh" :size="18" />Thử lại</button>
      </div>

      <div v-else-if="viewState === 'forbidden'" class="inv-state inv-state--danger" role="alert">
        <span class="inv-state__icon"><AuthIcon name="shield" :size="36" /></span>
        <h2>Không có quyền xem tồn kho này</h2>
        <p>Bạn chỉ xem được tồn kho thuộc kho được phân công.</p>
        <button type="button" class="inv-btn" @click="selectWarehouse('')"><AuthIcon name="arrow-left" :size="18" />Về phạm vi được giao</button>
      </div>

      <footer class="inventory-table__footer">
        <span><template v-if="result">Tổng số phân loại vật phẩm: <b class="mono">{{ result.items.length }} bản ghi</b></template></span>
        <span v-if="IS_SAMPLE_DATA"><AuthIcon name="info" :size="16" />Dữ liệu mẫu – chưa kết nối nguồn tồn kho</span>
      </footer>
    </section>

    <div class="inventory-bottom">
      <section id="inventory-policy" class="inv-card">
        <h2 class="inventory-title"><span class="inventory-title__icon"><AuthIcon name="shield-check" :size="22" /></span>Nguyên tắc quản lý tồn kho ReShare</h2>
        <ul class="inv-rules">
          <li v-for="rule in RULES" :key="rule.title"><AuthIcon :name="rule.icon" :size="20" /><p><strong>{{ rule.title }}</strong> {{ rule.text }}</p></li>
        </ul>
        <footer class="inventory-policy__footer"><span>Quy chuẩn phiên bản 2.4 - Vận hành tuần hoàn ReShare</span><span class="mono">ST-INVENTORY-POLICY</span></footer>
      </section>

      <div class="inventory-side">
        <section v-if="IS_SAMPLE_DATA" class="inv-card">
          <h2 class="inventory-title"><AuthIcon name="flask" :size="20" />Giai đoạn Prototype</h2>
          <p class="inventory-muted">Mô hình dữ liệu kho (Warehouse Inventory Model), đối soát phiếu nhập/xuất và sổ nhật ký kiểm toán (audit logs) đang ở trạng thái triển khai kiểm thử giao diện chuẩn.</p>
          <dl class="inventory-specs">
            <div><dt>Vouchers State:</dt><dd class="mono is-green">Strict Verification</dd></div>
            <div><dt>Inline Edit Quantity:</dt><dd class="mono is-red">Disabled (Read-only)</dd></div>
            <div><dt>Direct Creation:</dt><dd class="mono is-red">Restricted</dd></div>
          </dl>
          <p class="inventory-note"><AuthIcon name="shield-check" :size="16" />Tuân thủ thiết kế phân rã microservice</p>
        </section>
        <section class="inv-card inventory-help">
          <span class="inventory-title__icon"><AuthIcon name="help-circle" :size="22" /></span>
          <div><strong>Cần trợ giúp nhập kho?</strong><p class="inventory-muted">Liên hệ giám sát viên ca trực</p></div>
          <AuthIcon name="chevron-right" :size="20" />
        </section>
      </div>
    </div>
  </InventoryLayout>
</template>

<style scoped>
.inv-scope { margin-left: auto; padding: 8px 14px; background: #fff; }
.inventory-head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
.inventory-head h1 { display: flex; align-items: center; gap: 14px; font-size: 44px; font-weight: 700; }
.inventory-head p { font-size: 18px; color: var(--inv-muted); }
.inventory-filters { display: flex; flex-direction: column; gap: 18px; }
.inventory-filters__top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.inventory-tabs { display: inline-flex; gap: 4px; padding: 5px; border-radius: 12px; background: var(--inv-accent); }
.inventory-tabs button { padding: 8px 16px; border: none; border-radius: 9px; background: none; font-weight: 600; color: var(--inv-muted); cursor: pointer; }
.inventory-tabs button.is-active { background: #fff; color: var(--inv-green); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
.inventory-sync { display: inline-flex; align-items: center; gap: 8px; color: var(--inv-muted); }
.inventory-sync b { padding: 4px 10px; border-radius: 6px; background: var(--inv-accent); color: var(--inv-text); }
.inventory-filters__row { display: grid; grid-template-columns: minmax(220px, 1.7fr) 1fr 1fr auto; gap: 12px; }
.inventory-search { display: flex; align-items: center; gap: 10px; padding: 0 12px; border-radius: 10px; background: var(--inv-bg); color: var(--inv-faint); }
.inventory-search input { flex: 1; min-width: 0; min-height: 48px; border: none; outline: none; background: none; color: var(--inv-text); }
.inventory-search button { display: grid; border: none; background: none; color: var(--inv-faint); cursor: pointer; }
.inventory-filters__row select { min-height: 48px; padding: 0 14px; border: 1px solid var(--inv-border); border-radius: 10px; background: var(--inv-bg); }
.inventory-reset { min-height: 48px; }
.inventory-table { padding: 0; overflow: hidden; }
.inventory-table__scroll { overflow-x: auto; }
.inventory-table .inv-table { min-width: 960px; }
.inventory-table tbody.is-refreshing { opacity: 0.55; }
.inventory-qty { font-size: 17px; font-weight: 600; }
.inventory-qty.is-out { color: var(--inv-danger); }
.inventory-nowrap { white-space: nowrap; }
.inventory-link { font-weight: 600; color: var(--inv-green); }
.inventory-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 8px; }
.inventory-table__footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 16px 22px; background: var(--inv-accent); color: var(--inv-muted); }
.inventory-table__footer span:last-child { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; }
.inventory-bottom { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr); gap: 22px; }
.inventory-side { display: flex; flex-direction: column; gap: 22px; }
.inventory-title { display: flex; align-items: center; gap: 12px; margin-bottom: 18px !important; font-size: 22px; }
.inventory-title__icon { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: 10px; background: var(--inv-green-soft); color: var(--inv-green); }
.inventory-policy__footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 22px; font-size: 14px; font-weight: 600; color: var(--inv-muted); }
.inventory-muted { color: var(--inv-muted); }
.inventory-specs { display: flex; flex-direction: column; gap: 10px; margin: 16px 0 !important; padding: 14px; border-radius: 10px; background: var(--inv-bg); font-size: 14px; }
.inventory-specs div { display: flex; justify-content: space-between; gap: 12px; }
.inventory-specs dt { font-weight: 600; color: var(--inv-muted); }
.is-green { color: var(--inv-green); }
.is-red { color: var(--inv-danger); }
.inventory-note { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--inv-muted); }
.inventory-note svg { color: var(--inv-green); }
.inventory-help { display: flex; align-items: center; gap: 14px; }
.inventory-help div { flex: 1; }
.inventory-spin { animation: inventory-spin 1s linear infinite; }
@keyframes inventory-spin { to { transform: rotate(360deg); } }
@media (max-width: 1100px) {
  .inventory-filters__row, .inventory-bottom { grid-template-columns: 1fr; }
  .inv-sandbox { flex-wrap: wrap; }
}
</style>
