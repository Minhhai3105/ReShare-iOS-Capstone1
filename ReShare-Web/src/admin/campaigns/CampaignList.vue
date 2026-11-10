<script setup>
import { computed, ref, watch } from 'vue'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE, USER_ROLE } from '../auth/auth.constants'
import { staffAssignment } from '../auth/auth.store'
import { campaignRepository } from './campaign.repository'
import {
  CAMPAIGN_STATUS, campaignErrorMessage, campaignProgress, categoryLabel, formatDate, statusLabel,
} from './campaign.model'

const canManage = computed(() => staffAssignment.value?.active === true && staffAssignment.value.role === USER_ROLE.systemAdmin)
const campaigns = ref([])
const isLoading = ref(true)
const loadError = ref('')
const statusFilter = ref('all')
let requestId = 0

const filtered = computed(() => statusFilter.value === 'all'
  ? campaigns.value
  : campaigns.value.filter((campaign) => campaign.status === statusFilter.value))

async function load() {
  const current = ++requestId
  isLoading.value = true
  loadError.value = ''
  try {
    const items = await campaignRepository.list()
    if (current === requestId) campaigns.value = items
  } catch (error) {
    if (current === requestId) loadError.value = campaignErrorMessage(error)
  } finally {
    if (current === requestId) isLoading.value = false
  }
}

watch(canManage, (allowed) => { if (allowed) load() }, { immediate: true })
</script>

<template>
  <section v-if="!canManage" class="campaign-state">
    <AuthIcon name="shield" :size="28" />
    <h2>Chỉ Quản trị hệ thống quản lý chiến dịch</h2>
    <RouterLink :to="{ name: ADMIN_ROUTE.home }" class="auth-btn auth-btn--soft">Về tổng quan</RouterLink>
  </section>

  <section v-else class="campaign-list" aria-labelledby="campaign-list-title">
    <header class="campaign-list__header">
      <div>
        <h1 id="campaign-list-title">Chiến dịch quyên góp</h1>
        <p>Chiến dịch đang tiếp nhận sẽ hiện trên app iOS. Tiến độ chỉ tăng khi hàng của chiến dịch đã nhập kho.</p>
      </div>
      <RouterLink :to="{ name: ADMIN_ROUTE.campaignNew }" class="auth-btn auth-btn--primary">
        <AuthIcon name="heart-handshake" :size="18" />Tạo chiến dịch
      </RouterLink>
    </header>

    <div class="campaign-list__filters" role="group" aria-label="Lọc theo trạng thái">
      <button v-for="option in [{ id: 'all', label: 'Tất cả' }, ...Object.entries(CAMPAIGN_STATUS).map(([id, status]) => ({ id, label: status.label }))]"
        :key="option.id" type="button" :class="{ 'is-active': statusFilter === option.id }" @click="statusFilter = option.id">
        {{ option.label }}
      </button>
    </div>

    <div v-if="isLoading" class="campaign-state campaign-state--inline">
      <AuthIcon name="loader" :size="24" class="auth-spin" /><p>Đang tải chiến dịch… Máy chủ miễn phí có thể mất 30–50 giây để khởi động.</p>
    </div>
    <div v-else-if="loadError" class="campaign-state campaign-state--inline" role="alert">
      <AuthIcon name="alert-triangle" :size="24" /><p>{{ loadError }}</p>
      <button type="button" class="auth-btn auth-btn--soft" @click="load">Thử lại</button>
    </div>
    <div v-else-if="!filtered.length" class="campaign-state campaign-state--inline">
      <AuthIcon name="inbox" :size="24" />
      <p>{{ campaigns.length ? 'Không có chiến dịch ở trạng thái này.' : 'Chưa có chiến dịch nào. Tạo chiến dịch đầu tiên để app iOS có dữ liệu thật.' }}</p>
    </div>

    <ul v-else class="campaign-list__items">
      <li v-for="campaign in filtered" :key="campaign.id">
        <RouterLink :to="{ name: ADMIN_ROUTE.campaignDetail, params: { campaignId: campaign.id } }" class="campaign-card">
          <div class="campaign-card__top">
            <span :class="['campaign-badge', `campaign-badge--${CAMPAIGN_STATUS[campaign.status]?.tone || 'muted'}`]">{{ statusLabel(campaign.status) }}</span>
            <span v-if="campaign.urgent" class="campaign-badge campaign-badge--urgent">Khẩn cấp</span>
            <span class="campaign-card__category">{{ categoryLabel(campaign.category) }}</span>
          </div>
          <strong class="campaign-card__title">{{ campaign.title }}</strong>
          <span class="campaign-card__organizer">{{ campaign.organizer }}</span>
          <div class="campaign-progress" :aria-label="`Tiến độ ${campaignProgress(campaign).percent}%`">
            <div class="campaign-progress__bar"><span :style="{ width: `${campaignProgress(campaign).percent}%` }" /></div>
            <small>{{ campaignProgress(campaign).text }} · {{ campaignProgress(campaign).donations }} lượt đã nhập kho</small>
          </div>
          <small class="campaign-card__meta">Kết thúc {{ formatDate(campaign.endDate) }} · {{ campaign.hubs.length }} điểm tiếp nhận</small>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.campaign-list { width: min(1080px, 100%); margin: 0 auto; padding: 24px 8px 52px; }
.campaign-list__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 18px; }
.campaign-list__header h1 { font-size: clamp(26px, 3vw, 34px); font-weight: 700; color: #182a31; }
.campaign-list__header p { margin-top: 6px; color: #617081; max-width: 640px; }
.campaign-list__filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.campaign-list__filters button { border: 1px solid #dfe6f1; background: #fff; border-radius: 999px; padding: 7px 14px; font-size: 13px; color: #264455; cursor: pointer; }
.campaign-list__filters button.is-active { background: #246632; border-color: #246632; color: #fff; }
.campaign-list__items { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.campaign-card { display: grid; gap: 8px; padding: 18px; border: 1px solid #e1e7f1; border-radius: 14px; background: #fff; color: inherit; text-decoration: none; box-shadow: 0 8px 24px rgba(27, 52, 88, 0.04); height: 100%; }
.campaign-card:hover { border-color: #9cc3a5; }
.campaign-card__top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.campaign-card__category { margin-left: auto; color: #617081; font-size: 12px; }
.campaign-card__title { font-size: 17px; color: #182a31; }
.campaign-card__organizer, .campaign-card__meta { color: #617081; font-size: 13px; }
.campaign-badge { padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.campaign-badge--success { background: #e3f4e7; color: #1f6b33; }
.campaign-badge--muted { background: #eef1f6; color: #536174; }
.campaign-badge--neutral { background: #f1ede4; color: #6b5a2e; }
.campaign-badge--urgent { background: #fde8e6; color: #b3261e; }
.campaign-progress { display: grid; gap: 6px; }
.campaign-progress__bar { height: 8px; border-radius: 999px; background: #e9eef3; overflow: hidden; }
.campaign-progress__bar span { display: block; height: 100%; background: #2f8a46; border-radius: inherit; }
.campaign-progress small { color: #42536a; font-size: 12px; }
.campaign-state { width: min(720px, 100%); min-height: 260px; margin: 0 auto; display: grid; place-items: center; align-content: center; gap: 12px; padding: 28px; text-align: center; background: #fff; border: 1px solid #e7edf5; border-radius: 20px; }
.campaign-state--inline { min-height: 180px; width: 100%; }
.campaign-state p { color: #617081; }
@media (max-width: 760px) {
  .campaign-list__header { flex-direction: column; }
}
</style>
