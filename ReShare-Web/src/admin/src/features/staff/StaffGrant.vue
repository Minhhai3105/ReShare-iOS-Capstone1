<script setup>
import { computed, onMounted, ref } from 'vue'
import { accountRepository } from './accountRepository.js'

const emit = defineEmits(['back'])
const emailQuery = ref('')
const accountResults = ref([])
const selectedAccount = ref(null)
const selectedRole = ref('')
const selectedWarehouse = ref('')
const warehouses = ref([])
const isSearching = ref(false)
const searchError = ref('')
const showReview = ref(false)
let searchSequence = 0

const isWarehouseAdmin = computed(() => selectedRole.value === 'warehouse_admin')
const isValid = computed(() => Boolean(selectedAccount.value && selectedRole.value && (!isWarehouseAdmin.value || selectedWarehouse.value)))
const roleName = computed(() => selectedRole.value === 'system_admin' ? 'System Admin' : selectedRole.value === 'warehouse_admin' ? 'Warehouse Admin' : '—')
const scopeName = computed(() => selectedRole.value === 'system_admin' ? 'Toàn hệ thống' : selectedWarehouse.value || '—')

async function searchAccounts() {
  const currentSequence = ++searchSequence
  const query = emailQuery.value
  selectedAccount.value = null
  searchError.value = ''
  if (!query.trim()) {
    accountResults.value = []
    isSearching.value = false
    return
  }
  isSearching.value = true
  try {
    const results = await accountRepository.search(query)
    if (currentSequence === searchSequence) accountResults.value = results
  } catch {
    if (currentSequence === searchSequence) {
      searchError.value = 'Không thể tìm tài khoản. Vui lòng thử lại.'
      accountResults.value = []
    }
  } finally {
    if (currentSequence === searchSequence) isSearching.value = false
  }
}

function chooseAccount(account) {
  searchSequence += 1
  isSearching.value = false
  selectedAccount.value = account
  accountResults.value = []
  emailQuery.value = ''
}

function selectRole(role) {
  selectedRole.value = role
  if (role === 'system_admin') selectedWarehouse.value = ''
}

function reviewGrant() {
  if (isValid.value) showReview.value = true
}

onMounted(async () => {
  warehouses.value = await accountRepository.listWarehouses()
})
</script>

