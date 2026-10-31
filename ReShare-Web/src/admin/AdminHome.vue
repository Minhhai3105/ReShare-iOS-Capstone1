<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from './auth/components/AuthShell.vue'
import AuthIcon from './auth/components/AuthIcon.vue'
import AuthAccountInfo from './auth/components/AuthAccountInfo.vue'
import logoUrl from './auth/assets/reshare-logo.png'
import { currentUser, signOut, staffAssignment } from './auth/auth.store'
import { ADMIN_ROUTE, USER_ROLE, USER_ROLE_LABEL } from './auth/auth.constants'
import { DASHBOARD_ERROR, fetchDashboardMetrics } from './dashboard/dashboard.service.js'
import {
  DONATION_QUEUE_ERROR,
  DONATION_SORT,
  DONATION_STATUS,
  DONATION_STATUS_LABEL,
} from './donations/donation.constants'
import {
  fetchDonationQueue,
  fetchQueueWarehouses,
  resolveQueueAccess,
} from './donations/donation.service'

const router = useRouter()
const isDemoBuild = import.meta.env.DEV
const filters = ref({ warehouseId: '', dateFrom: '', dateTo: '' })
const warehouses = ref([])
const tasks = ref([])
const isLoading = ref(true)
const isWarehousesLoading = ref(false)
const errorStatus = ref(null)
const warehouseErrorStatus = ref(null)
const metricData = ref(null)
const metricsLoading = ref(true)
const metricError = ref(null)
const warehouseDialog = ref(null)
const access = computed(() => resolveQueueAccess(staffAssignment.value))
const isSystemAdmin = computed(() => access.value?.isAllWarehouses === true)
const hasActiveFilters = computed(() => Boolean(
  filters.value.dateFrom
  || filters.value.dateTo
  || (isSystemAdmin.value
    ? filters.value.warehouseId
    : access.value?.warehouseIds.length === 1
      ? filters.value.warehouseId !== access.value.warehouseIds[0]
      : filters.value.warehouseId),
))
const roleLabel = computed(() => USER_ROLE_LABEL[staffAssignment.value?.role] || 'Quản trị viên')
const assignedWarehousesLabel = computed(() => {
  if (isSystemAdmin.value) return 'Toàn hệ thống'
  return staffAssignment.value?.warehouseIds?.join(', ') || 'Chưa được phân công kho'
})
const scopeLabel = computed(() => {
  if (!access.value) return 'Không xác định'
  if (filters.value.warehouseId) {
    return warehouses.value.find((warehouse) => warehouse.id === filters.value.warehouseId)?.name
      || filters.value.warehouseId
  }
  if (access.value.isAllWarehouses) return 'Tất cả kho'
  return warehouses.value.map((warehouse) => warehouse.name).join(', ')
    || access.value.warehouseIds.join(', ')
    || 'Chưa được phân công kho'
})
const selectedWarehouseLabel = computed(() => {
  if (filters.value.warehouseId) return scopeLabel.value
  return isSystemAdmin.value ? 'Tất cả kho' : 'Tất cả kho được giao'
})
const demoWarehouse = computed(() => staffAssignment.value?.warehouseIds?.[0]
  || (staffAssignment.value?.role === USER_ROLE.systemAdmin ? 'demo-hub' : null))
const taskErrorMessage = computed(() => {
  if (errorStatus.value === DONATION_QUEUE_ERROR.forbidden) return 'Bạn không có quyền xem dữ liệu trong phạm vi này.'
  if (errorStatus.value === DONATION_QUEUE_ERROR.indexRequired) return 'Truy vấn cần chỉ mục Firestore chưa được triển khai. Hãy báo người quản trị hệ thống.'
  return 'Không thể tải tác vụ từ Firestore. Kiểm tra kết nối rồi thử lại.'
})

const metricErrorMessage = computed(() => {
  if (metricError.value === 404) return 'API chỉ số chưa được triển khai. Danh sách tác vụ vẫn có thể sử dụng.'
  if ([401, 403].includes(metricError.value)) return 'Bạn không có quyền xem chỉ số trong phạm vi này.'
  if (metricError.value === 400) return 'Bộ lọc chỉ số không hợp lệ. Kiểm tra lại kho và khoảng ngày.'
  // Lệch contract thì thử lại cũng vô ích, phải báo đúng để người dùng đi tìm người sửa.
  if (metricError.value === DASHBOARD_ERROR.invalidPayload) {
    return 'API chỉ số trả dữ liệu không đúng cấu trúc. Hãy báo người phát triển backend.'
  }
  if (metricError.value === 'TIMEOUT') return 'Tải chỉ số quá lâu. Hãy thử lại.'
  return 'Không thể tải chỉ số vận hành. Hãy thử lại.'
})
const stockUnits = computed(() => Object.entries(metricData.value?.metrics?.inventoryAvailableByUnit || {})
  .filter(([unitId, quantity]) => unitId !== 'other' && quantity !== 0)
  .map(([unitId, quantity]) => ({
    label: { piece: 'cái', kg: 'kg', bag: 'túi', box: 'thùng', set: 'bộ' }[unitId] || unitId,
    quantity: new Intl.NumberFormat('vi-VN').format(quantity),
  })))
