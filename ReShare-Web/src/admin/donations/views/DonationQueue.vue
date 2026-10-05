<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import AuthShell from '../../auth/components/AuthShell.vue'
import AuthIcon from '../../auth/components/AuthIcon.vue'
import { staffAssignment } from '../../auth/auth.store'
import { resolveQueueAccess } from '../donation.service'
import { QUEUE_VIEW_STATE, useDonationQueue } from '../useDonationQueue'
import {
  DONATION_CATEGORY_LABEL,
  DONATION_QUEUE_ERROR,
  DONATION_SORT,
  DONATION_STATUS,
  DONATION_STATUS_LABEL,
} from '../donation.constants'

const SKELETON_ROWS = 6
const isDemo = import.meta.env.DEV
const STATUS_TONE = {
  [DONATION_STATUS.pending]: 'warning',
  [DONATION_STATUS.approved]: 'info',
  [DONATION_STATUS.received]: 'info',
  [DONATION_STATUS.inStock]: 'accent',
  [DONATION_STATUS.distributed]: 'success',
  [DONATION_STATUS.rejected]: 'danger',
}
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
const hourFormatter = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' })
const timeFormatter = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const getAccess = () => resolveQueueAccess(staffAssignment.value)
const {
  filters,
  result,
  warehouses,
  isLoading,
  errorStatus,
  lastUpdatedAt,
  viewState,
  hasActiveFilters,
  refresh,
  goToPage,
  resetFilters,
} = useDonationQueue(getAccess)

// Phạm vi đang áp dụng; cập nhật mỗi lần làm mới để phản ánh phân công mới hoặc quyền mock.
const access = ref(null)
const scopeLabel = computed(() => {
  if (!access.value) return 'Không có phạm vi kho'
  if (access.value.isAllWarehouses) return 'Tất cả kho (toàn hệ thống)'
  return warehouses.value.map((warehouse) => warehouse.name).join(', ') || access.value.warehouseIds.join(', ')
})
const quickFilters = computed(() => {
  const counts = result.value?.statusCounts ?? {}
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return [
    { value: '', label: 'Tất cả', count: total },
    ...Object.values(DONATION_STATUS).map((status) => ({
      value: status,
      label: DONATION_STATUS_LABEL[status],
      count: counts[status] ?? 0,
    })),
  ]
})
// Khi lỗi hoặc không có quyền thì ẩn số đếm để không hiểu nhầm là "0 đơn".
const showStatusCounts = computed(() => [QUEUE_VIEW_STATE.ready, QUEUE_VIEW_STATE.empty].includes(viewState.value))
const rangeLabel = computed(() => {
  if (!result.value?.total) return 'Hiển thị 0 trên 0 yêu cầu'
  const { page, pageSize, total } = result.value
  const start = (page - 1) * pageSize + 1
  return `Hiển thị ${start}–${Math.min(page * pageSize, total)} trên ${total} yêu cầu`
})
const pageNumbers = computed(() => Array.from({ length: result.value?.totalPages ?? 0 }, (_, index) => index + 1))

function formatDonationCode(id) {
  return `#${id.toUpperCase()}`
}

function formatCreatedAt(createdAt) {
  const date = new Date(createdAt)
  return `${dateFormatter.format(date)} ${hourFormatter.format(date)}`
}

function refreshQueue() {
  access.value = getAccess()
  refresh()
}

onMounted(refreshQueue)
// Phân công thay đổi giữa phiên (US02 AC3) thì tải lại theo phạm vi mới.
watch(staffAssignment, refreshQueue)
</script>

