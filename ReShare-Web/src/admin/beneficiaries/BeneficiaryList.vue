<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE } from '../auth/auth.constants'
import { staffAssignment } from '../auth/auth.store'
import BeneficiaryShell from './BeneficiaryShell.vue'
import { BENEFICIARY_ERROR, classifyBeneficiaryError, resolveBeneficiaryAccess } from './beneficiary.service'
import { beneficiaryRepository } from './beneficiary.repository'

const router = useRouter()
const access = computed(() => resolveBeneficiaryAccess(staffAssignment.value))
const search = ref('')
const list = ref([])
const isLoading = ref(true)
const error = ref('')
const nextCursor = ref(null)
const pageCursors = ref([null])
const pageIndex = ref(0)
let loadRequestId = 0
let searchTimer

async function loadList() {
  const requestId = ++loadRequestId
  if (!access.value) {
    list.value = []
    nextCursor.value = null
    error.value = 'forbidden'
    isLoading.value = false
    return
  }

  isLoading.value = true
  error.value = ''

  try {
    const result = await beneficiaryRepository.list({ search: search.value.trim(), cursor: pageCursors.value[pageIndex.value] })
    if (requestId !== loadRequestId) return
    list.value = result.beneficiaries
    nextCursor.value = result.nextCursor
  } catch (loadError) {
    if (requestId !== loadRequestId) return
    error.value = classifyBeneficiaryError(loadError)
    list.value = []
    nextCursor.value = null
  } finally {
    if (requestId === loadRequestId) isLoading.value = false
  }
}

function resetSearch() {
  pageCursors.value = [null]
  pageIndex.value = 0
  loadList()
}

function nextPage() {
  if (!nextCursor.value) return
  pageCursors.value.push(nextCursor.value)
  pageIndex.value += 1
  loadList()
}

function previousPage() {
  if (pageIndex.value < 1) return
  pageIndex.value -= 1
  pageCursors.value.pop()
  loadList()
}

function goToCreate() {
  router.push({ name: ADMIN_ROUTE.beneficiaryNew })
}

function openEdit(beneficiaryId, event) {
  event.stopPropagation()
  router.push({ name: ADMIN_ROUTE.beneficiaryEdit, params: { beneficiaryId } })
}