const hasOtherStockUnits = computed(() => Boolean(metricData.value?.metrics?.inventoryAvailableByUnit?.other))
function metricValue(value) {
  if (metricsLoading.value) return 'Đang tải…'
  if (metricError.value || value === undefined) return 'Chưa tải được'
  return new Intl.NumberFormat('vi-VN').format(value)
}
const stockValue = computed(() => {
  if (metricsLoading.value || metricError.value) return metricValue()
  if (stockUnits.value.length) return 'Theo đơn vị'
  return hasOtherStockUnits.value ? 'Chưa chuẩn hoá' : '0'
})
const metrics = computed(() => [
  {
    title: 'Quyên góp chờ xử lý',
    value: metricValue(metricData.value?.metrics?.pendingDonations),
    note: 'Đơn đang pending, theo kho và ngày tạo.',
    icon: 'clock',
  },
  {
    title: 'Quyên góp đã duyệt',
    value: metricValue(metricData.value?.metrics?.approvedDonations),
    note: 'Đơn đang approved, theo kho và ngày tạo.',
    icon: 'check',
  },
  {
    title: 'Tồn kho khả dụng',
    value: stockValue.value,
    note: filters.value.dateTo
      ? 'Tồn tại cuối ngày Đến ngày; Từ ngày không áp dụng cho tồn kho.'
      : 'Tồn tại thời điểm hiện tại; Từ ngày không áp dụng cho tồn kho.',
    icon: 'server',
    units: metricsLoading.value || metricError.value ? [] : stockUnits.value,
  },
  {
    title: 'Phiếu phân phối đã xác nhận',
    value: metricValue(metricData.value?.metrics?.confirmedDistributions),
    note: 'Phiếu confirmed, theo kho và ngày tạo.',
    icon: 'warehouse',
  },
])

let latestTaskRequestId = 0
let latestWarehouseRequestId = 0
let latestMetricRequestId = 0
let metricAbort = null

function formatCreatedAt(value) {
  if (!value) return 'Chưa có thời gian'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Chưa có thời gian'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}

function warehouseLabel(donation) {
  if (!donation.warehouseId) return 'Chưa gán kho'
  return warehouses.value.find((warehouse) => warehouse.id === donation.warehouseId)?.name
    || donation.warehouseName
    || donation.warehouseId
}

async function loadMetrics() {
  const requestId = ++latestMetricRequestId
  metricAbort?.abort()
  metricData.value = null
  metricError.value = null
  metricsLoading.value = true

  if (!resolveQueueAccess(staffAssignment.value)) {
    metricError.value = 403
    metricsLoading.value = false
    return
  }

  const controller = new AbortController()
  metricAbort = controller
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const result = await fetchDashboardMetrics(filters.value, controller.signal)
    if (requestId === latestMetricRequestId) metricData.value = result
  } catch (error) {
    if (requestId === latestMetricRequestId) {
      metricError.value = error?.name === 'AbortError' ? 'TIMEOUT' : error?.status || 'NETWORK'
    }
  } finally {
    clearTimeout(timeout)
    if (requestId === latestMetricRequestId) {
      metricsLoading.value = false
      metricAbort = null
    }
  }
}

async function loadTasks() {
  const requestId = ++latestTaskRequestId
  const currentAccess = resolveQueueAccess(staffAssignment.value)
  isLoading.value = true
  errorStatus.value = null

  if (!currentAccess) {
    tasks.value = []
    errorStatus.value = DONATION_QUEUE_ERROR.forbidden
    isLoading.value = false
    return
  }

  try {
    const result = await fetchDonationQueue(currentAccess, {
      search: '',
      status: DONATION_STATUS.pending,
      warehouseId: filters.value.warehouseId,
      category: '',
      dateFrom: filters.value.dateFrom,
      dateTo: filters.value.dateTo,
      sort: DONATION_SORT.newestFirst,
      page: 1,
      cursor: null,
    })
    if (requestId !== latestTaskRequestId) return
    tasks.value = result.items
  } catch (error) {
    if (requestId !== latestTaskRequestId) return
    tasks.value = []
    errorStatus.value = error?.status ?? error?.code ?? DONATION_QUEUE_ERROR.network
  } finally {
    if (requestId === latestTaskRequestId) isLoading.value = false
  }
}

