<script setup>
import { computed, ref, watch } from 'vue'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE, USER_ROLE } from '../auth/auth.constants'
import { staffAssignment } from '../auth/auth.store'
import InlineConfirm from '../shared/InlineConfirm.vue'
import { hubRepository } from './hub.repository'
import { HUB_STATUS, hubErrorMessage, mapsUrl, nextStatusAction, statusChangeCheck, statusLabel } from './hub.model'

// Warehouse Admin xem được danh sách (chỉ đọc); chỉ System Admin thêm, sửa, tạm ẩn, mở lại.
const isStaff = computed(() => staffAssignment.value?.active === true
  && [USER_ROLE.systemAdmin, USER_ROLE.warehouseAdmin].includes(staffAssignment.value.role))
const canManage = computed(() => isStaff.value && staffAssignment.value.role === USER_ROLE.systemAdmin)
const hubs = ref([])
const isLoading = ref(true)
const loadError = ref('')
const pendingId = ref('')
// Ô xác nhận và lỗi hiện ngay trên thẻ của điểm được bấm (không dùng window.confirm, xem InlineConfirm).
const confirming = ref(null)
const cardError = ref({ id: '', message: '' })
let requestId = 0

async function load() {
  const current = ++requestId
  isLoading.value = true
  loadError.value = ''
  try {
    const items = await hubRepository.list()
    if (current === requestId) hubs.value = items
  } catch (error) {
    if (current === requestId) loadError.value = hubErrorMessage(error)
  } finally {
    if (current === requestId) isLoading.value = false
  }
}

function startStatusChange(hub) {
  if (pendingId.value) return
  cardError.value = { id: '', message: '' }
  confirming.value = { id: hub.id, check: statusChangeCheck(hub) }
}

function cancelStatusChange() {
  if (!pendingId.value) confirming.value = null
}

async function confirmStatusChange(hub) {
  const check = confirming.value?.id === hub.id ? confirming.value.check : null
  if (!check || check.blocked || pendingId.value) return
  pendingId.value = hub.id
  try {
    const saved = await hubRepository.changeStatus(hub.id, check.status, hub.version)
    hubs.value = hubs.value.map((item) => (item.id === saved.id ? { ...saved, openCampaigns: item.openCampaigns } : item))
    confirming.value = null
  } catch (error) {
    confirming.value = null
    cardError.value = { id: hub.id, message: hubErrorMessage(error) }
  } finally {
    pendingId.value = ''
  }
}

watch(isStaff, (allowed) => { if (allowed) load() }, { immediate: true })
</script>