<template>
  <AuthShell>
    <div class="donation-queue">
      <header class="donation-queue__header">
        <div>
          <div class="donation-queue__title-row">
            <h1>Yêu cầu quyên góp</h1>
            <span class="auth-chip donation-queue__env"><span class="auth-dot" />{{ isDemo ? 'Dữ liệu thử nghiệm' : 'Chưa kết nối dữ liệu' }}</span>
          </div>
          <p>Theo dõi yêu cầu gửi qua app và tình trạng xử lý</p>
        </div>
        <div class="donation-queue__sync">
          <span v-if="lastUpdatedAt">
            Cập nhật lúc <span class="auth-mono">{{ timeFormatter.format(lastUpdatedAt) }}</span>
          </span>
          <button type="button" class="auth-btn auth-btn--soft" :disabled="isLoading" @click="refreshQueue">
            <AuthIcon :name="isLoading ? 'loader' : 'refresh'" :size="18" :class="{ 'auth-spin': isLoading }" />
            Làm mới
          </button>
        </div>
      </header>

      <section class="donation-queue__notice queue-card" aria-label="Phạm vi hiển thị">
        <AuthIcon name="info" :size="22" />
        <div>
          <strong>Thông báo điều phối</strong>
          <p>
            Phạm vi hiển thị: <strong>{{ scopeLabel }}</strong>.
            {{ isDemo ? 'Danh sách dưới đây chỉ là dữ liệu minh họa, không phải đơn thực.' : 'Danh sách sẽ xuất hiện khi API vận hành được kết nối.' }}
          </p>
        </div>
      </section>

      <section class="queue-card donation-queue__filters" aria-label="Bộ lọc">
        <div class="donation-queue__filter-grid">
          <label class="queue-field queue-field--search">
            <span class="queue-field__label">Tìm kiếm <small>(Mã yêu cầu hoặc người gửi)</small></span>
            <span class="auth-input">
              <AuthIcon name="search" />
              <input v-model="filters.search" type="search" placeholder="Tìm theo mã yêu cầu hoặc tên người gửi…" />
            </span>
          </label>

          <label class="queue-field">
            <span class="queue-field__label">Trạng thái</span>
            <select v-model="filters.status" class="queue-select">
              <option value="">Tất cả</option>
              <option v-for="(label, status) in DONATION_STATUS_LABEL" :key="status" :value="status">{{ label }}</option>
            </select>
          </label>

          <label class="queue-field">
            <span class="queue-field__label">Kho</span>
            <select v-model="filters.warehouseId" class="queue-select">
              <option value="">{{ access?.isAllWarehouses ? 'Tất cả kho' : 'Tất cả kho được giao' }}</option>
              <option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}</option>
            </select>
          </label>

          <label class="queue-field">
            <span class="queue-field__label">Danh mục</span>
            <select v-model="filters.category" class="queue-select">
              <option value="">Tất cả</option>
              <option v-for="(label, category) in DONATION_CATEGORY_LABEL" :key="category" :value="category">
                {{ label }}
              </option>
            </select>
          </label>

          <div class="queue-field">
            <span class="queue-field__label">Ngày gửi</span>
            <div class="donation-queue__dates">
              <input v-model="filters.dateFrom" type="date" class="queue-select" aria-label="Từ ngày" :max="filters.dateTo || undefined" />
              <span aria-hidden="true">–</span>
              <input v-model="filters.dateTo" type="date" class="queue-select" aria-label="Đến ngày" :min="filters.dateFrom || undefined" />
            </div>
          </div>

          <label class="queue-field">
            <span class="queue-field__label">Sắp xếp</span>
            <select v-model="filters.sort" class="queue-select">
              <option :value="DONATION_SORT.oldestFirst">Cũ nhất trước</option>
              <option :value="DONATION_SORT.newestFirst">Mới nhất trước</option>
            </select>
          </label>

          <button type="button" class="auth-btn auth-btn--soft donation-queue__reset" :disabled="!hasActiveFilters" @click="resetFilters">
            <AuthIcon name="refresh" :size="18" />Xóa bộ lọc
          </button>
        </div>

        <div class="donation-queue__quick" role="group" aria-label="Lọc nhanh theo trạng thái">
          <span class="donation-queue__quick-label">Lọc nhanh:</span>
          <button
            v-for="quickFilter in quickFilters"
            :key="quickFilter.value"
            type="button"
            class="queue-chip"
            :class="{ 'is-active': filters.status === quickFilter.value }"
            :aria-pressed="filters.status === quickFilter.value"
            @click="filters.status = quickFilter.value"
          >
            {{ quickFilter.label }}<template v-if="showStatusCounts"> ({{ quickFilter.count }})</template>
          </button>
        </div>
      </section>

      <section class="queue-card donation-queue__table-card" :aria-busy="isLoading">
        <div class="donation-queue__table-scroll">
          <table class="queue-table">
            <thead>
              <tr>
                <th scope="col">Mã yêu cầu</th>
                <th scope="col">Người gửi</th>
                <th scope="col">Vật phẩm</th>
                <th scope="col">Kho dự kiến</th>
                <th scope="col">Ngày gửi</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>

            <tbody v-if="viewState === QUEUE_VIEW_STATE.loading">
              <tr v-for="row in SKELETON_ROWS" :key="row" class="queue-table__skeleton">
                <td v-for="cell in 6" :key="cell"><span /></td>
              </tr>
            </tbody>

            <tbody v-else-if="viewState === QUEUE_VIEW_STATE.ready" :class="{ 'is-refreshing': isLoading }">
              <tr v-for="donation in result.items" :key="donation.id">
                <td><span class="queue-code auth-mono">{{ formatDonationCode(donation.id) }}</span></td>
                <td>{{ donation.donorName }}</td>
                <td>
                  <span class="queue-table__title">{{ donation.title }}</span>
                  <span class="queue-table__sub">{{ DONATION_CATEGORY_LABEL[donation.category] }}</span>
                </td>
                <td :class="{ 'queue-table__muted': !donation.warehouseName }">{{ donation.warehouseName ?? 'Chưa gán kho' }}</td>
                <td class="queue-table__nowrap">{{ formatCreatedAt(donation.createdAt) }}</td>
                <td>
                  <span class="queue-status" :class="`queue-status--${STATUS_TONE[donation.status]}`">
                    {{ DONATION_STATUS_LABEL[donation.status] }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="viewState === QUEUE_VIEW_STATE.empty" class="queue-state">
          <span class="queue-state__icon"><AuthIcon name="inbox" :size="36" /></span>
          <h2>Chưa có yêu cầu phù hợp</h2>
          <p>Thử thay đổi bộ lọc hoặc kiểm tra lại sau.</p>
          <button v-if="hasActiveFilters" type="button" class="auth-btn auth-btn--soft" @click="resetFilters">
            <AuthIcon name="refresh" :size="18" />Làm mới bộ lọc
          </button>
        </div>

        <div v-else-if="viewState === QUEUE_VIEW_STATE.error" class="queue-state queue-state--danger" role="alert">
          <span class="queue-state__icon"><AuthIcon name="cloud-off" :size="36" /></span>
          <h2>{{ errorStatus === DONATION_QUEUE_ERROR.notConfigured ? 'Chưa kết nối dữ liệu vận hành' : 'Không tải được danh sách' }}</h2>
          <p>{{ errorStatus === DONATION_QUEUE_ERROR.notConfigured ? 'Hàng đợi hiện chỉ có bản xem thử trong môi trường phát triển. Chưa có API đọc đơn theo quyền kho.' : 'Máy chủ hoặc kết nối mạng đang gặp sự cố. Vui lòng thử lại.' }}</p>
          <button v-if="errorStatus !== DONATION_QUEUE_ERROR.notConfigured" type="button" class="auth-btn auth-btn--primary" :disabled="isLoading" @click="refreshQueue">
            <AuthIcon :name="isLoading ? 'loader' : 'refresh'" :size="18" :class="{ 'auth-spin': isLoading }" />Thử lại
          </button>
        </div>

        <div v-else-if="viewState === QUEUE_VIEW_STATE.forbidden" class="queue-state queue-state--danger" role="alert">
          <span class="queue-state__icon"><AuthIcon name="shield" :size="36" /></span>
          <h2>Không có quyền xem dữ liệu này</h2>
          <p>Bạn chỉ xem được yêu cầu thuộc kho được phân công. Hãy chọn lại kho hoặc liên hệ Quản trị hệ thống.</p>
          <button type="button" class="auth-btn auth-btn--soft" @click="resetFilters">
            <AuthIcon name="refresh" :size="18" />Về phạm vi được giao
          </button>
        </div>

        <footer class="donation-queue__pagination">
          <span>
            {{ rangeLabel }}
            <template v-if="result?.total"> • Trang {{ result.page }} / {{ result.totalPages }}</template>
          </span>
          <nav v-if="viewState === QUEUE_VIEW_STATE.ready && result.totalPages > 1" aria-label="Phân trang">
            <button type="button" class="queue-page" :disabled="isLoading || result.page === 1" @click="goToPage(result.page - 1)">
              <AuthIcon name="chevron-left" :size="16" />Trước
            </button>
            <button
              v-for="pageNumber in pageNumbers"
              :key="pageNumber"
              type="button"
              class="queue-page"
              :class="{ 'is-active': pageNumber === result.page }"
              :aria-current="pageNumber === result.page ? 'page' : undefined"
              :disabled="isLoading"
              @click="goToPage(pageNumber)"
            >
              {{ pageNumber }}
            </button>
            <button
              type="button"
              class="queue-page"
              :disabled="isLoading || result.page === result.totalPages"
              @click="goToPage(result.page + 1)"
            >
              Sau<AuthIcon name="chevron-right" :size="16" />
            </button>
          </nav>
        </footer>
      </section>

      <aside class="auth-note">
        <AuthIcon name="shield-check" :size="22" class="auth-note__icon" />
        <div>
          <p class="auth-note__title">Quy chuẩn vận hành kho ReShare</p>
          <p>
            Lưu ý nghiệp vụ: thao tác duyệt đơn, từ chối, tiếp nhận vật lý và nhập kho được thực hiện tại trang chi tiết
            yêu cầu sau khi kiểm tra thẩm quyền tại kho phụ trách.
          </p>
        </div>
      </aside>
    </div>
  </AuthShell>
</template>

<style scoped>
.donation-queue {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
}

.donation-queue__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}