async function loadWarehouses() {
  const requestId = ++latestWarehouseRequestId
  const currentAccess = resolveQueueAccess(staffAssignment.value)
  isWarehousesLoading.value = true
  warehouseErrorStatus.value = null

  if (!currentAccess) {
    warehouses.value = []
    warehouseErrorStatus.value = DONATION_QUEUE_ERROR.forbidden
    isWarehousesLoading.value = false
    return
  }

  try {
    const availableWarehouses = await fetchQueueWarehouses(currentAccess)
    if (requestId !== latestWarehouseRequestId) return
    warehouses.value = availableWarehouses

    if (filters.value.warehouseId
      && !availableWarehouses.some((warehouse) => warehouse.id === filters.value.warehouseId)) {
      filters.value.warehouseId = ''
      loadTasks()
      loadMetrics()
    }
  } catch (error) {
    if (requestId !== latestWarehouseRequestId) return
    warehouseErrorStatus.value = error?.status ?? error?.code ?? DONATION_QUEUE_ERROR.network
    warehouses.value = currentAccess.isAllWarehouses
      ? []
      : currentAccess.warehouseIds.map((id) => ({ id, name: id }))
  } finally {
    if (requestId === latestWarehouseRequestId) isWarehousesLoading.value = false
  }
}

function refreshDashboard() {
  const currentAccess = resolveQueueAccess(staffAssignment.value)
  if (!currentAccess) {
    filters.value.warehouseId = ''
    tasks.value = []
    warehouses.value = []
    errorStatus.value = DONATION_QUEUE_ERROR.forbidden
    warehouseErrorStatus.value = DONATION_QUEUE_ERROR.forbidden
    metricData.value = null
    metricError.value = 403
    metricsLoading.value = false
    isLoading.value = false
    isWarehousesLoading.value = false
    latestTaskRequestId += 1
    latestWarehouseRequestId += 1
    latestMetricRequestId += 1
    metricAbort?.abort()
    return
  }

  if (!currentAccess.isAllWarehouses && currentAccess.warehouseIds.length === 1) {
    filters.value.warehouseId = currentAccess.warehouseIds[0]
  } else if (filters.value.warehouseId
    && !currentAccess.isAllWarehouses
    && !currentAccess.warehouseIds.includes(filters.value.warehouseId)) {
    filters.value.warehouseId = ''
  }

  loadWarehouses()
  loadTasks()
  loadMetrics()
}

function onFilterChange() {
  loadTasks()
  loadMetrics()
}

function resetFilters() {
  filters.value.dateFrom = ''
  filters.value.dateTo = ''
  if (!isSystemAdmin.value && access.value?.warehouseIds.length === 1) {
    filters.value.warehouseId = access.value.warehouseIds[0]
  } else {
    filters.value.warehouseId = ''
  }
  loadTasks()
  loadMetrics()
}

function openWarehouseSelector() {
  if (!isWarehousesLoading.value) warehouseDialog.value?.showModal()
}

function chooseWarehouse(warehouseId) {
  filters.value.warehouseId = warehouseId
  warehouseDialog.value?.close()
  onFilterChange()
}

async function onSignOutClick() {
  await signOut()
  router.replace({ name: ADMIN_ROUTE.login })
}

onMounted(refreshDashboard)
watch(staffAssignment, refreshDashboard)
onBeforeUnmount(() => {
  latestTaskRequestId += 1
  latestWarehouseRequestId += 1
  latestMetricRequestId += 1
  metricAbort?.abort()
})
</script>

