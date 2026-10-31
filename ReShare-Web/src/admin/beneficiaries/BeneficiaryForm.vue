<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE } from '../auth/auth.constants'
import { staffAssignment } from '../auth/auth.store'
import { fetchQueueWarehouses, resolveQueueAccess } from '../donations/donation.service'
import BeneficiaryShell from './BeneficiaryShell.vue'
import { BENEFICIARY_ERROR, classifyBeneficiaryError, resolveBeneficiaryAccess } from './beneficiary.service'
import { beneficiaryRepository } from './beneficiary.repository'
import { validateBeneficiaryForm } from './beneficiary.validation'

const route = useRoute()
const router = useRouter()
const beneficiaryId = computed(() => route.params.beneficiaryId)
const isEditMode = computed(() => Boolean(beneficiaryId.value))
const access = computed(() => resolveBeneficiaryAccess(staffAssignment.value))
const warehouseLabel = computed(() => {
  const id = form.value.warehouseId
  return id || 'Chưa có kho được xác định'
})
const isSaving = ref(false)
const isLoading = ref(true)
const loadError = ref('')
const submitError = ref('')
const form = ref({
  id: '',
  name: '',
  phone: '',
  warehouseId: '',
  needs: [],
  notes: '',
  createdBy: '',
  createdAt: '',
})
const errors = ref({})
const warehouseOptions = ref([])
let loadRequestId = 0

const canAssignWarehouse = computed(() => warehouseOptions.value.length > 0)
const createdAtText = computed(() => {
  if (!form.value.createdAt) return 'Sẽ được tạo khi lưu hồ sơ'
  const date = new Date(form.value.createdAt)
  return Number.isNaN(date.valueOf()) ? 'Chưa có dữ liệu' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
})

function resetForm() {
  form.value = {
    id: '',
    name: '',
    phone: '',
    warehouseId: '',
    needs: [],
    notes: '',
    createdBy: '',
    createdAt: '',
  }
  errors.value = {}
}

async function loadForm() {
  const requestId = ++loadRequestId
  isLoading.value = true
  loadError.value = ''
  submitError.value = ''
  resetForm()
  warehouseOptions.value = []

  try {
    if (!access.value) {
      loadError.value = BENEFICIARY_ERROR.forbidden
      return
    }

    if (isEditMode.value) {
      const { beneficiary } = await beneficiaryRepository.get(beneficiaryId.value)
      if (requestId !== loadRequestId) return
      if (!beneficiary) {
        loadError.value = 'not_found'
        return
      }
      form.value = {
        ...beneficiary,
        name: String(beneficiary.name ?? ''),
        phone: String(beneficiary.phone ?? ''),
        notes: String(beneficiary.notes ?? ''),
      }
      warehouseOptions.value = [{
        id: beneficiary.warehouseId,
        name: beneficiary.warehouseName || beneficiary.warehouseId,
      }]
      return
    }

    const warehouses = await fetchQueueWarehouses(resolveQueueAccess(staffAssignment.value))
    if (requestId !== loadRequestId) return
    warehouseOptions.value = warehouses

    if (warehouseOptions.value.length === 1) {
      const assignedWarehouse = warehouseOptions.value[0]
      form.value.warehouseId = assignedWarehouse.id
    }
    if (!canAssignWarehouse.value) loadError.value = 'scope_required'
  } catch (error) {
    if (requestId !== loadRequestId) return
    loadError.value = error?.status === 404 ? 'not_found' : classifyBeneficiaryError(error)
  } finally {
    if (requestId === loadRequestId) isLoading.value = false
  }
}

watch([beneficiaryId, staffAssignment], loadForm, { immediate: true })

function validate() {
  errors.value = validateBeneficiaryForm(form.value, warehouseOptions.value.map(({ id }) => id))
  return Object.keys(errors.value).length === 0
}