.donation-queue__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.donation-queue__header h1 {
  font-size: 34px;
  font-weight: 700;
}

.donation-queue__header p {
  margin-top: 4px;
  font-size: 17px;
  color: var(--auth-text-secondary);
}

.donation-queue__env {
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0;
}

.donation-queue__sync {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--auth-text-secondary);
}

.donation-queue__sync .auth-mono {
  color: var(--auth-primary);
}

.queue-card {
  border-radius: 16px;
  background: var(--auth-surface);
  box-shadow: 0 1px 3px rgb(28 35 49 / 0.06);
}

.donation-queue__notice {
  display: flex;
  gap: 12px;
  padding: 18px 22px;
  color: var(--auth-primary);
}

.donation-queue__notice p {
  margin-top: 2px;
  color: var(--auth-text-secondary);
}

.donation-queue__notice strong {
  color: var(--auth-text);
}

.donation-queue__notice > div > strong {
  font-size: 17px;
  color: var(--auth-primary);
}

.donation-queue__filters {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
}

.donation-queue__filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: end;
  gap: 14px 16px;
}

.queue-field--search {
  grid-column: span 2;
}

.queue-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.queue-field__label {
  font-weight: 500;
}

.queue-field__label small {
  font-size: 13px;
  color: var(--auth-text-tertiary);
}

