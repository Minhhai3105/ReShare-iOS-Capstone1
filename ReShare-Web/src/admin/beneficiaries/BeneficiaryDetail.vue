<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE } from '../auth/auth.constants'
import { staffAssignment } from '../auth/auth.store'
import BeneficiaryShell from './BeneficiaryShell.vue'
import { BENEFICIARY_ERROR, classifyBeneficiaryError, fetchBeneficiary } from './beneficiary.service'

const route = useRoute()
const router = useRouter()
const beneficiaryId = computed(() => route.params.beneficiaryId)
const beneficiary = ref(null)
const isLoading = ref(true)
const error = ref('')
const createdAtText = computed(() => {
  if (!beneficiary.value?.createdAt) return '—'
  const date = new Date(beneficiary.value.createdAt)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
})
const warehouseLabel = computed(() => beneficiary.value?.warehouseName || beneficiary.value?.warehouseId || '—')

function loadBeneficiary() {
  isLoading.value = true
  error.value = ''
  beneficiary.value = null

  try {
    beneficiary.value = fetchBeneficiary(staffAssignment.value, route.params.beneficiaryId)
  } catch (loadError) {
    error.value = classifyBeneficiaryError(loadError)
  } finally {
    isLoading.value = false
  }
}

watch([beneficiaryId, staffAssignment], loadBeneficiary, { immediate: true })

function goBack() {
  router.push({ name: ADMIN_ROUTE.beneficiaryList })
}

function goEdit() {
  router.push({ name: ADMIN_ROUTE.beneficiaryEdit, params: { beneficiaryId: beneficiaryId.value } })
}
</script>