async function onSubmit() {
  if (isSaving.value) return
  submitError.value = ''
  if (!validate()) return
  isSaving.value = true

  try {
    const payload = {
      warehouseId: form.value.warehouseId,
      name: form.value.name.trim(),
      needs: form.value.needs,
      phone: form.value.phone,
      notes: form.value.notes?.trim() || '',
    }

    const result = isEditMode.value
      ? await beneficiaryRepository.update(beneficiaryId.value, { ...payload, expectedVersion: form.value.version })
      : await beneficiaryRepository.create(payload)
    router.push({ name: ADMIN_ROUTE.beneficiaryDetail, params: { beneficiaryId: result.beneficiary.id } })
  } catch (error) {
    if (error?.details?.errors) errors.value = error.details.errors
    submitError.value = error?.status === 403 ? BENEFICIARY_ERROR.forbidden
      : error?.status === 409 ? (isEditMode.value ? 'conflict' : 'warehouse_unavailable')
        : error?.code === 'UNCERTAIN' ? 'uncertain' : BENEFICIARY_ERROR.unavailable
  } finally {
    isSaving.value = false
  }
}

function goBack() {
  if (isEditMode.value) {
    router.push({ name: ADMIN_ROUTE.beneficiaryDetail, params: { beneficiaryId: beneficiaryId.value } })
    return
  }
  router.push({ name: ADMIN_ROUTE.beneficiaryList })
}

