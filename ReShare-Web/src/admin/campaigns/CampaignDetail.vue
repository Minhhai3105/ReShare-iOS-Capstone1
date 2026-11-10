<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE, USER_ROLE } from '../auth/auth.constants'
import { staffAssignment } from '../auth/auth.store'
import { DONATION_STATUS_LABEL } from '../donations/donation.constants.js'
import { unitLabel } from '../shared/units.js'
import { campaignRepository } from './campaign.repository'
import {
  CAMPAIGN_STATUS, campaignErrorMessage, campaignProgress, categoryLabel, formatDate, formatNumber,
  nextStatusActions, statusLabel,
} from './campaign.model'

const route = useRoute()
const campaignId = computed(() => route.params.campaignId)
const canManage = computed(() => staffAssignment.value?.active === true && staffAssignment.value.role === USER_ROLE.systemAdmin)

const campaign = ref(null)
const donations = ref([])
const donationsTruncated = ref(false)
const isLoading = ref(true)
const loadError = ref('')
const actionError = ref('')
const pendingAction = ref('')
let requestId = 0

const progress = computed(() => campaignProgress(campaign.value))
const actions = computed(() => nextStatusActions(campaign.value))

async function load() {
  const current = ++requestId
  isLoading.value = true
  loadError.value = ''
  try {
    const detail = await campaignRepository.get(campaignId.value)
    if (current !== requestId) return
    campaign.value = detail.campaign
    donations.value = detail.donations
    donationsTruncated.value = detail.donationsTruncated
  } catch (error) {
    if (current === requestId) loadError.value = error?.status === 404 ? 'Không tìm thấy chiến dịch.' : campaignErrorMessage(error)
  } finally {
    if (current === requestId) isLoading.value = false
  }
}

watch([campaignId, canManage], ([, allowed]) => { if (allowed) load() }, { immediate: true })

const CONFIRM = Object.freeze({
  active: 'Mở tiếp nhận? Chiến dịch sẽ hiện trên app iOS và donor gửi đồ được ngay.',
  closed: 'Đóng chiến dịch? App sẽ không nhận đơn mới cho chiến dịch này. Hàng đã gửi vẫn được nhập kho và cộng tiến độ.',
})

async function changeStatus(status) {
  if (pendingAction.value || !window.confirm(CONFIRM[status])) return
  actionError.value = ''
  pendingAction.value = status
  try {
    campaign.value = await campaignRepository.changeStatus(campaign.value.id, status, campaign.value.version)
  } catch (error) {
    actionError.value = campaignErrorMessage(error)
  } finally {
    pendingAction.value = ''
  }
}
</script>