<template>
  <AuthShell>
    <div v-if="currentUser && staffAssignment" class="admin-ops">
      <aside class="admin-ops__sidebar" aria-label="Thanh điều hướng quản trị">
        <div class="admin-ops__brand">
          <img :src="logoUrl" alt="" />
          <span><strong>ReShare</strong><small>Admin Portal</small></span>
        </div>
        <p class="admin-ops__nav-heading">Vận hành kho & xử lý</p>
        <nav class="admin-ops__nav" aria-label="Điều hướng quản trị">
          <RouterLink :to="{ name: ADMIN_ROUTE.home }" aria-current="page" class="admin-ops__nav-link admin-ops__nav-link--active">
            <AuthIcon name="dashboard" :size="17" />Tổng quan
          </RouterLink>
          <RouterLink :to="{ name: ADMIN_ROUTE.donationQueue }" class="admin-ops__nav-link">
            <AuthIcon name="inbox" :size="17" />Tiếp nhận quyên góp
          </RouterLink>
          <RouterLink :to="{ name: ADMIN_ROUTE.inventory }" class="admin-ops__nav-link">
            <AuthIcon name="shelves" :size="17" />Kho hàng
          </RouterLink>
          <RouterLink :to="{ name: ADMIN_ROUTE.beneficiaryList }" class="admin-ops__nav-link">
            <AuthIcon name="users" :size="17" />Người thụ hưởng
          </RouterLink>
          <RouterLink :to="{ name: 'admin-distribution' }" class="admin-ops__nav-link">
            <AuthIcon name="warehouse" :size="17" />Xuất kho & phân phối
          </RouterLink>
          <RouterLink :to="{ name: 'admin-reports' }" class="admin-ops__nav-link">
            <AuthIcon name="chart" :size="17" />Báo cáo
          </RouterLink>
          <RouterLink v-if="isSystemAdmin" :to="{ name: ADMIN_ROUTE.staff }" class="admin-ops__nav-link">
            <AuthIcon name="users" :size="17" />Nhân sự & phân quyền
          </RouterLink>
        </nav>
        <div class="admin-ops__sidebar-footer"><AuthIcon name="shield-check" :size="17" />{{ roleLabel }}</div>
      </aside>

      <div class="admin-ops__body">
        <header class="admin-ops__topbar">
          <strong class="admin-ops__topbar-title">ReShare <span>Admin Portal</span></strong>
          <button
            type="button"
            class="admin-ops__warehouse-button"
            :disabled="isWarehousesLoading"
            aria-haspopup="dialog"
            @click="openWarehouseSelector"
          >
            <AuthIcon name="warehouse" :size="17" />{{ selectedWarehouseLabel }} <span aria-hidden="true">⌄</span>
          </button>
          <span class="admin-ops__topbar-role"><AuthIcon name="shield-check" :size="16" />{{ roleLabel }}</span>
          <span class="admin-ops__user"><AuthIcon name="user" :size="18" />{{ currentUser.displayName || currentUser.email }}</span>
        </header>
        <div class="admin-ops__content">
          <section class="admin-dashboard" aria-labelledby="admin-dashboard-title">
            <header class="admin-dashboard__header">
              <div class="admin-dashboard__intro">
                <p class="admin-dashboard__eyebrow">ReShare · Portal vận hành</p>
                <h1 id="admin-dashboard-title">Tổng quan vận hành</h1>
                <p>Theo dõi các yêu cầu quyên góp cần xử lý trong phạm vi kho được cấp quyền.</p>
              </div>
              <div class="admin-dashboard__header-actions">
                <span class="auth-chip admin-dashboard__role"><span class="auth-dot" />{{ roleLabel }}</span>
                <RouterLink :to="{ name: ADMIN_ROUTE.donationQueue }" class="auth-btn auth-btn--primary">
                  <AuthIcon name="inbox" />Mở hàng đợi
                </RouterLink>
              </div>
            </header>

            <section class="admin-dashboard__scope auth-card" aria-label="Thông tin phạm vi truy cập">
              <div class="admin-dashboard__scope-copy">
                <span class="admin-dashboard__scope-icon"><AuthIcon name="shield" :size="20" /></span>
                <div>
                  <h2>Phạm vi dữ liệu</h2>
                  <p><strong>{{ scopeLabel }}</strong> · Kho áp dụng cho mọi khu vực. Từ/Đến ngày áp dụng cho đơn và phiếu; tồn kho tính đến cuối ngày Đến ngày.</p>
                </div>
              </div>
              <AuthAccountInfo :user="currentUser" :assignment="staffAssignment" class="admin-dashboard__account">
                <div>
                  <dt>Kho được giao</dt>
                  <dd class="auth-mono">{{ assignedWarehousesLabel }}</dd>
                </div>
              </AuthAccountInfo>
            </section>

            <div v-if="metricError" class="admin-dashboard__inline-alert" role="alert">
              {{ metricErrorMessage }}
              <button type="button" class="auth-btn auth-btn--soft" @click="loadMetrics"><AuthIcon name="refresh" :size="16" />Thử lại</button>
            </div>

            <section class="admin-dashboard__metrics" aria-label="Chỉ số vận hành" :aria-busy="metricsLoading">
              <article v-for="metric in metrics" :key="metric.title" class="admin-dashboard__metric auth-card">
                <div class="admin-dashboard__metric-top">
                  <span class="admin-dashboard__metric-icon"><AuthIcon :name="metric.icon" :size="20" /></span>
                  <span class="admin-dashboard__metric-label">{{ metric.title }}</span>
                </div>
                <strong class="admin-dashboard__metric-value">{{ metric.value }}</strong>
                <ul v-if="metric.units?.length" class="admin-dashboard__unit-list">
                  <li v-for="unit in metric.units" :key="unit.label"><strong>{{ unit.quantity }}</strong> {{ unit.label }}</li>
                </ul>
                <p v-if="metric.title === 'Tồn kho khả dụng' && hasOtherStockUnits" class="admin-dashboard__unit-warning">Có đơn vị chưa chuẩn hoá; không cộng vào các số trên.</p>
                <p>{{ metric.note }}</p>
              </article>
            </section>

            <section class="admin-dashboard__tasks auth-card" aria-labelledby="admin-dashboard-tasks-title">
              <header class="admin-dashboard__section-header">
                <div>
                  <p class="admin-dashboard__eyebrow">Ưu tiên xử lý</p>
                  <h2 id="admin-dashboard-tasks-title">Quyên góp đang chờ duyệt</h2>
                  <p>Danh sách tác vụ thật từ hàng đợi; tối đa 10 mục theo giới hạn trang hiện có.</p>
                </div>
                <button
                  type="button"
                  class="auth-btn auth-btn--soft"
                  :disabled="isLoading"
                  @click="refreshDashboard"
                >
                  <AuthIcon :name="isLoading ? 'loader' : 'refresh'" :size="18" :class="{ 'auth-spin': isLoading }" />
                  Làm mới
                </button>
              </header>

              <div class="admin-dashboard__filters" aria-label="Lọc chỉ số và tác vụ">
                <div class="admin-dashboard__field">
                  <span>Kho</span>
                  <button type="button" class="admin-dashboard__warehouse-filter" :disabled="isWarehousesLoading" @click="openWarehouseSelector"><AuthIcon name="warehouse" :size="16" />{{ selectedWarehouseLabel }}</button>
                </div>
                <label class="admin-dashboard__field">
                  <span>Từ ngày</span>
                  <input v-model="filters.dateFrom" type="date" :max="filters.dateTo || undefined" @change="onFilterChange" />
                </label>
                <label class="admin-dashboard__field">
                  <span>Đến ngày</span>
                  <input v-model="filters.dateTo" type="date" :min="filters.dateFrom || undefined" @change="onFilterChange" />
                </label>
                <button
                  type="button"
                  class="auth-btn auth-btn--soft admin-dashboard__reset"
                  :disabled="!hasActiveFilters"
                  @click="resetFilters"
                >
                  <AuthIcon name="refresh" :size="18" />Đặt lại
                </button>
              </div>

              <p v-if="warehouseErrorStatus" class="admin-dashboard__inline-alert" role="status">
                Không tải được danh sách tên kho. {{ isSystemAdmin ? 'Bạn vẫn có thể xem tất cả kho; bộ lọc kho riêng lẻ tạm thời không khả dụng.' : 'Danh sách được giới hạn ở các kho đã phân công.' }}
              </p>

              <div v-if="isLoading" class="admin-dashboard__task-state" aria-live="polite" aria-busy="true">
                <span class="admin-dashboard__loader"><AuthIcon name="loader" :size="22" class="auth-spin" /></span>
                <p>Đang tải tác vụ trong phạm vi được cấp quyền…</p>
              </div>

              <div v-else-if="errorStatus" class="admin-dashboard__task-state admin-dashboard__task-state--error" role="alert">
                <span class="admin-dashboard__loader"><AuthIcon name="cloud-off" :size="22" /></span>
                <p>{{ taskErrorMessage }}</p>
                <button type="button" class="auth-btn auth-btn--soft" @click="loadTasks">
                  <AuthIcon name="refresh" :size="18" />Thử lại
                </button>
              </div>

              <div v-else-if="!tasks.length" class="admin-dashboard__task-state" aria-live="polite">
                <span class="admin-dashboard__loader"><AuthIcon name="inbox" :size="22" /></span>
                <p>Không có yêu cầu chờ duyệt phù hợp với bộ lọc hiện tại.</p>
              </div>

              <ul v-else class="admin-dashboard__task-list" :aria-busy="isLoading">
                <li v-for="task in tasks" :key="task.id" class="admin-dashboard__task">
                  <span class="admin-dashboard__task-icon"><AuthIcon name="heart-handshake" :size="20" /></span>
                  <div class="admin-dashboard__task-main">
                    <RouterLink
                      class="admin-dashboard__task-title"
                      :to="{ name: 'admin-donation-detail', params: { donationId: task.id } }"
                    >{{ task.title || `Yêu cầu ${task.id}` }}</RouterLink>
                    <span class="admin-dashboard__task-meta">
                      <span class="auth-mono">#{{ task.id }}</span>
                      <span>{{ warehouseLabel(task) }}</span>
                      <time :datetime="task.createdAt">{{ formatCreatedAt(task.createdAt) }}</time>
                    </span>
                  </div>
                  <span class="admin-dashboard__status">{{ DONATION_STATUS_LABEL[task.status] || 'Chờ duyệt' }}</span>
                  <RouterLink
                    class="admin-dashboard__task-action"
                    :to="{ name: 'admin-donation-detail', params: { donationId: task.id } }"
                    :aria-label="`Xem yêu cầu ${task.id}`"
                  >
                    Xem <AuthIcon name="arrow-right" :size="16" />
                  </RouterLink>
                </li>
              </ul>

              <footer class="admin-dashboard__tasks-footer">
                <span v-if="tasks.length">Đang hiển thị {{ tasks.length }} yêu cầu phù hợp; đây không phải tổng số toàn hệ thống.</span>
                <RouterLink :to="{ name: ADMIN_ROUTE.donationQueue }" class="admin-dashboard__all-tasks">
                  Xem hàng đợi <AuthIcon name="arrow-right" :size="16" />
                </RouterLink>
              </footer>
            </section>

            <nav class="admin-dashboard__shortcuts" aria-label="Liên kết quản trị">
              <RouterLink
                v-if="staffAssignment.role === USER_ROLE.systemAdmin"
                :to="{ name: ADMIN_ROUTE.staff }"
                class="auth-btn auth-btn--soft"
              >
                <AuthIcon name="users" />Quản lý nhân sự
              </RouterLink>
              <RouterLink :to="{ name: ADMIN_ROUTE.donationQueue }" class="auth-btn auth-btn--soft">
                <AuthIcon name="inbox" />Hàng đợi yêu cầu quyên góp
              </RouterLink>
              <RouterLink
                v-if="isDemoBuild && demoWarehouse"
                :to="{ name: 'admin-donation-detail', params: { warehouseId: demoWarehouse, donationId: 'demo-001' } }"
                class="auth-btn auth-btn--soft"
              >
                <AuthIcon name="eye" />Xem trước donation (DEV)
              </RouterLink>
              <button type="button" class="auth-btn auth-btn--soft" @click="onSignOutClick">
                <AuthIcon name="log-out" />Đăng xuất
              </button>
            </nav>
          </section>
        </div>
      </div>
      <dialog ref="warehouseDialog" class="admin-ops__dialog" aria-labelledby="warehouse-selector-title">
        <div class="admin-ops__dialog-header">
          <h2 id="warehouse-selector-title">Chọn không gian kho làm việc</h2>
          <button type="button" aria-label="Đóng bộ chọn kho" @click="warehouseDialog?.close()">×</button>
        </div>
        <p>Các kho bạn có quyền truy cập. Chọn kho để cập nhật chỉ số và tác vụ.</p>
        <div class="admin-ops__warehouse-list">
          <button type="button" :aria-pressed="!filters.warehouseId" @click="chooseWarehouse('')">
            <AuthIcon name="dashboard" :size="18" />
            <span><strong>{{ isSystemAdmin ? 'Tất cả kho' : 'Tất cả kho được giao' }}</strong><small>Phạm vi {{ isSystemAdmin ? 'toàn hệ thống' : 'được phân công' }}</small></span>
            <AuthIcon v-if="!filters.warehouseId" name="check" :size="18" />
          </button>
          <button
            v-for="warehouse in warehouses"
            :key="warehouse.id"
            type="button"
            :aria-pressed="filters.warehouseId === warehouse.id"
            @click="chooseWarehouse(warehouse.id)"
          >
            <AuthIcon name="warehouse" :size="18" />
            <span><strong>{{ warehouse.name }}</strong><small>{{ warehouse.id }}</small></span>
            <AuthIcon v-if="filters.warehouseId === warehouse.id" name="check" :size="18" />
          </button>
        </div>
        <p v-if="warehouseErrorStatus" class="admin-dashboard__inline-alert">Không tải được tên kho. Hãy thử lại sau.</p>
      </dialog>
    </div>
    <div v-else class="admin-ops__pending" role="status">Đang tải quyền truy cập…</div>
  </AuthShell>