<template>
  <BeneficiaryShell>
    <section v-if="isLoading" class="beneficiary-detail__state">
      <AuthIcon name="loader" :size="28" class="auth-spin" />
      <h2>Đang tải hồ sơ</h2>
    </section>

    <section v-else-if="error === BENEFICIARY_ERROR.forbidden" class="beneficiary-detail__state">
      <AuthIcon name="shield" :size="28" />
      <h2>Không có quyền truy cập hồ sơ</h2>
      <p>Vui lòng liên hệ quản trị viên để được cấp quyền và phạm vi kho tương ứng.</p>
      <button type="button" class="auth-btn auth-btn--primary" @click="goBack">Quay lại danh sách</button>
    </section>

    <section v-else-if="error === BENEFICIARY_ERROR.unavailable" class="beneficiary-detail__state">
      <AuthIcon name="alert-triangle" :size="28" />
      <h2>Không thể tải hồ sơ</h2>
      <p>Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.</p>
      <button type="button" class="auth-btn auth-btn--soft" @click="loadBeneficiary">Thử lại</button>
    </section>

    <section v-else-if="!beneficiary" class="beneficiary-detail__state">
      <AuthIcon name="alert-triangle" :size="28" />
      <h2>Không tìm thấy hồ sơ</h2>
      <p>Hồ sơ không tồn tại hoặc không còn trong phạm vi truy cập.</p>
      <button type="button" class="auth-btn auth-btn--primary" @click="goBack">Quay lại danh sách</button>
    </section>

    <section v-else class="beneficiary-detail" aria-labelledby="beneficiary-detail-title">
      <div class="beneficiary-detail__breadcrumb">
        <button type="button" @click="goBack">Người thụ hưởng</button><span>/</span><strong>Chi tiết hồ sơ</strong>
      </div>
      <header class="beneficiary-detail__header">
        <div>
          <div class="beneficiary-detail__title-row">
            <span class="beneficiary-detail__title-icon"><AuthIcon name="users" :size="20" /></span>
            <div><h1 id="beneficiary-detail-title">Thông tin hồ sơ người thụ hưởng</h1><p>{{ beneficiary.name }}</p></div>
          </div>
          <p class="beneficiary-detail__demo-label"><AuthIcon name="info" :size="16" /> Bản xem thử: hồ sơ lưu trong bộ nhớ trình duyệt, không phải hồ sơ vận hành.</p>
        </div>
        <div class="beneficiary-detail__actions">
          <button type="button" class="auth-btn auth-btn--primary" @click="goEdit">
            <AuthIcon name="file-text" :size="18" />Chỉnh sửa hồ sơ
          </button>
        </div>
      </header>

      <div class="beneficiary-detail__body">
        <div class="beneficiary-detail__main">
          <article class="beneficiary-detail__card">
            <header class="beneficiary-detail__card-heading">
              <div><AuthIcon name="users" :size="19" /><h2>Thông tin hồ sơ người thụ hưởng</h2></div>
              <span>Hồ sơ cục bộ</span>
            </header>
            <div class="beneficiary-detail__privacy-note">
              <AuthIcon name="shield" :size="17" />
              <p>Không lưu trữ CCCD/CMND, VNeID hoặc địa chỉ nhà riêng trong giao diện này. Số điện thoại chỉ hiển thị cho nhân sự có quyền truy cập.</p>
            </div>
            <dl class="beneficiary-detail__meta">
              <div><dt>Mã hồ sơ</dt><dd>{{ beneficiary.id }}</dd></div>
              <div><dt>Tên hiển thị</dt><dd>{{ beneficiary.name || '—' }}</dd></div>
              <div class="beneficiary-detail__meta-wide"><dt>Số điện thoại liên hệ</dt><dd>{{ beneficiary.phone || '—' }}</dd></div>
              <div class="beneficiary-detail__meta-wide"><dt>Ghi chú phục vụ hỗ trợ</dt><dd>{{ beneficiary.notes || '—' }}</dd></div>
              <div><dt>Người tạo</dt><dd>{{ beneficiary.createdBy || '—' }}</dd></div>
              <div><dt>Ngày tạo</dt><dd>{{ createdAtText }}</dd></div>
            </dl>
          </article>

          <article class="beneficiary-detail__card beneficiary-detail__history">
            <header class="beneficiary-detail__card-heading">
              <div><AuthIcon name="history" :size="19" /><h2>Lịch sử nhận hỗ trợ tại kho</h2></div>
              <span><AuthIcon name="info" :size="13" /> Chưa kết nối nguồn dữ liệu</span>
            </header>
            <div class="beneficiary-detail__history-table">
              <div class="beneficiary-detail__history-head"><span>Thời gian bàn giao</span><span>Vật phẩm</span><span>Số lượng</span><span>Đơn vị</span><span>Phiếu xuất</span><span>Thao tác</span></div>
              <div class="beneficiary-detail__history-empty">
                <AuthIcon name="history" :size="24" />
                <strong>Chưa có dữ liệu chứng từ phân phối</strong>
                <p>Lịch sử chỉ hiển thị khi được truy vấn từ distribution records đã xác nhận. Hiện FE chưa có hợp đồng dữ liệu để tải lịch sử thật.</p>
              </div>
            </div>
          </article>
        </div>

        <aside class="beneficiary-detail__side">
          <article class="beneficiary-detail__card">
            <h2>Phạm vi hồ sơ</h2>
            <div class="beneficiary-detail__scope"><AuthIcon name="warehouse" :size="19" /><div><small>Kho đang làm việc</small><strong>{{ warehouseLabel }}</strong></div></div>
            <p>Quyền truy cập được kiểm tra theo phân công hiện có. Đây không thay thế bảo vệ từ API hoặc Firestore Rules.</p>
          </article>
          <article class="beneficiary-detail__card">
            <h2>Nguyên tắc bảo vệ dữ liệu</h2>
            <ul>
              <li>Thu thập thông tin tối thiểu phục vụ bàn giao.</li>
              <li>Không hiển thị CCCD/CMND, VNeID hoặc địa chỉ chi tiết.</li>
              <li>Không suy diễn lần hỗ trợ từ dữ liệu nhập tay.</li>
            </ul>
          </article>
          <article class="beneficiary-detail__card beneficiary-detail__connection">
            <AuthIcon name="info" :size="18" /><div><strong>Nguồn lịch sử chưa kết nối</strong><p>Chờ BE cung cấp hợp đồng đọc chứng từ phân phối.</p></div>
          </article>
        </aside>
      </div>
    </section>
  </BeneficiaryShell>