function goToList() {
  router.push({ name: ADMIN_ROUTE.beneficiaryList })
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
</script>

<template>
  <BeneficiaryShell>
    <section v-if="isLoading" class="beneficiary-form__state">
      <AuthIcon name="loader" :size="28" class="auth-spin" />
      <h2>Đang tải hồ sơ</h2>
    </section>

    <section v-else-if="loadError === BENEFICIARY_ERROR.forbidden" class="beneficiary-form__state">
      <AuthIcon name="shield" :size="28" />
      <h2>Không có quyền truy cập hồ sơ</h2>
      <p>Vui lòng liên hệ quản trị viên để được cấp quyền và phạm vi kho tương ứng.</p>
      <button type="button" class="auth-btn auth-btn--primary" @click="goToList">Quay lại danh sách</button>
    </section>

    <section v-else-if="loadError === BENEFICIARY_ERROR.unavailable" class="beneficiary-form__state">
      <AuthIcon name="alert-triangle" :size="28" />
      <h2>Không thể tải hồ sơ</h2>
      <p>Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.</p>
      <button type="button" class="auth-btn auth-btn--soft" @click="loadForm">Thử lại</button>
    </section>

    <section v-else-if="loadError === 'not_found'" class="beneficiary-form__state">
      <AuthIcon name="alert-triangle" :size="28" />
      <h2>Không tìm thấy hồ sơ</h2>
      <p>Hồ sơ không tồn tại hoặc không còn trong phạm vi truy cập.</p>
      <button type="button" class="auth-btn auth-btn--primary" @click="goToList">Quay lại danh sách</button>
    </section>

    <section v-else-if="loadError === 'scope_required'" class="beneficiary-form__state">
      <AuthIcon name="warehouse" :size="28" />
      <h2>Chưa có kho làm việc được xác định</h2>
      <p>Không thể tạo hồ sơ khi chưa có kho trong phân công hiện tại. Hãy yêu cầu quản trị viên xác nhận phạm vi kho.</p>
      <button type="button" class="auth-btn auth-btn--primary" @click="goToList">Quay lại danh sách</button>
    </section>

    <section v-else class="beneficiary-form" aria-labelledby="beneficiary-form-title">
      <header class="beneficiary-form__header">
        <div>
          <h1 id="beneficiary-form-title">{{ isEditMode ? 'Chỉnh sửa người thụ hưởng' : 'Thêm người thụ hưởng' }}</h1>
          <p class="beneficiary-form__subtitle">{{ isEditMode ? 'Cập nhật thông tin hồ sơ trong phạm vi được phân quyền.' : 'Tạo hồ sơ người thụ hưởng cho kho đang làm việc.' }}</p>
          <p class="beneficiary-form__demo-label"><AuthIcon name="info" :size="16" /> Hồ sơ mới hoặc vừa sửa sẽ chờ System Admin duyệt trước khi được dùng để xuất kho.</p>
        </div>
        <button type="button" class="auth-btn auth-btn--soft" @click="goBack">
          <AuthIcon name="arrow-left" :size="18" />Quay lại
        </button>
      </header>

      <div class="beneficiary-form__layout">
        <div class="beneficiary-form__main">
          <section class="beneficiary-form__identity">
            <header><AuthIcon name="lock" :size="18" /><div><strong>Thông tin định danh cố định</strong><small>Dữ liệu được lưu qua máy chủ</small></div><span>Hệ thống quản lý / Bất biến</span></header>
            <div class="beneficiary-form__metadata">
              <article><small>MÃ HỒ SƠ</small><strong>{{ form.id || '—' }}</strong><span>{{ form.id ? 'Mã hồ sơ' : 'Được sinh tự động khi lưu' }}</span></article>
              <article><small>KHO ĐANG LÀM VIỆC</small><strong>{{ warehouseLabel }}</strong><span>Phạm vi theo phân công hiện tại</span></article>
              <article><small>NGƯỜI TẠO BAN ĐẦU</small><strong>{{ form.createdByUid || '—' }}</strong><span>Ghi nhận bởi máy chủ</span></article>
              <article><small>THỜI GIAN TẠO HỒ SƠ</small><strong>{{ form.createdAt ? formatDate(form.createdAt) : '—' }}</strong><span>{{ createdAtText }}</span></article>
            </div>
            <div class="beneficiary-form__immutable"><AuthIcon name="shield" :size="17" /><p><strong>Nguyên tắc bất biến</strong><br />Mã hồ sơ và phạm vi kho được kiểm soát theo quyền truy cập. Không nhập CCCD/CMND, VNeID hoặc địa chỉ nhà riêng.</p></div>
          </section>

          <form class="beneficiary-form__card" @submit.prevent="onSubmit">
            <header class="beneficiary-form__section-title">
              <div><AuthIcon name="check" :size="18" /><span><strong>Thông tin hồ sơ cần cập nhật</strong><small>Chỉ chỉnh sửa các trường được phép</small></span></div>
              <span>Thông tin tối thiểu</span>
            </header>
            <p class="beneficiary-form__scope-note"><AuthIcon name="info" :size="16" /> Chỉ lưu thông tin cần thiết cho việc phân phối; hệ thống kiểm tra lại quyền theo kho khi lưu.</p>

            <label v-if="warehouseOptions.length > 1 && !isEditMode" class="beneficiary-form__field">
              <span>Kho đang làm việc</span>
              <select v-model="form.warehouseId" aria-label="Kho đang làm việc">
                <option value="">Chọn kho trong phạm vi được cấp</option>
                <option v-for="warehouse in warehouseOptions" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}</option>
              </select>
              <small v-if="errors.warehouseId" class="beneficiary-form__validation" role="alert">{{ errors.warehouseId }}</small>
            </label>

            <div v-else class="beneficiary-form__current-warehouse">
              <AuthIcon name="warehouse" :size="18" />
              <div><strong>Kho đang làm việc</strong><span>{{ warehouseLabel }}</span></div>
              <small>{{ isEditMode ? 'Không thể đổi kho khi chỉnh sửa hồ sơ' : 'Tự động theo phân công hiện tại' }}</small>
            </div>

            <label class="beneficiary-form__field">
              <span>Tên hiển thị <em>*</em> <small>(Trường bắt buộc)</small></span>
              <input
                v-model="form.name"
                type="text"
                autocomplete="off"
                placeholder="Nhập tên hiển thị của người thụ hưởng..."
                aria-required="true"
                :aria-invalid="Boolean(errors.name)"
                :aria-describedby="errors.name ? 'beneficiary-name-error' : 'beneficiary-name-help'"
              />
              <small v-if="errors.name" id="beneficiary-name-error" class="beneficiary-form__validation" role="alert">{{ errors.name }}</small>
              <small v-else id="beneficiary-name-help">Tên xưng hô hoặc định danh hiển thị trên phiếu xuất và danh sách đối chiếu vật phẩm.</small>
            </label>

            <fieldset class="beneficiary-form__field">
              <legend>Nhu cầu hỗ trợ cơ bản <em>*</em></legend>
              <label v-for="need in [
                { id: 'clothing', label: 'Quần áo' },
                { id: 'books', label: 'Sách' },
                { id: 'household', label: 'Đồ gia dụng' },
              ]" :key="need.id">
                <input type="checkbox" :value="need.id" v-model="form.needs" /> {{ need.label }}
              </label>
              <small v-if="errors.needs" class="beneficiary-form__validation" role="alert">{{ errors.needs }}</small>
            </fieldset>

            <label class="beneficiary-form__field">
              <span>Số điện thoại liên hệ <small>(Tùy chọn)</small></span>
              <input
                v-model="form.phone"
                type="tel"
                autocomplete="off"
                placeholder="Nhập số điện thoại liên hệ (nếu có)"
                :aria-invalid="Boolean(errors.phone)"
                :aria-describedby="errors.phone ? 'beneficiary-phone-error' : 'beneficiary-phone-help'"
              />
              <small v-if="errors.phone" id="beneficiary-phone-error" class="beneficiary-form__validation" role="alert">{{ errors.phone }}</small>
              <small v-else id="beneficiary-phone-help">Chỉ nhân sự có quyền theo kho mới xem hoặc chỉnh sửa.</small>
            </label>

            <label class="beneficiary-form__field">
              <span>Ghi chú phục vụ hỗ trợ <small>(Tùy chọn)</small></span>
              <textarea
                v-model="form.notes"
                rows="4"
                placeholder="Nhập ghi chú cần thiết cho việc hỗ trợ hoặc bàn giao (nếu có)..."
                :aria-invalid="Boolean(errors.notes)"
                :aria-describedby="errors.notes ? 'beneficiary-notes-error' : 'beneficiary-notes-help'"
              ></textarea>
              <small v-if="errors.notes" id="beneficiary-notes-error" class="beneficiary-form__validation" role="alert">{{ errors.notes }}</small>
              <small v-else id="beneficiary-notes-help">Chỉ ghi thông tin cần thiết cho việc liên hệ và bàn giao. Không nhập dữ liệu nhận dạng nhạy cảm.</small>
            </label>

            <div class="beneficiary-form__privacy">
              <AuthIcon name="shield" :size="18" />
              <p><strong>Cơ chế bảo vệ dữ liệu &amp; tuân thủ tối thiểu</strong><br />Không thu thập CCCD/CMND, VNeID, địa chỉ nhà riêng, giấy tờ tùy thân hoặc ảnh giấy tờ trong biểu mẫu này.</p>
            </div>

            <p v-if="submitError === BENEFICIARY_ERROR.forbidden" class="beneficiary-form__error" role="alert">Không có quyền lưu hồ sơ trong phạm vi đã chọn.</p>
            <p v-else-if="submitError === 'conflict'" class="beneficiary-form__error" role="alert">Hồ sơ đã thay đổi. Tải lại trước khi sửa tiếp.</p>
            <p v-else-if="submitError === 'warehouse_unavailable'" class="beneficiary-form__error" role="alert">Kho đã ngừng hoạt động hoặc không còn khả dụng. Chọn kho khác rồi thử lại.</p>
            <p v-else-if="submitError === 'uncertain'" class="beneficiary-form__error" role="alert">Chưa rõ hồ sơ đã được lưu hay chưa. Kiểm tra danh sách trước khi gửi lại để tránh tạo trùng.</p>
            <p v-else-if="submitError === BENEFICIARY_ERROR.unavailable" class="beneficiary-form__error" role="alert">Không thể lưu hồ sơ. Kiểm tra kết nối hoặc tải lại nếu dữ liệu vừa thay đổi.</p>

            <div class="beneficiary-form__actions">
              <button type="button" class="auth-btn auth-btn--soft" @click="goBack">Hủy</button>
              <button type="submit" class="auth-btn auth-btn--primary" :disabled="isSaving">
                <AuthIcon :name="isSaving ? 'loader' : 'check'" :size="18" :class="{ 'auth-spin': isSaving }" />
                {{ isSaving ? 'Đang lưu hồ sơ...' : (isEditMode ? 'Cập nhật hồ sơ' : 'Tạo hồ sơ') }}
              </button>
            </div>
          </form>
        </div>

        <aside class="beneficiary-form__guidance">
          <article><h2>Kiểm soát quyền &amp; phạm vi kho</h2><p>Thông tin hồ sơ chỉ được xem/chỉnh sửa trong phạm vi kho được phân công. Kiểm tra ở giao diện không thay thế bảo vệ phía máy chủ.</p></article>
          <article><h2>Bảo vệ thông tin liên hệ</h2><p>Số điện thoại là tùy chọn và chỉ dành cho nhân sự có quyền truy cập hồ sơ. Không hiển thị địa chỉ riêng hoặc giấy tờ định danh.</p></article>
          <article><h2>Dữ liệu phân phối</h2><p>Lịch sử, số lần và thời gian hỗ trợ chỉ được lấy từ chứng từ phân phối đã xác nhận.</p></article>
        </aside>
      </div>
    </section>
  </BeneficiaryShell>