.queue-field .auth-input {
  min-height: 48px;
}

.queue-field .auth-input input {
  height: 44px;
  font-size: 15px;
}

.queue-select {
  width: 100%;
  min-height: 48px;
  padding: 0 12px;
  border: 1.5px solid var(--auth-border);
  border-radius: 10px;
  background: var(--auth-surface);
  font: inherit;
  font-size: 15px;
  color: var(--auth-text);
}

.queue-select:focus {
  border-color: var(--auth-primary);
  outline: none;
  box-shadow: 0 0 0 1px var(--auth-primary);
}

.donation-queue__dates {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--auth-text-tertiary);
}

.donation-queue__dates .queue-select {
  min-width: 0;
}

.donation-queue__reset {
  justify-self: start;
  min-height: 48px;
  white-space: nowrap;
}

.donation-queue__quick {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.donation-queue__quick-label {
  margin-right: 4px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--auth-text-secondary);
}

.queue-chip {
  min-height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: var(--auth-accent-soft);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--auth-text-secondary);
  cursor: pointer;
}

.queue-chip.is-active {
  background: var(--auth-primary);
  color: #fff;
}

.donation-queue__table-card {
  overflow: hidden;
}

.donation-queue__table-scroll {
  overflow-x: auto;
}

.queue-table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
}