</template>

<style scoped>
.beneficiary-detail {
  width: min(1080px, 100%);
  margin: 0 auto;
  padding: 24px 8px 48px;
}

.beneficiary-detail__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin-bottom: 22px;
}

.beneficiary-detail__eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #4d7a4f;
  font-weight: 700;
  margin-bottom: 6px;
}

.beneficiary-detail__demo-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  color: #8a5a00;
  font-size: 13px;
}

.beneficiary-detail__header h1 {
  font-size: clamp(28px, 3vw, 38px);
  font-weight: 700;
  color: #182a31;
}

.beneficiary-detail__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.beneficiary-detail__body {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 22px;
}

.beneficiary-detail__card {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e7edf5;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 12px 30px rgba(27, 52, 88, 0.04);
}

.beneficiary-detail__card h2,
.beneficiary-detail__notes h3 {
  margin-bottom: 18px;
  color: #1a2d3a;
}

.beneficiary-detail__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(150px, 1fr));
  gap: 16px 20px;
}

.beneficiary-detail__meta div {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.beneficiary-detail__meta dt {
  font-size: 12px;
  text-transform: uppercase;
  color: #617081;
  letter-spacing: 0.08em;
}

.beneficiary-detail__meta dd {
  font-size: 16px;
  color: #143b39;
  font-weight: 600;
}

.beneficiary-detail__status {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.beneficiary-detail__status--verified {
  background: #e7f7eb;
  color: #1f6b2c;
}

.beneficiary-detail__status--pending {
  background: #fff3d9;
  color: #9a6700;
}

.beneficiary-detail__status--needs_update {
  background: #fde7e7;
  color: #b42318;
}

.beneficiary-detail__notes {
  margin-top: 22px;
  border-top: 1px solid #edf2f7;
  padding-top: 18px;
}

.beneficiary-detail__notes p {
  color: #445167;
  line-height: 1.7;
}

.beneficiary-detail__history {
  display: grid;
  gap: 12px;
}

.beneficiary-detail__history-note {
  display: block;
  margin-top: 12px;
  color: #8a5a00;
}

.beneficiary-detail__history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  background: #f9fbfd;
  border: 1px solid #edf2f7;
  border-radius: 14px;
  padding: 12px 14px;
}

.beneficiary-detail__history-item strong,
.beneficiary-detail__history-item span {
  display: block;
}

.beneficiary-detail__history-item small {
  color: #64747f;
}

.beneficiary-detail__empty {
  display: flex;
  gap: 10px;
  align-items: center;
  color: #617081;
  background: #f8fafc;
  border: 1px dashed #dfe6f1;
  border-radius: 12px;
  padding: 16px;
}

.beneficiary-detail__state {
  width: min(720px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 16px;
  min-height: 320px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #e7edf5;
  border-radius: 20px;
  padding: 28px;
}

.beneficiary-detail__state h2 {
  font-size: 28px;
}

.beneficiary-detail__state p {
  color: #617081;
}

.beneficiary-detail {
  width: min(1280px, 100%);
  padding: 20px 8px 44px;
}

.beneficiary-detail__breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  color: #7b8392;
  font-size: 13px;
}

.beneficiary-detail__breadcrumb button {
  border: 0;
  padding: 0;
  background: transparent;
  color: #2a7135;
  cursor: pointer;
  font: inherit;
}

.beneficiary-detail__breadcrumb strong {
  color: #26384b;
}

.beneficiary-detail__header {
  margin-bottom: 18px;
}

.beneficiary-detail__title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.beneficiary-detail__title-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #e7f5e8;
  color: #1f6b2c;
}

