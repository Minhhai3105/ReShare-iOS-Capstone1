<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE, USER_ROLE } from '../auth/auth.constants'
import { staffAssignment } from '../auth/auth.store'
import { UNIT_LABEL } from '../shared/units.js'
import { campaignRepository } from './campaign.repository'
import {
  CAMPAIGN_CATEGORIES, CAMPAIGN_UNITS, campaignErrorMessage, campaignPayload, emptyCampaignForm,
  formFromCampaign, todayInVietnam, validateCampaignForm,
} from './campaign.model'

const route = useRoute()
const router = useRouter()
const campaignId = computed(() => route.params.campaignId || '')
const isEdit = computed(() => Boolean(campaignId.value))
const canManage = computed(() => staffAssignment.value?.active === true && staffAssignment.value.role === USER_ROLE.systemAdmin)

const form = ref(emptyCampaignForm())
const original = ref(null)
const hubs = ref([])
const errors = ref({})
const isLoading = ref(true)
const isSaving = ref(false)
const loadError = ref('')
const submitError = ref('')
const minDate = todayInVietnam()
let requestId = 0

// Đã công khai thì khoá danh mục và đơn vị: đổi lúc này sẽ làm sai tiến độ đã cộng.
const lockCategoryAndUnit = computed(() => isEdit.value && original.value?.status !== 'draft')
const isClosed = computed(() => original.value?.status === 'closed')

async function load() {
  const current = ++requestId
  isLoading.value = true
  loadError.value = ''
  submitError.value = ''
  errors.value = {}
  try {
    const [hubOptions, detail] = await Promise.all([
      campaignRepository.options(),
      isEdit.value ? campaignRepository.get(campaignId.value) : Promise.resolve(null),
    ])
    if (current !== requestId) return
    original.value = detail?.campaign || null
    form.value = detail ? formFromCampaign(detail.campaign) : emptyCampaignForm()
    // Giữ cả Hub đã chọn trước đây dù nay ngừng hoạt động, để người dùng thấy và bỏ chọn.
    const known = new Set(hubOptions.map((hub) => hub.id))
    const legacy = (detail?.campaign.hubs || []).filter((hub) => !known.has(hub.id)).map((hub) => ({ ...hub, inactive: true }))
    hubs.value = [...hubOptions, ...legacy]
  } catch (error) {
    if (current === requestId) loadError.value = error?.status === 404 ? 'Không tìm thấy chiến dịch.' : campaignErrorMessage(error)
  } finally {
    if (current === requestId) isLoading.value = false
  }
}

watch([campaignId, canManage], ([, allowed]) => { if (allowed) load() }, { immediate: true })

async function onSubmit() {
  if (isSaving.value) return
  submitError.value = ''
  errors.value = validateCampaignForm(form.value)
  if (Object.keys(errors.value).length) return
  const payload = campaignPayload(form.value, original.value)
  if (isEdit.value && !Object.keys(payload).length) {
    submitError.value = 'Chưa có thay đổi nào để lưu.'
    return
  }
  isSaving.value = true
  try {
    const saved = isEdit.value
      ? await campaignRepository.update(campaignId.value, payload, original.value.version)
      : await campaignRepository.create(payload)
    router.push({ name: ADMIN_ROUTE.campaignDetail, params: { campaignId: saved.id } })
  } catch (error) {
    submitError.value = campaignErrorMessage(error)
  } finally {
    isSaving.value = false
  }
}

function cancel() {
  if (isEdit.value) router.push({ name: ADMIN_ROUTE.campaignDetail, params: { campaignId: campaignId.value } })
  else router.push({ name: ADMIN_ROUTE.campaignList })
}
</script>