<template>
  <div class="grant-page">
    <div class="grant-toolbar">
      <div class="breadcrumbs"><i class="fa-solid fa-user-gear breadcrumbs__icon" aria-hidden="true"></i><strong>Nhân sự &amp; quyền</strong><span>/</span><b>Cấp quyền nhân sự</b></div>
      <button class="grant-back" @click="emit('back')"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Quay lại danh sách</button>
    </div>
    <div class="grant-title-row">
      <div><h1>Cấp quyền nhân sự</h1><p>Chọn tài khoản, vai trò và phạm vi kho được truy cập</p></div>
      <span class="grant-protocol"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Giao thức kiểm soát truy cập ReShare RBAC</span>
    </div>

    <div class="grant-layout">
      <div class="grant-main-column">
        <section class="grant-form-card">
          <div class="grant-section-heading">
            <span class="grant-section-icon"><i class="fa-regular fa-id-card" aria-hidden="true"></i></span>
            <div><h2>Thông tin cấp quyền</h2><p>Điền thông tin tài khoản và thiết lập phạm vi điều hành</p></div>
            <span class="required-tag">Bắt buộc (*)</span>
          </div>

          <div class="form-block account-block">
            <div class="form-label-row"><label for="account-search">Tài khoản nhân sự <b>*</b></label><span>Tra cứu qua cơ sở người dùng</span></div>
            <div v-if="selectedAccount" class="selected-account">
              <span class="selected-account__avatar"><i class="fa-solid fa-user" aria-hidden="true"></i></span>
              <span><strong>{{ selectedAccount.name }}</strong><small>{{ selectedAccount.email }} · {{ selectedAccount.id }}</small></span>
              <button class="change-account" @click="selectedAccount = null">Đổi tài khoản</button>
            </div>
            <div v-else class="account-search-row">
              <label class="grant-input-wrap" for="account-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="account-search" v-model="emailQuery" placeholder="Nhập email để tìm tài khoản đã có..." @input="searchAccounts" @keydown.enter.prevent="searchAccounts" /></label>
              <button class="account-search-button" :disabled="!emailQuery.trim() || isSearching" @click="searchAccounts"><i class="fa-solid fa-user-magnifying-glass" aria-hidden="true"></i>{{ isSearching ? 'Đang tìm...' : 'Tìm tài khoản' }}</button>
            </div>
            <div v-if="accountResults.length" class="account-results" role="listbox" aria-label="Tài khoản tìm được">
              <button v-for="account in accountResults" :key="account.id" class="account-result" role="option" @click="chooseAccount(account)"><span class="selected-account__avatar"><i class="fa-solid fa-user" aria-hidden="true"></i></span><span><strong>{{ account.name }}</strong><small>{{ account.email }}</small></span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
            </div>
            <p v-if="searchError" class="form-error" role="alert">{{ searchError }}</p>
            <div v-if="!selectedAccount && !accountResults.length" class="account-empty">
              <span><i class="fa-solid fa-user-magnifying-glass" aria-hidden="true"></i></span>
              <strong>{{ emailQuery && !isSearching && !searchError ? 'Không tìm thấy tài khoản' : 'Chưa chọn tài khoản' }}</strong>
              <p>Chỉ chọn tài khoản đã tồn tại trong hệ thống. Tên và email sẽ hiển thị sau khi chọn.</p>
            </div>
          </div>

          <div class="form-block role-block">
            <div class="form-label-row"><span class="field-label">Vai trò quản trị <b>*</b></span><span>Quy định thẩm quyền truy cập</span></div>
            <div class="role-options">
              <button class="role-option" :class="{ 'role-option--selected': selectedRole === 'system_admin' }" role="radio" :aria-checked="selectedRole === 'system_admin'" @click="selectRole('system_admin')">
                <span class="role-option__icon"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span><span class="role-option__radio"></span>
                <strong>System Admin</strong><p>Quản lý toàn bộ hệ thống và quyền nhân sự</p><small><i class="fa-solid fa-earth-asia" aria-hidden="true"></i> Phạm vi: Toàn hệ thống</small>
              </button>
              <button class="role-option" :class="{ 'role-option--selected': selectedRole === 'warehouse_admin' }" role="radio" :aria-checked="selectedRole === 'warehouse_admin'" @click="selectRole('warehouse_admin')">
                <span class="role-option__icon"><i class="fa-solid fa-warehouse" aria-hidden="true"></i></span><span class="role-option__radio"></span>
                <strong>Warehouse Admin</strong><p>Quản lý nghiệp vụ tại các kho được phân công</p><small><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Phạm vi: Theo kho gán</small>
              </button>
            </div>
          </div>

          <div class="form-block warehouse-block">
            <div class="form-label-row"><label for="warehouse-select">Kho được phân công</label><span>Địa điểm xử lý tiếp nhận</span></div>
            <label class="warehouse-select-wrap" :class="{ 'warehouse-select-wrap--disabled': selectedRole === 'system_admin' }" for="warehouse-select">
              <i class="fa-solid fa-warehouse" aria-hidden="true"></i>
              <select id="warehouse-select" v-model="selectedWarehouse" :disabled="selectedRole === 'system_admin' || !selectedRole">
                <option value="">{{ selectedRole === 'system_admin' ? 'Phạm vi toàn hệ thống' : 'Chọn kho được phép quản lý...' }}</option>
                <option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.name">{{ warehouse.name }}</option>
              </select>
              <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
            </label>
            <p class="field-help"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Bắt buộc chọn ít nhất một kho đối với vai trò Warehouse Admin. Với System Admin, phạm vi tự động áp dụng toàn hệ thống.</p>
          </div>

          <div class="grant-form-footer">
            <p><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>{{ isValid ? 'Thông tin hợp lệ. Có thể xem lại trước khi cấp quyền.' : 'Chọn tài khoản, vai trò và phạm vi hợp lệ để tiếp tục' }}</p>
            <div><button class="grant-cancel" @click="emit('back')">Hủy</button><button class="grant-review-button" :disabled="!isValid" @click="reviewGrant"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>{{ showReview ? 'Đã mở bước xem lại' : 'Xem lại và cấp quyền' }}</button></div>
          </div>
        </section>

        <section class="grant-security-note">
          <span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span>
          <div><h2>Chính sách bảo mật quyền ReShare</h2><p>Mọi thay đổi thẩm quyền quản trị nhân sự đều được lưu vết chi tiết tại Nhật ký vận hành hệ thống. Nhân sự được cấp quyền cần kích hoạt xác thực hai bước (2FA) trước khi truy cập các dữ liệu điều phối kho.</p></div>
        </section>
      </div>

      <aside class="grant-side-column">
        <section class="grant-review-card">
          <div class="grant-review-card__heading"><h2><i class="fa-regular fa-square-check" aria-hidden="true"></i>{{ showReview ? 'Xem lại quyền sẽ cấp' : 'Xem lại quyền sẽ cấp' }}</h2><i class="fa-solid fa-circle" aria-hidden="true"></i></div>
          <p>Kiểm tra thông tin trước khi xác nhận cấp quyền</p>
          <div class="grant-summary">
            <div><span><i class="fa-regular fa-circle-user" aria-hidden="true"></i>Tài khoản</span><strong>{{ selectedAccount?.email || '—' }}</strong></div>
            <div><span><i class="fa-regular fa-id-badge" aria-hidden="true"></i>Vai trò</span><strong>{{ roleName }}</strong></div>
            <div><span><i class="fa-solid fa-diagram-project" aria-hidden="true"></i>Phạm vi truy cập</span><strong>{{ scopeName }}</strong></div>
          </div>
          <div class="grant-progress"><div class="grant-progress__label"><strong>TRẠNG THÁI BIỂU MẪU</strong><b>{{ isValid ? '2 / 2 bước' : `${selectedAccount ? 1 : 0} / 2 bước` }}</b></div><div class="grant-progress__track"><i :style="{ width: isValid ? '100%' : selectedAccount ? '50%' : '0%' }"></i></div><p>{{ isValid ? 'Đã chọn tài khoản và vai trò hợp lệ' : 'Yêu cầu hoàn tất chọn tài khoản và vai trò hợp lệ' }}</p></div>
          <div class="grant-review-hint"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><p>Thông tin tóm tắt phản ánh các lựa chọn trên biểu mẫu. Sau khi bấm “Xem lại và cấp quyền”, hệ thống sẽ mở bước xác nhận trước khi cập nhật quyền hạn thực tế.</p></div>
          <div v-if="showReview" class="grant-review-state" role="status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Đang ở bước xem lại. Quyền chưa được cập nhật.</div>
        </section>
        <section class="grant-doc-card"><span><i class="fa-regular fa-file-lines" aria-hidden="true"></i></span><div><strong>Tài liệu phân quyền</strong><small>Tìm hiểu ma trận vai trò ReShare</small></div><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></section>
      </aside>
    </div>
  </div>
</template>