</template>

<style scoped>
:deep(.auth-shell__header),
:deep(.auth-shell__footer) {
  display: none;
}

:deep(.auth-shell__main) {
  display: block;
  padding: 0;
}

.admin-ops {
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr);
  min-height: 100vh;
  background: #f6f7fb;
}

.admin-ops__sidebar {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  padding: 24px 16px;
  border-right: 1px solid var(--auth-border);
  background: var(--auth-surface);
}

.admin-ops__brand,
.admin-ops__nav-link,
.admin-ops__sidebar-footer,
.admin-ops__topbar,
.admin-ops__warehouse-button,
.admin-ops__topbar-role,
.admin-ops__user {
  display: flex;
  align-items: center;
}

.admin-ops__brand { gap: 10px; color: var(--auth-primary); }
.admin-ops__brand img { width: 36px; height: 36px; }
.admin-ops__brand span { display: flex; flex-direction: column; line-height: 1.2; }
.admin-ops__brand small { color: var(--auth-text-secondary); font-size: 11px; }
.admin-ops__nav-heading { margin: 0; color: var(--auth-text-tertiary); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.admin-ops__nav { display: flex; flex-direction: column; gap: 5px; }
.admin-ops__nav-link { gap: 10px; min-height: 42px; padding: 8px 10px; border-radius: 8px; color: var(--auth-text-secondary); font-size: 13px; text-decoration: none; }
.admin-ops__nav-link:hover { background: var(--auth-primary-soft); color: var(--auth-primary); }
.admin-ops__nav-link--active { background: var(--auth-primary); color: white; font-weight: 700; }
.admin-ops__nav-link--active:hover { background: var(--auth-primary-hover); color: white; }
.admin-ops__sidebar-footer { gap: 8px; margin-top: auto; padding: 12px; border-radius: 9px; background: var(--auth-accent-soft); color: var(--auth-text-secondary); font-size: 12px; }
.admin-ops__body { min-width: 0; }
.admin-ops__topbar { flex-wrap: wrap; gap: 12px; min-height: 70px; padding: 12px 24px; border-bottom: 1px solid var(--auth-border); background: var(--auth-surface); }
.admin-ops__topbar-title { margin-right: auto; color: var(--auth-primary); white-space: nowrap; }
.admin-ops__topbar-title span { display: block; color: var(--auth-text-tertiary); font-size: 11px; font-weight: 500; }
.admin-ops__warehouse-button,
.admin-dashboard__warehouse-filter { gap: 8px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--auth-border); border-radius: 8px; background: var(--auth-surface); color: var(--auth-text); cursor: pointer; font: inherit; text-align: left; }
.admin-ops__warehouse-button:disabled,
.admin-dashboard__warehouse-filter:disabled { cursor: not-allowed; opacity: .6; }
.admin-ops__topbar-role { gap: 6px; padding: 7px 10px; border-radius: 999px; background: var(--auth-primary-soft); color: var(--auth-primary); font-size: 12px; }
.admin-ops__user { gap: 7px; min-width: 0; max-width: 230px; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.admin-ops__content { padding: 26px; }
.admin-ops__pending { padding: 48px; }
.admin-ops__dialog { width: min(500px, calc(100vw - 32px)); max-height: min(650px, calc(100vh - 32px)); padding: 22px; border: 1px solid var(--auth-border); border-radius: 14px; box-shadow: var(--auth-shadow); color: var(--auth-text); }
.admin-ops__dialog::backdrop { background: rgb(18 29 25 / .55); }
.admin-ops__dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.admin-ops__dialog-header h2 { margin: 0; font-size: 18px; }
.admin-ops__dialog-header button { border: 0; background: transparent; font-size: 26px; cursor: pointer; }
.admin-ops__dialog > p { margin: 10px 0 16px; color: var(--auth-text-secondary); font-size: 13px; }
.admin-ops__warehouse-list { display: flex; flex-direction: column; gap: 8px; overflow: auto; }
.admin-ops__warehouse-list button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 58px; padding: 10px; border: 1px solid var(--auth-border); border-radius: 9px; background: white; color: var(--auth-text); cursor: pointer; text-align: left; }
.admin-ops__warehouse-list button[aria-pressed="true"] { border-color: var(--auth-primary); background: var(--auth-primary-soft); }
.admin-ops__warehouse-list button span { display: flex; flex: 1; flex-direction: column; }
.admin-ops__warehouse-list button small { color: var(--auth-text-tertiary); }
.admin-dashboard__warehouse-filter { width: 100%; }
.admin-dashboard__unit-list { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; margin: 6px 0; list-style: none; }
.admin-dashboard__unit-list li { padding: 4px 7px; border-radius: 5px; background: var(--auth-primary-soft); color: var(--auth-primary); font-size: 12px; }
.admin-dashboard__unit-warning { color: var(--auth-warning) !important; }
.admin-dashboard__inline-alert .auth-btn { margin-left: 10px; }