<template>
  <section v-if="!isStaff" class="hub-state">
    <AuthIcon name="shield" :size="28" />
    <h2>Tài khoản không có quyền xem điểm tiếp nhận</h2>
    <RouterLink :to="{ name: ADMIN_ROUTE.home }" class="auth-btn auth-btn--soft">Về tổng quan</RouterLink>
  </section>

  <section v-else class="hub-list" aria-labelledby="hub-list-title">
    <header class="hub-list__header">
      <div>
        <h1 id="hub-list-title">Điểm tiếp nhận</h1>
        <p>Điểm đang hoạt động hiện trên app iOS để donor chọn nơi gửi đồ và để gắn vào chiến dịch. Điểm còn nhãn “minh hoạ” là chưa tiếp nhận đồ thật.</p>
        <p v-if="!canManage" class="hub-list__readonly"><AuthIcon name="eye" :size="16" />Bạn đang xem ở chế độ chỉ đọc. Liên hệ Quản trị hệ thống để thêm hoặc sửa điểm.</p>
      </div>
      <RouterLink v-if="canManage" :to="{ name: ADMIN_ROUTE.hubNew }" class="auth-btn auth-btn--primary">
        <AuthIcon name="map-pin" :size="18" />Thêm điểm tiếp nhận
      </RouterLink>
    </header>

    <div v-if="isLoading" class="hub-state hub-state--inline">
      <AuthIcon name="loader" :size="24" class="auth-spin" /><p>Đang tải điểm tiếp nhận… Máy chủ miễn phí có thể mất 30–50 giây để khởi động.</p>
    </div>
    <div v-else-if="loadError" class="hub-state hub-state--inline" role="alert">
      <AuthIcon name="alert-triangle" :size="24" /><p>{{ loadError }}</p>
      <button type="button" class="auth-btn auth-btn--soft" @click="load">Thử lại</button>
    </div>
    <div v-else-if="!hubs.length" class="hub-state hub-state--inline">
      <AuthIcon name="map-pin" :size="24" />
      <p>Chưa có điểm tiếp nhận nào.<template v-if="canManage"> Thêm điểm đầu tiên để donor và chiến dịch có nơi nhận đồ.</template></p>
    </div>

    <ul v-else class="hub-list__items">
      <li v-for="hub in hubs" :key="hub.id" :class="['hub-card', { 'hub-card--inactive': hub.status === 'inactive' }]">
        <div class="hub-card__top">
          <span :class="['hub-badge', `hub-badge--${HUB_STATUS[hub.status]?.tone || 'muted'}`]">{{ statusLabel(hub.status) }}</span>
          <span v-if="hub.isDemo" class="hub-badge hub-badge--demo">Minh hoạ</span>
          <span v-else class="hub-badge hub-badge--real">Đang tiếp nhận thật</span>
        </div>
        <strong class="hub-card__name">{{ hub.name }}</strong>
        <span class="hub-card__line"><AuthIcon name="map-pin" :size="15" />{{ hub.address }}</span>
        <span class="hub-card__line"><AuthIcon name="clock" :size="15" />{{ hub.openHours }}</span>
        <a v-if="mapsUrl(hub.latitude, hub.longitude)" class="hub-card__map" :href="mapsUrl(hub.latitude, hub.longitude)" target="_blank" rel="noopener noreferrer">
          Xem trên Google Maps ({{ hub.latitude }}, {{ hub.longitude }})
        </a>
        <small v-if="hub.openCampaigns?.length" class="hub-card__campaigns">
          Đang dùng bởi chiến dịch: {{ hub.openCampaigns.map((campaign) => campaign.title).join(', ') }}
        </small>
        <p v-if="cardError.id === hub.id" class="hub-card__error" role="alert">{{ cardError.message }}</p>
        <InlineConfirm
          v-if="canManage && confirming?.id === hub.id"
          :message="confirming.check.message"
          :confirm-label="confirming.check.confirmLabel"
          :busy="pendingId === hub.id"
          :tone="confirming.check.blocked ? 'danger' : 'warning'"
          @confirm="confirmStatusChange(hub)"
          @cancel="cancelStatusChange"
        />
        <div v-else-if="canManage" class="hub-card__actions">
          <RouterLink :to="{ name: ADMIN_ROUTE.hubEdit, params: { hubId: hub.id } }" class="auth-btn auth-btn--soft">Sửa</RouterLink>
          <button type="button" class="auth-btn auth-btn--soft" :disabled="Boolean(pendingId)" @click="startStatusChange(hub)">
            {{ nextStatusAction(hub)?.label }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.hub-list { width: min(1080px, 100%); margin: 0 auto; padding: 24px 8px 52px; }
.hub-list__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 18px; }
.hub-list__header h1 { font-size: clamp(26px, 3vw, 34px); font-weight: 700; color: #182a31; }
.hub-list__header p { margin-top: 6px; color: #617081; max-width: 640px; }
.hub-list__readonly { display: flex; align-items: center; gap: 6px; color: #42536a; }
.hub-list__items { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.hub-card { display: grid; gap: 8px; align-content: start; padding: 18px; border: 1px solid #e1e7f1; border-radius: 14px; background: #fff; box-shadow: 0 8px 24px rgba(27, 52, 88, 0.04); }
.hub-card--inactive { background: #f8f9fb; }
.hub-card__top { display: flex; flex-wrap: wrap; gap: 6px; }
.hub-card__name { font-size: 17px; color: #182a31; }
.hub-card__line { display: flex; align-items: flex-start; gap: 6px; color: #42536a; font-size: 14px; }
.hub-card__map { color: #246632; font-size: 13px; }
.hub-card__campaigns { color: #6b5a2e; font-size: 12px; }
.hub-card__actions { display: flex; gap: 8px; margin-top: 4px; }
.hub-card__error { margin: 0; padding: 10px 12px; border-radius: 12px; background: #fdecea; color: #b3261e; font-size: 14px; }
.hub-badge { padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.hub-badge--success { background: #e3f4e7; color: #1f6b33; }
.hub-badge--muted { background: #eef1f6; color: #536174; }
.hub-badge--demo { background: #fff3d6; color: #8a5a00; }
.hub-badge--real { background: #e6f0fb; color: #1d4f91; }
.hub-state { width: min(720px, 100%); min-height: 260px; margin: 0 auto; display: grid; place-items: center; align-content: center; gap: 12px; padding: 28px; text-align: center; background: #fff; border: 1px solid #e7edf5; border-radius: 20px; }
.hub-state--inline { min-height: 180px; width: 100%; }
.hub-state p { color: #617081; }
@media (max-width: 760px) {
  .hub-list__header { flex-direction: column; }
}
</style>
