<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE, USER_ROLE } from '../auth/auth.constants'
import { staffAssignment } from '../auth/auth.store'
import { hubRepository } from './hub.repository'
import { emptyHubForm, formFromHub, hubErrorMessage, hubPayload, mapsUrl, validateHubForm } from './hub.model'

const route = useRoute()
const router = useRouter()
const hubId = computed(() => route.params.hubId || '')
const isEdit = computed(() => Boolean(hubId.value))
const canManage = computed(() => staffAssignment.value?.active === true && staffAssignment.value.role === USER_ROLE.systemAdmin)

const form = ref(emptyHubForm())
const original = ref(null)
const errors = ref({})
const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref('')
const submitError = ref('')
// Bỏ nhãn minh hoạ cần tick xác nhận ngay trên form (không dùng window.confirm: một số trình duyệt
// nhúng chặn hộp thoại và trả về "Huỷ" ngay, khiến nút Lưu trông như không hoạt động).
const confirmReal = ref(false)
let requestId = 0

const previewUrl = computed(() => mapsUrl(form.value.latitude, form.value.longitude))
// Bỏ nhãn minh hoạ là khẳng định với donor rằng điểm này nhận đồ thật: nhắc rõ trước khi lưu.
const markingReal = computed(() => !form.value.isDemo && (original.value ? original.value.isDemo !== false : true))
watch(markingReal, (value) => { if (!value) confirmReal.value = false })

async function load() {
  const current = ++requestId
  loadError.value = ''
  submitError.value = ''
  errors.value = {}
  if (!isEdit.value) {
    original.value = null
    form.value = emptyHubForm()
    return
  }
  isLoading.value = true
  try {
    // API không có route đọc một Hub: danh sách đã đủ nhỏ (tối đa 200 điểm).
    const hub = (await hubRepository.list()).find((item) => item.id === hubId.value)
    if (current !== requestId) return
    if (!hub) {
      loadError.value = 'Không tìm thấy điểm tiếp nhận.'
      return
    }
    original.value = hub
    form.value = formFromHub(hub)
  } catch (error) {
    if (current === requestId) loadError.value = hubErrorMessage(error)
  } finally {
    if (current === requestId) isLoading.value = false
  }
}

watch([hubId, canManage], ([, allowed]) => { if (allowed) load() }, { immediate: true })

async function onSubmit() {
  if (isSaving.value) return
  submitError.value = ''
  errors.value = validateHubForm(form.value)
  if (Object.keys(errors.value).length) return
  const payload = hubPayload(form.value, original.value)
  if (isEdit.value && !Object.keys(payload).length) {
    submitError.value = 'Chưa có thay đổi nào để lưu.'
    return
  }
  if (markingReal.value && !confirmReal.value) {
    submitError.value = 'Tick ô xác nhận điểm đã sẵn sàng nhận đồ thật trước khi bỏ nhãn minh hoạ.'
    return
  }
  isSaving.value = true
  try {
    if (isEdit.value) await hubRepository.update(hubId.value, payload, original.value.version)
    else await hubRepository.create(payload)
    router.push({ name: ADMIN_ROUTE.hubList })
  } catch (error) {
    submitError.value = hubErrorMessage(error)
  } finally {
    isSaving.value = false
  }
}

function cancel() {
  router.push({ name: ADMIN_ROUTE.hubList })
}
</script>