.admin-dashboard {
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
}

.admin-dashboard__header,
.admin-dashboard__header-actions,
.admin-dashboard__scope-copy,
.admin-dashboard__metric-top,
.admin-dashboard__section-header,
.admin-dashboard__task,
.admin-dashboard__task-meta,
.admin-dashboard__tasks-footer,
.admin-dashboard__shortcuts {
  display: flex;
  align-items: center;
}

.admin-dashboard__header,
.admin-dashboard__section-header,
.admin-dashboard__tasks-footer {
  justify-content: space-between;
  gap: 20px;
}

.admin-dashboard__header {
  align-items: flex-start;
  flex-wrap: wrap;
}

.admin-dashboard__intro h1 {
  margin: 2px 0 6px;
  font-size: clamp(28px, 4vw, 36px);
  line-height: 1.2;
}

.admin-dashboard__intro > p:last-child,
.admin-dashboard__section-header > div > p:last-child {
  color: var(--auth-text-secondary);
}

.admin-dashboard__eyebrow {
  color: var(--auth-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-dashboard__header-actions,
.admin-dashboard__shortcuts {
  flex-wrap: wrap;
  gap: 10px;
}

.admin-dashboard__header-actions .auth-btn,
.admin-dashboard__shortcuts .auth-btn {
  text-decoration: none;
}

.admin-dashboard__role {
  text-transform: none;
  letter-spacing: 0;
}

.admin-dashboard__scope {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 0.7fr);
  align-items: center;
  gap: 20px;
  padding: 18px 22px;
}

.admin-dashboard__scope-copy {
  gap: 12px;
}

.admin-dashboard__scope-copy h2 {
  margin-bottom: 3px;
  font-size: 15px;
}

.admin-dashboard__scope-copy p {
  color: var(--auth-text-secondary);
  overflow-wrap: anywhere;
}

.admin-dashboard__scope-icon,
.admin-dashboard__metric-icon,
.admin-dashboard__task-icon,
.admin-dashboard__loader {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--auth-primary-soft);
  color: var(--auth-primary);
}