.queue-table th {
  padding: 16px 20px;
  background: var(--auth-accent-soft);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-align: left;
  text-transform: uppercase;
  color: var(--auth-text-secondary);
  white-space: nowrap;
}

.queue-table td {
  padding: 14px 20px;
  border-bottom: 1px solid var(--auth-border);
  vertical-align: middle;
}

.queue-table tbody.is-refreshing {
  opacity: 0.55;
  transition: opacity 0.15s;
}

.queue-table__title {
  display: block;
  font-weight: 500;
}

.queue-table__nowrap {
  white-space: nowrap;
}

.queue-table__sub,
.queue-table__muted {
  font-size: 13px;
  color: var(--auth-text-tertiary);
}

.queue-code {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--auth-accent-soft);
  font-size: 14px;
  font-weight: 600;
}

.queue-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.queue-status::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.queue-status--warning {
  background: #fff4d6;
  color: #8a5a00;
}

.queue-status--info {
  background: #e7efff;
  color: #2f54b5;
}

.queue-status--accent {
  background: #f1e8fd;
  color: #7a3fc2;
}

.queue-status--success {
  background: var(--auth-primary-soft);
  color: var(--auth-primary);
}

.queue-status--danger {
  background: var(--auth-danger-soft);
  color: var(--auth-danger);
}

.queue-table__skeleton span {
  display: block;
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, #eef1f5 25%, #f6f8fa 50%, #eef1f5 75%);
  background-size: 200% 100%;
  animation: queue-shimmer 1.2s infinite;
}

@keyframes queue-shimmer {
  to {
    background-position: -200% 0;
  }
}

.queue-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 56px 24px;
  text-align: center;
}

.queue-state__icon {
  display: grid;
  place-items: center;
  width: 92px;
  height: 92px;
  margin-bottom: 8px;
  border-radius: 50%;
  background: var(--auth-accent-soft);
  color: var(--auth-primary);
}

.queue-state--danger .queue-state__icon {
  background: var(--auth-danger-soft);
  color: var(--auth-danger);
}

.queue-state h2 {
  font-size: 22px;
  font-weight: 700;
}

.queue-state p {
  max-width: 520px;
  color: var(--auth-text-secondary);
}

.donation-queue__pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 22px;
  background: var(--auth-accent-soft);
  font-size: 14px;
  font-weight: 600;
  color: var(--auth-text-secondary);
}

.donation-queue__pagination nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.queue-page {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 40px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--auth-border);
  border-radius: 8px;
  background: var(--auth-surface);
  font: inherit;
  font-size: 14px;
  color: var(--auth-text);
  cursor: pointer;
}

.queue-page.is-active {
  border-color: var(--auth-primary);
  background: var(--auth-primary);
  color: #fff;
}

.queue-page:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 1100px) {
  .donation-queue__filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .donation-queue__filter-grid {
    grid-template-columns: 1fr;
  }

  .queue-field--search {
    grid-column: auto;
  }

  .donation-queue__header h1 {
    font-size: 28px;
  }
}
</style>