watch(access, () => {
  pageCursors.value = [null]
  pageIndex.value = 0
  loadList()
}, { immediate: true })
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(resetSearch, 300)
})
onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<template>
  <BeneficiaryShell>
    <section class="beneficiary-list" aria-labelledby="beneficiary-list-title">
      <header class="beneficiary-list__header">
        <div>
          <h1 id="beneficiary-list-title">Người thụ hưởng</h1>
          <p class="beneficiary-list__subtitle">Quản lý hồ sơ người thụ hưởng theo phạm vi kho đang chọn.</p>
          <p class="beneficiary-list__demo-label"><AuthIcon name="info" :size="16" /> Hồ sơ mới cần System Admin duyệt trước khi xuất kho.</p>
        </div>
        <button v-if="access" type="button" class="auth-btn auth-btn--primary" @click="goToCreate">
          <AuthIcon name="users" :size="18" />Thêm người thụ hưởng mới
        </button>
      </header>

      <div class="beneficiary-list__toolbar" v-if="access && !error">
        <label class="beneficiary-list__search">
          <AuthIcon name="search" :size="16" />
          <input v-model="search" type="search" placeholder="Tìm theo tên hoặc mã hồ sơ..." aria-label="Tìm theo tên hoặc mã hồ sơ" />
        </label>
        <button type="button" class="beneficiary-list__time-filter" disabled title="Bộ lọc thời gian chưa được hỗ trợ">
          <AuthIcon name="calendar" :size="16" /> Lọc thời gian (chưa khả dụng)
        </button>
        <button type="button" class="beneficiary-list__clear" :disabled="!search" @click="search = ''">Xóa bộ lọc</button>
      </div>

      <div v-if="!access" class="beneficiary-list__state beneficiary-list__state--forbidden">
        <AuthIcon name="shield" :size="24" />
        <h2>Không có quyền xem dữ liệu hồ sơ</h2>
        <p>Vui lòng liên hệ quản trị viên để được cấp quyền và phạm vi kho tương ứng.</p>
      </div>

      <div v-else-if="isLoading" class="beneficiary-list__state">
        <AuthIcon name="loader" :size="24" class="auth-spin" />
        <h2>Đang tải danh sách người thụ hưởng</h2>
      </div>

      <div v-else-if="error === BENEFICIARY_ERROR.unavailable" class="beneficiary-list__state">
        <AuthIcon name="alert-triangle" :size="24" />
        <h2>Không thể tải danh sách</h2>
        <p>Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.</p>
        <button type="button" class="auth-btn auth-btn--soft" @click="loadList">Thử lại</button>
      </div>

      <div v-else-if="error === BENEFICIARY_ERROR.forbidden" class="beneficiary-list__state beneficiary-list__state--forbidden">
        <AuthIcon name="shield" :size="24" />
        <h2>Không có quyền xem dữ liệu hồ sơ</h2>
        <p>Vui lòng liên hệ quản trị viên để được cấp quyền và phạm vi kho tương ứng.</p>
      </div>

      <div v-else-if="list.length === 0" class="beneficiary-list__state">
        <span class="beneficiary-list__empty-icon"><AuthIcon name="users" :size="30" /></span>
        <h2>{{ search ? 'Không tìm thấy hồ sơ phù hợp' : 'Chưa có hồ sơ trong phạm vi này' }}</h2>
        <p>{{ search ? 'Thử tìm theo tên hiển thị hoặc mã hồ sơ khác.' : 'Chưa có hồ sơ người thụ hưởng trong kho được phân quyền.' }}</p>
        <button v-if="!search" type="button" class="auth-btn auth-btn--primary" @click="goToCreate">
          <AuthIcon name="users" :size="17" />Thêm người thụ hưởng mới
        </button>
      </div>

      <div v-else class="beneficiary-list__table-wrap">
        <table class="beneficiary-list__table">
          <thead>
            <tr>
              <th>Mã hồ sơ</th>
              <th>Tên hiển thị</th>
              <th>Lịch sử hỗ trợ</th>
              <th>Trạng thái xác minh</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="beneficiary in list" :key="beneficiary.id" class="beneficiary-list__row">
              <td>
                <RouterLink
                  class="beneficiary-list__detail-link"
                  :to="{ name: ADMIN_ROUTE.beneficiaryDetail, params: { beneficiaryId: beneficiary.id } }"
                >
                  <code>{{ beneficiary.id }}</code>
                </RouterLink>
              </td>
              <td><strong>{{ beneficiary.name }}</strong></td>
              <td><RouterLink :to="{ name: ADMIN_ROUTE.beneficiaryDetail, params: { beneficiaryId: beneficiary.id } }">Xem lịch sử</RouterLink></td>
              <td>{{ beneficiary.status === 'approved' ? 'Đã duyệt' : beneficiary.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt' }}</td>
              <td class="beneficiary-list__actions">
                <button type="button" class="auth-btn auth-btn--soft" @click="openEdit(beneficiary.id, $event)">Sửa</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer v-if="access && !isLoading && !error" class="beneficiary-list__count">
        Trang {{ pageIndex + 1 }}: <strong>{{ list.length }} hồ sơ</strong>
        <span>Lịch sử hỗ trợ được đọc từ phiếu xuất đã xác nhận trong trang chi tiết.</span>
        <button type="button" :disabled="pageIndex === 0" @click="previousPage">Trang trước</button>
        <button type="button" :disabled="!nextCursor" @click="nextPage">Trang sau</button>
      </footer>

      <section v-if="access && !error" class="beneficiary-list__principles" aria-label="Nguyên tắc dữ liệu">
        <article>
          <AuthIcon name="shield" :size="20" />
          <div><h2>Quyền riêng tư dữ liệu</h2><p>Chỉ hiển thị thông tin tối thiểu theo phạm vi kho. Không thu thập CCCD/CMND, VNeID hoặc địa chỉ nhà riêng.</p></div>
        </article>
        <article>
          <AuthIcon name="warehouse" :size="20" />
          <div><h2>Phân quyền theo kho</h2><p>Danh sách hồ sơ được giới hạn theo phân công hiện có của nhân sự.</p></div>
        </article>
        <article>
          <AuthIcon name="history" :size="20" />
          <div><h2>Bảo toàn dữ liệu phân phối</h2><p>Số lần và lần hỗ trợ gần nhất lấy từ chứng từ phân phối thật trong trang chi tiết.</p></div>
        </article>
      </section>
    </section>
  </BeneficiaryShell>
</template>

<style scoped>
.beneficiary-list {
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 24px 8px 48px;
}

.beneficiary-list__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.beneficiary-list__eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #4d7a4f;
  font-weight: 700;
  margin-bottom: 6px;
}

.beneficiary-list__header h1 {
  font-size: clamp(28px, 3vw, 38px);
  font-weight: 700;
  color: #182a31;
}

.beneficiary-list__demo-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  color: #8a5a00;
  font-size: 13px;
}