</template>

<style scoped>
.beneficiary-form {
  width: min(980px, 100%);
  margin: 0 auto;
  padding: 24px 8px 52px;
}

.beneficiary-form__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin-bottom: 24px;
}

.beneficiary-form__eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #4d7a4f;
  font-weight: 700;
  margin-bottom: 6px;
}

.beneficiary-form__demo-label,
.beneficiary-form__notice {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  font-size: 13px;
}

.beneficiary-form__demo-label {
  color: #8a5a00;
}

.beneficiary-form__notice {
  color: #617081;
}

.beneficiary-form__header h1 {
  font-size: clamp(28px, 3vw, 38px);
  font-weight: 700;
  color: #182a31;
}

.beneficiary-form__card {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e7edf5;
  border-radius: 22px;
  padding: 28px;
  box-shadow: 0 12px 32px rgba(27, 52, 88, 0.04);
}

.beneficiary-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 18px;
}

.beneficiary-form__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

fieldset.beneficiary-form__field {
  margin: 0;
  padding: 12px;
  border: 1px solid #d8e0e4;
  border-radius: 10px;
}

fieldset.beneficiary-form__field label {
  display: flex;
  align-items: center;
  gap: 8px;
}

fieldset.beneficiary-form__field input[type='checkbox'] {
  width: auto;
}