.beneficiary-detail__title-row h1 {
  font-size: clamp(21px, 2.2vw, 28px);
}

.beneficiary-detail__title-row p {
  margin-top: 2px;
  color: #526275;
}

.beneficiary-detail__body {
  grid-template-columns: minmax(0, 1.7fr) minmax(240px, 0.8fr);
  align-items: start;
  gap: 18px;
}

.beneficiary-detail__main,
.beneficiary-detail__side {
  display: grid;
  align-content: start;
  gap: 16px;
  min-width: 0;
}

.beneficiary-detail__card {
  padding: 20px;
  border-radius: 14px;
}

.beneficiary-detail__card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.beneficiary-detail__card-heading > div,
.beneficiary-detail__card-heading > span {
  display: flex;
  align-items: center;
  gap: 8px;
}

.beneficiary-detail__card-heading > div {
  color: #267238;
}

.beneficiary-detail__card-heading h2 {
  margin: 0;
  font-size: 16px;
}

.beneficiary-detail__card-heading > span {
  color: #5e6a7b;
  font-size: 11px;
  white-space: nowrap;
}

.beneficiary-detail__privacy-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 16px;
  padding: 11px 12px;
  border-radius: 10px;
  background: #eff2fd;
  color: #4b5970;
  font-size: 12px;
}

.beneficiary-detail__privacy-note svg {
  flex: 0 0 auto;
  color: #327143;
}

.beneficiary-detail__privacy-note p {
  margin: 0;
}

.beneficiary-detail__meta {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.beneficiary-detail__meta > div {
  min-height: 72px;
  padding: 12px;
  border-radius: 10px;
  background: #f3f5fc;
}

.beneficiary-detail__meta .beneficiary-detail__meta-wide {
  grid-column: 1 / -1;
}

.beneficiary-detail__meta dt {
  font-size: 10px;
}

.beneficiary-detail__meta dd {
  overflow-wrap: anywhere;
  font-size: 14px;
}

.beneficiary-detail__history-table {
  overflow-x: auto;
  border: 1px solid #e4e9f2;
  border-radius: 10px;
}

.beneficiary-detail__history-head {
  display: grid;
  grid-template-columns: 1.3fr 1.2fr 0.7fr 0.7fr 0.9fr 0.7fr;
  gap: 8px;
  min-width: 650px;
  padding: 12px;
  background: #f2f4fc;
  color: #586579;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.beneficiary-detail__history-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  min-height: 180px;
  padding: 26px;
  text-align: center;
  color: #617081;
}

.beneficiary-detail__history-empty svg {
  color: #8191a2;
}

.beneficiary-detail__history-empty strong {
  color: #334458;
}

.beneficiary-detail__history-empty p {
  max-width: 540px;
  font-size: 12px;
}

.beneficiary-detail__scope {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 10px;
  background: #f1f4fd;
  color: #276d35;
}

.beneficiary-detail__scope div {
  display: grid;
}

.beneficiary-detail__scope small,
.beneficiary-detail__side p,
.beneficiary-detail__side li {
  color: #627184;
  font-size: 12px;
}

.beneficiary-detail__side h2 {
  font-size: 15px;
}

.beneficiary-detail__side ul {
  display: grid;
  gap: 8px;
  padding-left: 18px;
}

.beneficiary-detail__connection {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: #8a5a00;
  background: #fff9e9;
}

.beneficiary-detail__connection h2 {
  margin: 0 0 4px;
}

.beneficiary-detail__connection p {
  margin: 0;
}

@media (max-width: 860px) {
  .beneficiary-detail__body,
  .beneficiary-detail__meta {
    grid-template-columns: 1fr;
  }

  .beneficiary-detail__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .beneficiary-detail__meta .beneficiary-detail__meta-wide {
    grid-column: auto;
  }

  .beneficiary-detail__card-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