<template>
  <section v-if="!canManage" class="campaign-state">
    <AuthIcon name="shield" :size="28" />
    <h2>Chỉ Quản trị hệ thống quản lý chiến dịch</h2>
  </section>

  <section v-else-if="isLoading" class="campaign-state">
    <AuthIcon name="loader" :size="28" class="auth-spin" /><h2>Đang tải biểu mẫu</h2>
  </section>

  <section v-else-if="loadError" class="campaign-state" role="alert">
    <AuthIcon name="alert-triangle" :size="28" /><h2>{{ loadError }}</h2>
    <button type="button" class="auth-btn auth-btn--soft" @click="load">Thử lại</button>
  </section>

  <section v-else-if="isClosed" class="campaign-state">
    <AuthIcon name="lock" :size="28" /><h2>Chiến dịch đã đóng, không sửa được nữa</h2>
    <button type="button" class="auth-btn auth-btn--soft" @click="cancel">Quay lại chiến dịch</button>
  </section>

  <form v-else class="campaign-form" novalidate @submit.prevent="onSubmit">
    <header class="campaign-form__header">
      <h1>{{ isEdit ? 'Sửa chiến dịch' : 'Tạo chiến dịch' }}</h1>
      <p v-if="!isEdit">Chiến dịch mới được lưu dưới dạng <strong>bản nháp</strong>. Bấm “Mở tiếp nhận” ở trang chi tiết thì app iOS mới thấy.</p>
      <p v-else-if="lockCategoryAndUnit">Chiến dịch đã công khai: danh mục và đơn vị bị khoá để không làm sai tiến độ đã ghi nhận.</p>
    </header>

    <div class="campaign-form__card">
      <label class="campaign-field">
        <span>Tên chiến dịch <em>*</em></span>
        <input v-model="form.title" type="text" maxlength="120" placeholder="Ví dụ: Áo ấm cho học sinh vùng cao" :aria-invalid="Boolean(errors.title)" />
        <small v-if="errors.title" class="campaign-field__error" role="alert">{{ errors.title }}</small>
      </label>

      <label class="campaign-field">
        <span>Đơn vị thụ hưởng / phát động <em>*</em></span>
        <input v-model="form.organizer" type="text" maxlength="120" placeholder="Ví dụ: Trường TH Hòa Bắc" :aria-invalid="Boolean(errors.organizer)" />
        <small v-if="errors.organizer" class="campaign-field__error" role="alert">{{ errors.organizer }}</small>
        <small v-else>Hiện trên app để người cho đồ biết đồ sẽ đến tay ai. Không ghi tên hay thông tin riêng của cá nhân.</small>
      </label>

      <label class="campaign-field">
        <span>Mô tả ngắn</span>
        <input v-model="form.summary" type="text" maxlength="200" placeholder="Một câu tóm tắt nhu cầu" :aria-invalid="Boolean(errors.summary)" />
        <small v-if="errors.summary" class="campaign-field__error" role="alert">{{ errors.summary }}</small>
      </label>

      <label class="campaign-field">
        <span>Câu chuyện chiến dịch</span>
        <textarea v-model="form.description" rows="4" maxlength="2000" placeholder="Vì sao cần, ai nhận, nhận để làm gì" :aria-invalid="Boolean(errors.description)" />
        <small v-if="errors.description" class="campaign-field__error" role="alert">{{ errors.description }}</small>
      </label>

      <div class="campaign-form__grid">
        <label class="campaign-field">
          <span>Danh mục <em>*</em></span>
          <select v-model="form.category" :disabled="lockCategoryAndUnit">
            <option v-for="category in CAMPAIGN_CATEGORIES" :key="category.id" :value="category.id">{{ category.label }}</option>
          </select>
          <small>Donor gửi đồ cho chiến dịch sẽ bị khoá đúng danh mục này.</small>
        </label>
        <label class="campaign-field">
          <span>Đơn vị mục tiêu <em>*</em></span>
          <select v-model="form.unitId" :disabled="lockCategoryAndUnit">
            <option v-for="unit in CAMPAIGN_UNITS" :key="unit" :value="unit">{{ UNIT_LABEL[unit] }}</option>
          </select>
          <small>Hàng nhập kho khác đơn vị vẫn tính lượt quyên góp nhưng không cộng vào thanh tiến độ.</small>
        </label>
        <label class="campaign-field">
          <span>Mục tiêu <em>*</em></span>
          <input v-model="form.targetQuantity" type="number" min="0" :step="form.unitId === 'kg' ? '0.001' : '1'" inputmode="decimal" :aria-invalid="Boolean(errors.targetQuantity)" />
          <small v-if="errors.targetQuantity" class="campaign-field__error" role="alert">{{ errors.targetQuantity }}</small>
        </label>
        <label class="campaign-field">
          <span>Ngày kết thúc <em>*</em></span>
          <input v-model="form.endDate" type="date" :min="minDate" :aria-invalid="Boolean(errors.endDate)" />
          <small v-if="errors.endDate" class="campaign-field__error" role="alert">{{ errors.endDate }}</small>
          <small v-else>Nhận đơn đến hết ngày này (giờ Việt Nam).</small>
        </label>
      </div>

      <label class="campaign-check">
        <input v-model="form.urgent" type="checkbox" />
        <span>Đánh dấu <strong>khẩn cấp</strong> (hiện nổi bật ở trang chủ app)</span>
      </label>

      <fieldset class="campaign-field campaign-field--hubs">
        <legend>Điểm tiếp nhận <em>*</em></legend>
        <p v-if="!hubs.length" class="campaign-field__error">Chưa có điểm tiếp nhận nào đang hoạt động. Chạy script nạp Hub trước (backend/scripts/seed-hubs.cjs).</p>
        <label v-for="hub in hubs" :key="hub.id">
          <input v-model="form.hubIds" type="checkbox" :value="hub.id" :disabled="hub.inactive && !form.hubIds.includes(hub.id)" />
          {{ hub.name }}
          <small v-if="hub.isDemo">(minh hoạ, chưa tiếp nhận đồ thật)</small>
          <small v-if="hub.inactive" class="campaign-field__error">(đã ngừng hoạt động)</small>
        </label>
        <small v-if="errors.hubIds" class="campaign-field__error" role="alert">{{ errors.hubIds }}</small>
      </fieldset>

      <label class="campaign-field">
        <span>Hướng dẫn tiếp nhận <small>(mỗi dòng một ý, tối đa 8 dòng)</small></span>
        <textarea v-model="form.guidelinesText" rows="4" placeholder="Đồ đã giặt sạch&#10;Không nhận đồ rách" :aria-invalid="Boolean(errors.guidelinesText)" />
        <small v-if="errors.guidelinesText" class="campaign-field__error" role="alert">{{ errors.guidelinesText }}</small>
      </label>

      <p v-if="submitError" class="campaign-form__error" role="alert">{{ submitError }}</p>

      <div class="campaign-form__actions">
        <button type="button" class="auth-btn auth-btn--soft" @click="cancel">Hủy</button>
        <button type="submit" class="auth-btn auth-btn--primary" :disabled="isSaving || !hubs.length">
          <AuthIcon :name="isSaving ? 'loader' : 'check'" :size="18" :class="{ 'auth-spin': isSaving }" />
          {{ isSaving ? 'Đang lưu…' : (isEdit ? 'Lưu thay đổi' : 'Tạo bản nháp') }}
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.campaign-form { width: min(820px, 100%); margin: 0 auto; padding: 24px 8px 52px; }
.campaign-form__header { margin-bottom: 18px; }
.campaign-form__header h1 { font-size: clamp(26px, 3vw, 34px); font-weight: 700; color: #182a31; }
.campaign-form__header p { margin-top: 6px; color: #617081; }
.campaign-form__card { display: grid; gap: 18px; padding: 24px; background: #fff; border: 1px solid #e7edf5; border-radius: 18px; box-shadow: 0 12px 32px rgba(27, 52, 88, 0.04); }
.campaign-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.campaign-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.campaign-field > span, .campaign-field legend { font-weight: 600; color: #264455; }
.campaign-field em { color: #c62828; font-style: normal; }
.campaign-field small { color: #617081; font-size: 12px; }
.campaign-field input, .campaign-field select, .campaign-field textarea { width: 100%; border: 1px solid #dfe6f1; border-radius: 12px; background: #fff; padding: 11px 13px; font-size: 15px; color: #1a2730; }
.campaign-field select:disabled { background: #f3f5f8; color: #708090; }
.campaign-field textarea { resize: vertical; }
.campaign-field--hubs { margin: 0; padding: 12px 14px; border: 1px solid #dfe6f1; border-radius: 12px; display: grid; gap: 8px; }
.campaign-field--hubs label { display: flex; align-items: center; gap: 8px; color: #1a2730; }
.campaign-field--hubs input { width: auto; }
.campaign-check { display: flex; align-items: center; gap: 10px; color: #264455; }
.campaign-check input { width: auto; }
.campaign-field__error, .campaign-field small.campaign-field__error { color: #c62828; }
.campaign-form__error { color: #c62828; }
.campaign-form__actions { display: flex; justify-content: flex-end; gap: 12px; }
.campaign-state { width: min(720px, 100%); min-height: 260px; margin: 24px auto; display: grid; place-items: center; align-content: center; gap: 12px; padding: 28px; text-align: center; background: #fff; border: 1px solid #e7edf5; border-radius: 20px; }
@media (max-width: 760px) {
  .campaign-form__grid { grid-template-columns: 1fr; }
}
</style>