.beneficiary-form__field--full {
  grid-column: 1 / -1;
}

.beneficiary-form__field span {
  font-weight: 600;
  color: #264455;
}

.beneficiary-form__field em {
  color: #d02b2b;
  font-style: normal;
}

.beneficiary-form__field input,
.beneficiary-form__field select,
.beneficiary-form__field textarea {
  width: 100%;
  border: 1px solid #dfe6f1;
  border-radius: 12px;
  background: #fff;
  padding: 12px 14px;
  font-size: 15px;
  color: #1a2730;
}

.beneficiary-form__field textarea {
  resize: vertical;
}

.beneficiary-form__field small {
  color: #617081;
  font-size: 12px;
}

.beneficiary-form__error {
  margin-top: 18px;
  color: #c62828;
}

.beneficiary-form__state {
  width: min(720px, 100%);
  min-height: 320px;
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  padding: 28px;
  text-align: center;
  background: #fff;
  border: 1px solid #e7edf5;
  border-radius: 20px;
}

.beneficiary-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 28px;
}

.beneficiary-form__subtitle {
  margin-top: 6px;
  color: #617081;
}

.beneficiary-form__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(240px, 0.8fr);
  align-items: start;
  gap: 20px;
}

.beneficiary-form__main {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.beneficiary-form__identity,
.beneficiary-form__guidance article {
  padding: 20px;
  border: 1px solid #e1e7f1;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(27, 52, 88, 0.04);
}

.beneficiary-form__identity > header,
.beneficiary-form__section-title > div {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #246632;
}

.beneficiary-form__identity > header > div,
.beneficiary-form__section-title span {
  display: grid;
  gap: 2px;
}

.beneficiary-form__identity > header small,
.beneficiary-form__section-title small {
  color: #708090;
  font-size: 12px;
  font-weight: 400;
}

.beneficiary-form__identity > header > span,
.beneficiary-form__section-title > span {
  margin-left: auto;
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef1fb;
  color: #536174;
  font-size: 11px;
}

.beneficiary-form__metadata {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.beneficiary-form__metadata article {
  display: grid;
  gap: 5px;
  min-height: 86px;
  padding: 12px;
  border-radius: 10px;
  background: #f1f3fc;
}

.beneficiary-form__metadata small {
  color: #617081;
  font-size: 10px;
  font-weight: 700;
}

.beneficiary-form__metadata strong {
  overflow-wrap: anywhere;
  color: #1a2d3a;
}

.beneficiary-form__metadata span {
  color: #708090;
  font-size: 11px;
}

.beneficiary-form__immutable,
.beneficiary-form__scope-note,
.beneficiary-form__privacy {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 10px;
  background: #eff2fd;
  color: #42536a;
  font-size: 12px;
}

.beneficiary-form__immutable svg,
.beneficiary-form__privacy svg {
  flex: 0 0 auto;
  color: #28713a;
}

.beneficiary-form__immutable p,
.beneficiary-form__privacy p {
  margin: 0;
}

.beneficiary-form__card {
  display: grid;
  gap: 18px;
  padding: 22px;
}

.beneficiary-form__section-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.beneficiary-form__current-warehouse {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dfe6f1;
  border-radius: 10px;
  background: #f7f9ff;
  color: #246632;
}

.beneficiary-form__current-warehouse div {
  display: grid;
  gap: 2px;
}

.beneficiary-form__current-warehouse span,
.beneficiary-form__current-warehouse small {
  color: #617081;
  font-size: 12px;
}

.beneficiary-form__current-warehouse small {
  margin-left: auto;
  text-align: right;
}

.beneficiary-form__field > span {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.beneficiary-form__field > span > small {
  color: #718091;
  font-size: 12px;
  font-weight: 400;
}

.beneficiary-form__field em {
  color: #c62828;
}

.beneficiary-form__field small.beneficiary-form__validation {
  color: #c62828;
}

.beneficiary-form__guidance {
  display: grid;
  gap: 14px;
}

.beneficiary-form__guidance h2 {
  margin-bottom: 8px;
  color: #26384b;
  font-size: 15px;
}

.beneficiary-form__guidance p {
  color: #617081;
  font-size: 13px;
}

@media (max-width: 760px) {
  .beneficiary-form__layout {
    grid-template-columns: 1fr;
  }

  .beneficiary-form__metadata {
    grid-template-columns: 1fr;
  }

  .beneficiary-form__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .beneficiary-form__current-warehouse {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .beneficiary-form__current-warehouse small {
    width: 100%;
    margin-left: 28px;
    text-align: left;
  }
}
</style>
