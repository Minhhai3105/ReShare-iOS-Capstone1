<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from './auth/components/AuthShell.vue'
import AuthIcon from './auth/components/AuthIcon.vue'
import AuthAccountInfo from './auth/components/AuthAccountInfo.vue'
import { currentUser, signOut, staffAssignment } from './auth/auth.store'
import { ADMIN_ROUTE, USER_ROLE, USER_ROLE_LABEL } from './auth/auth.constants'
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
const demoWarehouse = computed(() => staffAssignment.value?.warehouseIds?.[0]
  || (staffAssignment.value?.role === USER_ROLE.systemAdmin ? 'demo-hub' : null))
const taskErrorMessage = computed(() => {
  if (errorStatus.value === DONATION_QUEUE_ERROR.forbidden) return 'Bạn không có quyền xem dữ liệu trong phạm vi này.'
  if (errorStatus.value === DONATION_QUEUE_ERROR.indexRequired) return 'Truy vấn cần chỉ mục Firestore chưa được triển khai. Hãy báo người quản trị hệ thống.'
  return 'Không thể tải tác vụ từ Firestore. Kiểm tra kết nối rồi thử lại.'
})

const metrics = [
  {
    title: 'Quyên góp chờ xử lý',
    value: 'Chưa có tổng số',
    note: 'Nguồn hàng đợi hiện chỉ trả danh sách phân trang.',
    icon: 'clock',
  },
  {
    title: 'Quyên góp đã duyệt',
    value: 'Chưa có số liệu',
    note: 'Chưa có nguồn tổng hợp trạng thái để tính chính xác.',
    icon: 'check',
  },
  {
    title: 'Tình trạng tồn kho',
    value: 'Chưa có nguồn dữ liệu',
    note: 'Chưa có nguồn tồn kho vận hành được xác minh.',
    icon: 'box',
  },
  {
    title: 'Tình hình phân phối',
    value: 'Chưa có nguồn dữ liệu',
    note: 'Chưa có nguồn tổng hợp phân phối vận hành được xác minh.',
    icon: 'warehouse',
  },
]

let latestTaskRequestId = 0
let latestWarehouseRequestId = 0

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
    isLoading.value = false
    isWarehousesLoading.value = false
    latestTaskRequestId += 1
    latestWarehouseRequestId += 1
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
}

function onFilterChange() {
  loadTasks()
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
})
</script>

<template>
  <AuthShell>
    <section
      v-if="currentUser && staffAssignment"
      class="admin-dashboard"
      aria-labelledby="admin-dashboard-title"
    >
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
            <p><strong>{{ scopeLabel }}</strong> · Các bộ lọc áp dụng cho danh sách tác vụ bên dưới.</p>
          </div>
        </div>
        <AuthAccountInfo :user="currentUser" :assignment="staffAssignment" class="admin-dashboard__account">
          <div>
            <dt>Kho được giao</dt>
            <dd class="auth-mono">{{ assignedWarehousesLabel }}</dd>
          </div>
        </AuthAccountInfo>
      </section>

      <section class="admin-dashboard__metrics" aria-label="Chỉ số vận hành">
        <article v-for="metric in metrics" :key="metric.title" class="admin-dashboard__metric auth-card">
          <div class="admin-dashboard__metric-top">
            <span class="admin-dashboard__metric-icon"><AuthIcon :name="metric.icon" :size="20" /></span>
            <span class="admin-dashboard__metric-label">{{ metric.title }}</span>
          </div>
          <strong class="admin-dashboard__metric-value">{{ metric.value }}</strong>
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

        <div class="admin-dashboard__filters" aria-label="Lọc danh sách tác vụ">
          <label class="admin-dashboard__field">
            <span>Kho</span>
            <select
              v-model="filters.warehouseId"
              :disabled="isWarehousesLoading || (!isSystemAdmin && !access?.warehouseIds.length)"
              @change="onFilterChange"
            >
              <option value="">{{ isSystemAdmin ? 'Tất cả kho' : 'Tất cả kho được giao' }}</option>
              <option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.id">
                {{ warehouse.name }}
              </option>
            </select>
          </label>
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
            <span class="admin-dashboard__task-icon"><AuthIcon name="donation" :size="20" /></span>
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
              Xem <AuthIcon name="arrow" :size="16" />
            </RouterLink>
          </li>
        </ul>

        <footer class="admin-dashboard__tasks-footer">
          <span v-if="tasks.length">Đang hiển thị {{ tasks.length }} yêu cầu phù hợp; đây không phải tổng số toàn hệ thống.</span>
          <RouterLink :to="{ name: ADMIN_ROUTE.donationQueue }" class="admin-dashboard__all-tasks">
            Xem hàng đợi <AuthIcon name="arrow" :size="16" />
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
  </AuthShell>
</template>

<style scoped>
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