.admin-dashboard__account {
  min-width: 0;
  padding-left: 20px;
  border-left: 1px solid var(--auth-border);
}

.admin-dashboard__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.admin-dashboard__metric {
  min-width: 0;
  padding: 20px;
}

.admin-dashboard__metric-top {
  gap: 11px;
}

.admin-dashboard__metric-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--auth-text-secondary);
}

.admin-dashboard__metric-value {
  display: block;
  margin: 16px 0 5px;
  font-size: clamp(16px, 1.5vw, 20px);
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.admin-dashboard__metric > p {
  color: var(--auth-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.admin-dashboard__tasks {
  min-width: 0;
  padding: 22px;
}

.admin-dashboard__section-header {
  align-items: flex-start;
  margin-bottom: 20px;
}

.admin-dashboard__section-header h2 {
  margin: 3px 0 4px;
  font-size: 20px;
}

.admin-dashboard__section-header > div > p:last-child {
  font-size: 13px;
}

.admin-dashboard__filters {
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) repeat(2, minmax(150px, 1fr)) auto;
  align-items: end;
  gap: 12px;
  padding: 16px;
  margin-bottom: 14px;
  border: 1px solid var(--auth-border);
  border-radius: 12px;
  background: #fafbfc;
}

.admin-dashboard__field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  color: var(--auth-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.admin-dashboard__field select,
.admin-dashboard__field input {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 9px 11px;
  border: 1px solid var(--auth-border);
  border-radius: 8px;
  background: var(--auth-surface);
  color: var(--auth-text);
  font: inherit;
}

.admin-dashboard__field :disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.admin-dashboard__reset {
  white-space: nowrap;
}

.admin-dashboard__inline-alert {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--auth-warning-soft);
  color: var(--auth-warning);
  font-size: 13px;
}

.admin-dashboard__task-state {
  display: flex;
  min-height: 150px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  color: var(--auth-text-secondary);
  text-align: center;
}

.admin-dashboard__task-state--error {
  color: var(--auth-danger);
}

.admin-dashboard__task-state--error .admin-dashboard__loader {
  background: var(--auth-danger-soft);
  color: var(--auth-danger);
}

.admin-dashboard__task-state .auth-btn {
  margin-top: 4px;
}

.admin-dashboard__task-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.admin-dashboard__task {
  min-width: 0;
  gap: 14px;
  padding: 15px 4px;
  border-bottom: 1px solid var(--auth-border);
}

.admin-dashboard__task-icon {
  width: 40px;
  height: 40px;
}

.admin-dashboard__task-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.admin-dashboard__task-title {
  overflow: hidden;
  color: var(--auth-text);
  font-weight: 700;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-dashboard__task-title:hover,
.admin-dashboard__task-action:hover,
.admin-dashboard__all-tasks:hover {
  text-decoration: underline;
}

.admin-dashboard__task-title:focus-visible,
.admin-dashboard__task-action:focus-visible,
.admin-dashboard__all-tasks:focus-visible {
  border-radius: 4px;
  outline: 3px solid rgb(31 107 44 / 0.35);
  outline-offset: 3px;
}

.admin-dashboard__task-meta {
  flex-wrap: wrap;
  gap: 5px 14px;
  color: var(--auth-text-tertiary);
  font-size: 12px;
}

.admin-dashboard__status {
  flex: 0 0 auto;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--auth-warning-soft);
  color: var(--auth-warning);
  font-size: 12px;
  font-weight: 700;
}

.admin-dashboard__task-action,
.admin-dashboard__all-tasks {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  color: var(--auth-primary);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.admin-dashboard__tasks-footer {
  padding-top: 16px;
  color: var(--auth-text-tertiary);
  font-size: 12px;
}

.admin-dashboard__shortcuts {
  justify-content: flex-end;
}

@media (max-width: 1000px) {
  .admin-ops { grid-template-columns: minmax(0, 1fr); }
  .admin-ops__sidebar { gap: 10px; padding: 12px 18px; border-right: 0; border-bottom: 1px solid var(--auth-border); }
  .admin-ops__nav { flex-direction: row; flex-wrap: wrap; }
  .admin-ops__sidebar-footer,
  .admin-ops__nav-heading { display: none; }

  .admin-dashboard__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .admin-dashboard__filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .admin-dashboard__reset {
    justify-self: start;
  }
}

@media (max-width: 640px) {
  .admin-ops__content { padding: 16px; }
  .admin-ops__topbar { padding: 12px 16px; }
  .admin-ops__topbar-role { display: none; }
  .admin-ops__user { max-width: 100%; }
  .admin-ops__nav { flex-wrap: nowrap; overflow-x: auto; }
  .admin-ops__nav-link { flex: 0 0 auto; }
  .admin-ops__dialog { padding: 16px; }

  .admin-dashboard {
    gap: 16px;
  }

  .admin-dashboard__header-actions {
    width: 100%;
  }

  .admin-dashboard__scope {
    grid-template-columns: minmax(0, 1fr);
    padding: 16px;
  }

  .admin-dashboard__account {
    padding: 14px 0 0;
    border-top: 1px solid var(--auth-border);
    border-left: 0;
  }

  .admin-dashboard__metrics {
    gap: 10px;
  }

  .admin-dashboard__metric {
    padding: 14px;
  }

  .admin-dashboard__metric-top {
    align-items: flex-start;
  }

  .admin-dashboard__metric-icon {
    width: 34px;
    height: 34px;
  }

  .admin-dashboard__tasks {
    padding: 16px;
  }

  .admin-dashboard__section-header {
    flex-direction: column;
  }

  .admin-dashboard__filters {
    grid-template-columns: minmax(0, 1fr);
    padding: 12px;
  }

  .admin-dashboard__task {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 10px;
  }

  .admin-dashboard__task-main {
    flex-basis: calc(100% - 52px);
  }

  .admin-dashboard__task-meta {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .admin-dashboard__status {
    margin-left: 50px;
  }

  .admin-dashboard__tasks-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