<template>
  <section v-if="!canManage" class="hub-state">
    <AuthIcon name="shield" :size="28" />
    <h2>Chỉ Quản trị hệ thống thêm hoặc sửa điểm tiếp nhận</h2>
    <RouterLink :to="{ name: ADMIN_ROUTE.hubList }" class="auth-btn auth-btn--soft">Xem danh sách điểm</RouterLink>
  </section>

  <section v-else-if="isLoading" class="hub-state">
    <AuthIcon name="loader" :size="28" class="auth-spin" /><h2>Đang tải điểm tiếp nhận</h2>
  </section>

  <section v-else-if="loadError" class="hub-state" role="alert">
    <AuthIcon name="alert-triangle" :size="28" /><h2>{{ loadError }}</h2>
    <button type="button" class="auth-btn auth-btn--soft" @click="load">Thử lại</button>
  </section>

  <form v-else class="hub-form" novalidate @submit.prevent="onSubmit">
    <header class="hub-form__header">
      <h1>{{ isEdit ? 'Sửa điểm tiếp nhận' : 'Thêm điểm tiếp nhận' }}</h1>
      <p v-if="!isEdit">Điểm mới hiện ngay trên app iOS để donor chọn. Mặc định gắn nhãn <strong>minh hoạ</strong> cho tới khi điểm thật sự nhận đồ.</p>
      <p v-else>Đổi tên sẽ cập nhật tên trong các chiến dịch nháp và đang mở; đơn đã gửi vẫn giữ tên điểm lúc gửi.</p>
    </header>

    <div class="hub-form__card">
      <label class="hub-field">
        <span>Tên điểm <em>*</em></span>
        <input v-model="form.name" type="text" maxlength="120" placeholder="Ví dụ: Điểm Hải Châu" :aria-invalid="Boolean(errors.name)" />
        <small v-if="errors.name" class="hub-field__error" role="alert">{{ errors.name }}</small>
        <small v-else>Donor thấy tên này trên app; không trùng với điểm khác.</small>
      </label>

      <label class="hub-field">
        <span>Địa chỉ <em>*</em></span>
        <input v-model="form.address" type="text" maxlength="200" placeholder="Số nhà, đường, phường/quận" :aria-invalid="Boolean(errors.address)" />
        <small v-if="errors.address" class="hub-field__error" role="alert">{{ errors.address }}</small>
      </label>

      <label class="hub-field">
        <span>Giờ tiếp nhận <em>*</em></span>
        <input v-model="form.openHours" type="text" maxlength="200" placeholder="Ví dụ: 8:00–17:00, thứ Hai–thứ Bảy" :aria-invalid="Boolean(errors.openHours)" />
        <small v-if="errors.openHours" class="hub-field__error" role="alert">{{ errors.openHours }}</small>
      </label>

      <div class="hub-form__grid">
        <label class="hub-field">
          <span>Vĩ độ <em>*</em></span>
          <input v-model="form.latitude" type="text" inputmode="decimal" placeholder="16.0678" :aria-invalid="Boolean(errors.latitude)" />
          <small v-if="errors.latitude" class="hub-field__error" role="alert">{{ errors.latitude }}</small>
        </label>
        <label class="hub-field">
          <span>Kinh độ <em>*</em></span>
          <input v-model="form.longitude" type="text" inputmode="decimal" placeholder="108.2208" :aria-invalid="Boolean(errors.longitude)" />
          <small v-if="errors.longitude" class="hub-field__error" role="alert">{{ errors.longitude }}</small>
        </label>
      </div>
      <p class="hub-form__hint">
        Lấy toạ độ: mở Google Maps, nhấn giữ vào vị trí rồi chép hai số hiện ra.
        <a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noopener noreferrer">Kiểm tra vị trí trên Google Maps</a>
      </p>

      <label class="hub-check">
        <input v-model="form.isDemo" type="checkbox" />
        <span>Điểm <strong>minh hoạ</strong> (chưa tiếp nhận đồ thật). App ghi rõ nhãn này cho donor.</span>
      </label>
      <div v-if="markingReal" class="hub-form__warning" role="status">
        <p><AuthIcon name="alert-triangle" :size="16" />Bỏ nhãn minh hoạ nghĩa là donor có thể mang đồ tới điểm này thật. Chỉ bỏ khi điểm đã sẵn sàng.</p>
        <label class="hub-check">
          <input v-model="confirmReal" type="checkbox" />
          <span>Tôi xác nhận điểm này đã sẵn sàng tiếp nhận đồ thật.</span>
        </label>
      </div>

      <p v-if="submitError" class="hub-form__error" role="alert">{{ submitError }}</p>

      <div class="hub-form__actions">
        <button type="button" class="auth-btn auth-btn--soft" @click="cancel">Hủy</button>
        <button type="submit" class="auth-btn auth-btn--primary" :disabled="isSaving">
          <AuthIcon :name="isSaving ? 'loader' : 'check'" :size="18" :class="{ 'auth-spin': isSaving }" />
          {{ isSaving ? 'Đang lưu…' : (isEdit ? 'Lưu thay đổi' : 'Thêm điểm') }}
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.hub-form { width: min(760px, 100%); margin: 0 auto; padding: 24px 8px 52px; }
.hub-form__header { margin-bottom: 18px; }
.hub-form__header h1 { font-size: clamp(26px, 3vw, 34px); font-weight: 700; color: #182a31; }
.hub-form__header p { margin-top: 6px; color: #617081; }
.hub-form__card { display: grid; gap: 18px; padding: 24px; background: #fff; border: 1px solid #e7edf5; border-radius: 18px; box-shadow: 0 12px 32px rgba(27, 52, 88, 0.04); }
.hub-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.hub-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.hub-field > span { font-weight: 600; color: #264455; }
.hub-field em { color: #c62828; font-style: normal; }
.hub-field small { color: #617081; font-size: 12px; }
.hub-field input { width: 100%; border: 1px solid #dfe6f1; border-radius: 12px; background: #fff; padding: 11px 13px; font-size: 15px; color: #1a2730; }
.hub-field__error, .hub-field small.hub-field__error { color: #c62828; }
.hub-form__hint { margin-top: -8px; color: #617081; font-size: 13px; }
.hub-form__hint a { color: #246632; margin-left: 4px; }
.hub-check { display: flex; align-items: flex-start; gap: 10px; color: #264455; }
.hub-check input { width: auto; margin-top: 3px; }
.hub-form__warning { display: grid; gap: 8px; padding: 10px 12px; border-radius: 12px; background: #fff3d6; color: #8a5a00; font-size: 14px; }
.hub-form__warning p { display: flex; align-items: flex-start; gap: 8px; margin: 0; }
.hub-form__error { color: #c62828; }
.hub-form__actions { display: flex; justify-content: flex-end; gap: 12px; }
.hub-state { width: min(720px, 100%); min-height: 260px; margin: 24px auto; display: grid; place-items: center; align-content: center; gap: 12px; padding: 28px; text-align: center; background: #fff; border: 1px solid #e7edf5; border-radius: 20px; }
@media (max-width: 760px) {
  .hub-form__grid { grid-template-columns: 1fr; }
}
</style>