<template>
  <section v-if="!canManage" class="campaign-state">
    <AuthIcon name="shield" :size="28" /><h2>Chỉ Quản trị hệ thống quản lý chiến dịch</h2>
  </section>

  <section v-else-if="isLoading" class="campaign-state">
    <AuthIcon name="loader" :size="28" class="auth-spin" /><h2>Đang tải chiến dịch</h2>
  </section>

  <section v-else-if="loadError" class="campaign-state" role="alert">
    <AuthIcon name="alert-triangle" :size="28" /><h2>{{ loadError }}</h2>
    <button type="button" class="auth-btn auth-btn--soft" @click="load">Thử lại</button>
  </section>

  <section v-else class="campaign-detail" aria-labelledby="campaign-detail-title">
    <header class="campaign-detail__header">
      <div>
        <div class="campaign-detail__badges">
          <span :class="['campaign-badge', `campaign-badge--${CAMPAIGN_STATUS[campaign.status]?.tone || 'muted'}`]">{{ statusLabel(campaign.status) }}</span>
          <span v-if="campaign.urgent" class="campaign-badge campaign-badge--urgent">Khẩn cấp</span>
          <span class="campaign-detail__category">{{ categoryLabel(campaign.category) }}</span>
        </div>
        <h1 id="campaign-detail-title">{{ campaign.title }}</h1>
        <p>{{ campaign.organizer }}</p>
      </div>
      <div class="campaign-detail__actions">
        <RouterLink v-if="campaign.status !== 'closed'" :to="{ name: ADMIN_ROUTE.campaignEdit, params: { campaignId: campaign.id } }" class="auth-btn auth-btn--soft">
          <AuthIcon name="file-text" :size="18" />Sửa
        </RouterLink>
        <button v-for="action in actions" :key="action.status" type="button"
          :class="['auth-btn', action.status === 'closed' ? 'auth-btn--soft' : 'auth-btn--primary']"
          :disabled="Boolean(pendingAction)" @click="changeStatus(action.status)">
          <AuthIcon :name="pendingAction === action.status ? 'loader' : (action.status === 'closed' ? 'archive' : 'check-circle')" :size="18" :class="{ 'auth-spin': pendingAction === action.status }" />
          {{ action.label }}
        </button>
      </div>
    </header>

    <p v-if="actionError" class="campaign-detail__error" role="alert">{{ actionError }}</p>
    <p v-if="campaign.status === 'draft'" class="campaign-detail__note"><AuthIcon name="info" :size="16" /> Bản nháp chưa hiện trên app. Kiểm tra nội dung rồi bấm “Mở tiếp nhận”.</p>

    <div class="campaign-detail__layout">
      <article class="campaign-panel">
        <h2>Tiến độ (tính theo hàng đã nhập kho)</h2>
        <div class="campaign-progress">
          <div class="campaign-progress__bar"><span :style="{ width: `${progress.percent}%` }" /></div>
          <strong>{{ progress.percent }}% · {{ progress.text }}</strong>
          <small>{{ progress.donations }} lượt quyên góp đã nhập kho. Số donor khai báo không được cộng vào đây.</small>
        </div>
        <dl class="campaign-facts">
          <div><dt>Ngày kết thúc</dt><dd>{{ formatDate(campaign.endDate) }}</dd></div>
          <div><dt>Mở tiếp nhận lúc</dt><dd>{{ formatDate(campaign.publishedAt) }}</dd></div>
          <div><dt>Điểm tiếp nhận</dt><dd>{{ campaign.hubs.map((hub) => hub.name).join(', ') || '—' }}</dd></div>
          <div><dt>Phiên bản</dt><dd>v{{ campaign.version }}</dd></div>
        </dl>
      </article>

      <article class="campaign-panel">
        <h2>Nội dung hiển thị trên app</h2>
        <p v-if="campaign.summary"><strong>{{ campaign.summary }}</strong></p>
        <p class="campaign-panel__story">{{ campaign.description || 'Chưa có câu chuyện chiến dịch.' }}</p>
        <h3>Hướng dẫn tiếp nhận</h3>
        <ul v-if="campaign.guidelines.length"><li v-for="line in campaign.guidelines" :key="line">{{ line }}</li></ul>
        <p v-else class="campaign-panel__muted">Chưa có hướng dẫn.</p>
      </article>
    </div>

    <article class="campaign-panel">
      <h2>Đơn quyên góp thuộc chiến dịch ({{ donations.length }}{{ donationsTruncated ? '+' : '' }})</h2>
      <p v-if="donationsTruncated" class="campaign-panel__muted">Chỉ hiện 200 đơn đầu tiên.</p>
      <p v-if="!donations.length" class="campaign-panel__muted">Chưa có đơn nào gửi cho chiến dịch này.</p>
      <table v-else class="campaign-table">
        <thead><tr><th>Vật phẩm</th><th>Trạng thái</th><th>Khai báo</th><th>Ngày gửi</th></tr></thead>
        <tbody>
          <tr v-for="donation in donations" :key="donation.id">
            <td><RouterLink :to="{ name: 'admin-donation-detail', params: { donationId: donation.id } }">{{ donation.title || donation.id }}</RouterLink></td>
            <td>{{ DONATION_STATUS_LABEL[donation.status] || donation.status }}</td>
            <td>{{ donation.quantity == null ? '—' : `${formatNumber(donation.quantity)} ${unitLabel(donation.unitId)}` }}</td>
            <td>{{ formatDate(donation.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </article>
  </section>
</template>

<style scoped>
.campaign-detail { width: min(1080px, 100%); margin: 0 auto; padding: 24px 8px 52px; display: grid; gap: 16px; }
.campaign-detail__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; }
.campaign-detail__header h1 { margin-top: 8px; font-size: clamp(24px, 3vw, 32px); font-weight: 700; color: #182a31; }
.campaign-detail__header p { margin-top: 4px; color: #617081; }
.campaign-detail__badges { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.campaign-detail__category { color: #617081; font-size: 13px; }
.campaign-detail__actions { display: flex; flex-wrap: wrap; gap: 10px; }
.campaign-detail__error { color: #c62828; }
.campaign-detail__note { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; background: #fff7e6; color: #7a5200; font-size: 13px; }
.campaign-detail__layout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.campaign-panel { display: grid; gap: 10px; align-content: start; padding: 20px; background: #fff; border: 1px solid #e1e7f1; border-radius: 14px; box-shadow: 0 8px 24px rgba(27, 52, 88, 0.04); min-width: 0; }
.campaign-panel h2 { font-size: 16px; color: #26384b; }
.campaign-panel h3 { font-size: 14px; color: #26384b; margin-top: 6px; }
.campaign-panel ul { margin: 0; padding-left: 18px; color: #42536a; }
.campaign-panel__story { white-space: pre-line; color: #42536a; }
.campaign-panel__muted { color: #708090; font-size: 13px; }
.campaign-badge { padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.campaign-badge--success { background: #e3f4e7; color: #1f6b33; }
.campaign-badge--muted { background: #eef1f6; color: #536174; }
.campaign-badge--neutral { background: #f1ede4; color: #6b5a2e; }
.campaign-badge--urgent { background: #fde8e6; color: #b3261e; }
.campaign-progress { display: grid; gap: 6px; }
.campaign-progress__bar { height: 10px; border-radius: 999px; background: #e9eef3; overflow: hidden; }
.campaign-progress__bar span { display: block; height: 100%; background: #2f8a46; border-radius: inherit; }
.campaign-progress small { color: #617081; font-size: 12px; }
.campaign-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; }
.campaign-facts div { padding: 10px; border-radius: 10px; background: #f4f6fb; }
.campaign-facts dt { color: #617081; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.campaign-facts dd { margin: 4px 0 0; color: #1a2d3a; overflow-wrap: anywhere; }
.campaign-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.campaign-table th, .campaign-table td { text-align: left; padding: 9px 8px; border-bottom: 1px solid #edf1f6; }
.campaign-table th { color: #617081; font-size: 12px; font-weight: 700; }
.campaign-table a { color: #246632; }
.campaign-state { width: min(720px, 100%); min-height: 260px; margin: 24px auto; display: grid; place-items: center; align-content: center; gap: 12px; padding: 28px; text-align: center; background: #fff; border: 1px solid #e7edf5; border-radius: 20px; }
@media (max-width: 760px) {
  .campaign-detail__header { flex-direction: column; }
  .campaign-detail__layout, .campaign-facts { grid-template-columns: 1fr; }
  .campaign-table { display: block; overflow-x: auto; }
}
</style>