.beneficiary-list__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.beneficiary-list__summary article {
  background: #fff;
  border: 1px solid #e7edf5;
  border-radius: 16px;
  padding: 18px 16px;
  box-shadow: 0 10px 28px rgba(27, 52, 88, 0.04);
}

.beneficiary-list__summary span {
  display: block;
  color: #607081;
  font-size: 13px;
  margin-bottom: 8px;
}

.beneficiary-list__summary strong {
  font-size: 30px;
  color: #133a27;
}

.beneficiary-list__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 22px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid #e7edf5;
  border-radius: 16px;
}

.beneficiary-list__search {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: min(420px, 100%);
  flex: 1 1 320px;
  background: #fff;
  border: 1px solid #dfe6f1;
  border-radius: 12px;
  padding: 12px 14px;
}

.beneficiary-list__search input {
  width: 100%;
  border: 0;
  background: transparent;
  font-size: 15px;
  outline: none;
}

.beneficiary-list__select {
  border: 1px solid #dfe6f1;
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  min-width: 190px;
  font-size: 14px;
}

.beneficiary-list__table-wrap {
  overflow-x: auto;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #e7edf5;
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(27, 52, 88, 0.04);
}

.beneficiary-list__table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}

.beneficiary-list__table th,
.beneficiary-list__table td {
  padding: 15px 16px;
  border-bottom: 1px solid #edf2f7;
  text-align: left;
  vertical-align: middle;
}

.beneficiary-list__table th {
  font-size: 12px;
  color: #607081;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: #f7fafd;
}

.beneficiary-list__row {
  transition: background 0.2s ease;
}

.beneficiary-list__row:hover {
  background: #f8fbf9;
}

.beneficiary-list__detail-link {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  border-radius: 4px;
  color: #185a22;
  text-decoration: none;
}

.beneficiary-list__detail-link:hover {
  text-decoration: underline;
}

.beneficiary-list__detail-link:focus-visible {
  outline: 2px solid #185a22;
  outline-offset: 3px;
}

.beneficiary-list__identity {
  display: flex;
  align-items: center;
  gap: 12px;
}

.beneficiary-list__avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, #dff5e3, #cfe9ff);
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #164d30;
}

.beneficiary-list__identity strong {
  display: block;
  font-size: 15px;
  color: #122631;
}

.beneficiary-list__identity small {
  display: block;
  color: #637381;
}

.beneficiary-list__status {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.beneficiary-list__status--verified {
  background: #e7f7eb;
  color: #1f6b2c;
}

.beneficiary-list__status--pending {
  background: #fff3d9;
  color: #9a6700;
}

.beneficiary-list__status--needs_update {
  background: #fde7e7;
  color: #b42318;
}

.beneficiary-list__support {
  font-weight: 600;
}

.beneficiary-list__actions {
  text-align: right;
}

.beneficiary-list__state {
  display: grid;
  place-items: center;
  min-height: 260px;
  text-align: center;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid #e7edf5;
  border-radius: 18px;
  color: #2d3f4e;
  gap: 12px;
  padding: 28px;
}

.beneficiary-list__state--forbidden {
  color: #56281d;
}

.beneficiary-list__state h2 {
  font-size: 24px;
}

.beneficiary-list__state p {
  color: #617081;
  max-width: 540px;
}

.beneficiary-list__subtitle {
  margin-top: 6px;
  color: #586579;
}

.beneficiary-list__toolbar {
  box-shadow: 0 6px 18px rgba(32, 47, 79, 0.04);
}

.beneficiary-list__time-filter,
.beneficiary-list__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid #dfe6f1;
  border-radius: 10px;
  background: #fff;
  color: #445167;
  font: inherit;
}

.beneficiary-list__time-filter:disabled,
.beneficiary-list__clear:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.beneficiary-list__count {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 14px 4px;
  color: #536174;
}

.beneficiary-list__count span {
  margin-left: auto;
  font-size: 12px;
  color: #7b8392;
}

.beneficiary-list__empty-icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 16px;
  background: #e7f5e8;
  color: #1f6b2c;
}

.beneficiary-list__principles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 24px;
}

.beneficiary-list__principles article {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 132px;
  padding: 18px;
  border: 1px solid #e7edf5;
  border-radius: 14px;
  background: #fff;
  color: #1f6b2c;
}

.beneficiary-list__principles h2 {
  margin-bottom: 6px;
  color: #26384b;
  font-size: 14px;
}

.beneficiary-list__principles p {
  color: #617081;
  font-size: 12px;
}

@media (max-width: 860px) {
  .beneficiary-list__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .beneficiary-list__principles {
    grid-template-columns: 1fr;
  }
}
</style>
