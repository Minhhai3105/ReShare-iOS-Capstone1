<script setup>
import { computed, ref, watch } from 'vue'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE, USER_ROLE } from '../auth/auth.constants'
import { staffAssignment } from '../auth/auth.store'
import InlineConfirm from '../shared/InlineConfirm.vue'
import { REPORT_REASON_LABEL, RESOLUTION_LABEL, formatDateTime } from '../moderation/moderation.model'
import { p2pRepository } from './p2p.repository'
import {
  HISTORY_ACTION_LABEL, LISTING_STATUS, STATUS_TABS, aiBadge, countByTab, filterListings, moderationNote, p2pErrorMessage,
  removeCheck, restoreCheck, scopeLabel, statusLabel,
} from './p2p.model'

// System Admin xem mọi bài; Warehouse Admin chỉ thấy bài ở các quận kho mình phụ trách (backend lọc).
// Cả hai gỡ / khôi phục được trong phạm vi của mình. Khoá tài khoản vẫn ở trang Báo cáo vi phạm.
const isStaff = computed(() => staffAssignment.value?.active === true
  && [USER_ROLE.systemAdmin, USER_ROLE.warehouseAdmin].includes(staffAssignment.value.role))
const listings = ref([])
const scope = ref(null)
const truncated = ref(false)
const isLoading = ref(true)
const loadError = ref('')
const tab = ref('all')
const query = ref('')
const expandedId = ref('')
const details = ref({})
const detailError = ref({})
const pendingId = ref('')
const aiEnabled = ref(false)
const aiPendingId = ref('')
const aiErrors = ref({})
// Ô xác nhận và lỗi hiện ngay trên thẻ của bài được bấm (không dùng window.confirm, xem InlineConfirm).
const confirming = ref(null)
const removeReason = ref('')
const cardError = ref({ id: '', message: '' })
let requestId = 0

const counts = computed(() => countByTab(listings.value))
const visible = computed(() => filterListings(listings.value, { tab: tab.value, query: query.value }))
const noDistricts = computed(() => scope.value && !scope.value.all && !scope.value.districts.length)

async function load() {
  const current = ++requestId
  isLoading.value = true
  loadError.value = ''
  try {
    const result = await p2pRepository.list()
    if (current !== requestId) return
    listings.value = result.listings
    scope.value = result.scope
    aiEnabled.value = result.aiEnabled
    truncated.value = result.truncated
    details.value = {}
  } catch (error) {
    if (current === requestId) loadError.value = p2pErrorMessage(error)
  } finally {
    if (current === requestId) isLoading.value = false
  }
}

async function loadDetail(id) {
  detailError.value = { ...detailError.value, [id]: '' }
  try {
    const detail = await p2pRepository.detail(id)
    details.value = { ...details.value, [id]: detail }
    aiEnabled.value = detail.aiEnabled
    // Thông tin tóm tắt mới nhất (trạng thái, báo cáo, khả năng khôi phục) thay vào danh sách.
    listings.value = listings.value.map((item) => (item.id === id ? { ...item, ...detail.listing } : item))
  } catch (error) {
    detailError.value = { ...detailError.value, [id]: p2pErrorMessage(error) }
  }
}

function toggleDetail(listing) {
  if (expandedId.value === listing.id) {
    expandedId.value = ''
    return
  }
  expandedId.value = listing.id
  if (!details.value[listing.id]) loadDetail(listing.id)
}

function startRemove(listing) {
  const check = removeCheck(listing)
  if (!check || pendingId.value || aiPendingId.value) return
  cardError.value = { id: '', message: '' }
  removeReason.value = ''
  confirming.value = { id: listing.id, kind: 'remove', check }
}

function startRestore(listing) {
  const check = restoreCheck(listing)
  if (!check || pendingId.value || aiPendingId.value) return
  cardError.value = { id: '', message: '' }
  confirming.value = { id: listing.id, kind: 'restore', check }
}

function cancelConfirm() {
  if (!pendingId.value) confirming.value = null
}

async function onConfirm(listing) {
  const action = confirming.value
  if (action?.id !== listing.id || action.check.blocked || pendingId.value || aiPendingId.value) return
  pendingId.value = listing.id
  try {
    if (action.kind === 'remove') await p2pRepository.remove(listing.id, listing.status, removeReason.value)
    else await p2pRepository.restore(listing.id)
    confirming.value = null
    await loadDetail(listing.id)
  } catch (error) {
    confirming.value = null
    cardError.value = { id: listing.id, message: p2pErrorMessage(error) }
  } finally {
    pendingId.value = ''
  }
}

async function checkAi(listing) {
  if (!isStaff.value || !aiEnabled.value || aiPendingId.value || pendingId.value || confirming.value) return
  aiPendingId.value = listing.id
  aiErrors.value = { ...aiErrors.value, [listing.id]: '' }
  try {
    const result = await p2pRepository.aiCheck(listing.id)
    aiEnabled.value = result.aiEnabled === true
    if (!result.enabled) {
      aiErrors.value = { ...aiErrors.value, [listing.id]: 'AI kiểm duyệt chưa được cấu hình.' }
      return
    }
    listings.value = listings.value.map((item) => item.id === listing.id ? { ...item, aiModeration: result.aiModeration } : item)
    const detail = details.value[listing.id]
    if (detail) details.value = { ...details.value, [listing.id]: { ...detail, listing: { ...detail.listing, aiModeration: result.aiModeration } } }
  } catch (error) {
    aiErrors.value = { ...aiErrors.value, [listing.id]: p2pErrorMessage(error) }
  } finally {
    aiPendingId.value = ''
  }
}

watch(isStaff, (allowed) => { if (allowed) load() }, { immediate: true })
</script>

<template>
  <section v-if="!isStaff" class="p2p-state">
    <AuthIcon name="shield" :size="28" />
    <h2>Tài khoản không có quyền xem Kho đồ 0đ</h2>
    <RouterLink :to="{ name: ADMIN_ROUTE.home }" class="auth-btn auth-btn--soft">Về tổng quan</RouterLink>
  </section>

  <section v-else class="p2p-page" aria-labelledby="p2p-title">
    <header class="p2p-header">
      <div>
        <h1 id="p2p-title">Kho đồ 0đ</h1>
        <p>Bài người dùng app đăng để tặng đồ trực tiếp cho nhau. Gỡ bài vi phạm ngay tại đây, không cần chờ báo cáo; khoá tài khoản làm ở trang Báo cáo vi phạm.</p>
        <p v-if="scopeLabel(scope)" class="p2p-scope"><AuthIcon name="map-pin" :size="16" />{{ scopeLabel(scope) }}</p>
      </div>
      <button type="button" class="auth-btn auth-btn--soft" :disabled="isLoading || Boolean(pendingId) || Boolean(aiPendingId)" @click="load">
        <AuthIcon name="refresh" :size="18" />Tải lại
      </button>
    </header>

    <div v-if="isLoading" class="p2p-state p2p-state--inline">
      <AuthIcon name="loader" :size="24" class="auth-spin" /><p>Đang tải bài đăng… Máy chủ miễn phí có thể mất 30–50 giây để khởi động.</p>
    </div>
    <div v-else-if="loadError" class="p2p-state p2p-state--inline" role="alert">
      <AuthIcon name="alert-triangle" :size="24" /><p>{{ loadError }}</p>
      <button type="button" class="auth-btn auth-btn--soft" @click="load">Thử lại</button>
    </div>
    <div v-else-if="noDistricts" class="p2p-state p2p-state--inline">
      <AuthIcon name="map-pin" :size="24" />
      <p>Kho của bạn chưa được gán quận phụ trách nên chưa có bài nào để hiển thị. Liên hệ Quản trị hệ thống để được gán quận.</p>
    </div>

    <template v-else>
      <p v-if="!aiEnabled" class="p2p-muted" role="status">AI kiểm duyệt chưa được cấu hình</p>
      <p v-else class="p2p-muted">AI chỉ gợi ý từ tiêu đề, ghi chú và tối đa 3 ảnh; nhân sự quyết định gỡ bài. Kết quả không bảo đảm phát hiện mọi vi phạm.</p>
      <div class="p2p-toolbar">
        <div class="p2p-tabs" role="tablist" aria-label="Lọc theo trạng thái">
          <button v-for="item in STATUS_TABS" :key="item.id" type="button" role="tab" :aria-selected="tab === item.id"
            :class="{ 'is-active': tab === item.id }" @click="tab = item.id">
            {{ item.label }} <span class="p2p-tabs__count">{{ counts[item.id] }}</span>
          </button>
        </div>
        <label class="p2p-search">
          <AuthIcon name="search" :size="16" />
          <span class="p2p-sr">Tìm bài</span>
          <input v-model="query" type="search" placeholder="Tìm theo tên món, người đăng, quận…" />
        </label>
      </div>

      <div v-if="!visible.length" class="p2p-state p2p-state--inline">
        <AuthIcon name="check-circle" :size="24" />
        <p>{{ listings.length ? 'Không có bài nào khớp bộ lọc.' : 'Chưa có bài đăng nào trong phạm vi của bạn.' }}</p>
      </div>

      <ul v-else class="p2p-list">
        <li v-for="listing in visible" :key="listing.id" :class="['p2p-card', { 'p2p-card--removed': listing.status === 'removed' }]">
          <div class="p2p-card__main">
            <img v-if="listing.imageUrl" :src="listing.imageUrl" :alt="`Ảnh món ${listing.title}`" class="p2p-card__thumb" loading="lazy" referrerpolicy="no-referrer" />
            <div v-else class="p2p-card__thumb p2p-card__thumb--empty"><AuthIcon name="archive" :size="22" /></div>
            <div class="p2p-card__body">
              <div class="p2p-card__badges">
                <span :class="['p2p-badge', `p2p-badge--${(LISTING_STATUS[listing.status] || LISTING_STATUS.unknown).tone}`]">{{ statusLabel(listing.status) }}</span>
                <span :class="['p2p-badge', `p2p-badge--${aiBadge(listing.aiModeration).tone}`]">{{ aiBadge(listing.aiModeration).label }}</span>
                <span v-if="listing.district" class="p2p-badge p2p-badge--muted">{{ listing.district }}</span>
                <span v-if="listing.reports.open" class="p2p-badge p2p-badge--danger">{{ listing.reports.open }} báo cáo chờ xử lý</span>
                <span v-else-if="listing.reports.total" class="p2p-badge p2p-badge--muted">{{ listing.reports.total }} báo cáo đã xử lý</span>
              </div>
              <strong class="p2p-card__title">{{ listing.title || '(Không có tên)' }}</strong>
              <span class="p2p-card__meta">
                {{ [listing.category, listing.condition].filter(Boolean).join(' · ') }}
                <template v-if="listing.category || listing.condition"> · </template>
                Đăng bởi {{ listing.donor.name || listing.donor.id }}<template v-if="listing.donor.suspended"> (đã khoá)</template>
                · {{ formatDateTime(listing.createdAt) }}
              </span>
              <span v-if="moderationNote(listing.moderation)" class="p2p-card__moderation">{{ moderationNote(listing.moderation) }}</span>
            </div>
          </div>

          <p v-if="cardError.id === listing.id" class="p2p-card__error" role="alert">{{ cardError.message }}</p>

          <template v-if="confirming?.id === listing.id">
            <label v-if="confirming.kind === 'remove'" class="p2p-card__field">
              <span>Lý do gỡ (tuỳ chọn, người khác xem lại được trong lịch sử)</span>
              <input v-model="removeReason" type="text" maxlength="300" placeholder="Ví dụ: rao bán, ảnh không phù hợp" :disabled="pendingId === listing.id" />
            </label>
            <InlineConfirm
              :message="confirming.check.message"
              :confirm-label="confirming.check.confirmLabel"
              :busy="pendingId === listing.id"
              :tone="confirming.check.tone"
              @confirm="onConfirm(listing)"
              @cancel="cancelConfirm"
            />
          </template>
          <div v-else class="p2p-card__actions">
            <button type="button" class="auth-btn auth-btn--soft" :aria-expanded="expandedId === listing.id" @click="toggleDetail(listing)">
              {{ expandedId === listing.id ? 'Ẩn chi tiết' : 'Xem chi tiết' }}
            </button>
            <button v-if="removeCheck(listing)" type="button" class="auth-btn auth-btn--soft p2p-danger" :disabled="Boolean(pendingId) || Boolean(aiPendingId)" @click="startRemove(listing)">
              Gỡ bài
            </button>
            <button v-if="listing.status === 'removed'" type="button" class="auth-btn auth-btn--soft" :disabled="Boolean(pendingId) || Boolean(aiPendingId)" @click="startRestore(listing)">
              Khôi phục
            </button>
          </div>

          <div v-if="expandedId === listing.id" class="p2p-detail">
            <p v-if="detailError[listing.id]" class="p2p-card__error" role="alert">
              {{ detailError[listing.id] }}
              <button type="button" class="auth-btn auth-btn--soft" @click="loadDetail(listing.id)">Thử lại</button>
            </p>
            <p v-else-if="!details[listing.id]" class="p2p-muted"><AuthIcon name="loader" :size="16" class="auth-spin" /> Đang tải chi tiết…</p>
            <template v-else>
              <div v-if="details[listing.id].listing.images.length" class="p2p-detail__images">
                <a v-for="(url, index) in details[listing.id].listing.images" :key="url" :href="url" target="_blank" rel="noopener noreferrer">
                  <img :src="url" :alt="`Ảnh ${index + 1} của món ${listing.title}`" loading="lazy" referrerpolicy="no-referrer" />
                </a>
              </div>
              <p class="p2p-detail__note"><strong>Ghi chú của người đăng:</strong> {{ details[listing.id].listing.donorNote || '—' }}</p>

              <div class="p2p-detail__ai" :aria-busy="aiPendingId === listing.id">
                <p v-if="listing.aiModeration?.reason" :role="listing.aiModeration.status === 'error' ? 'alert' : undefined">
                  <strong>Gợi ý AI:</strong> {{ listing.aiModeration.reason }}
                </p>
                <small v-if="listing.aiModeration?.checkedAt" class="p2p-muted">Kiểm lúc {{ formatDateTime(listing.aiModeration.checkedAt) }}</small>
                <button v-if="aiEnabled" type="button" class="auth-btn auth-btn--soft"
                  :disabled="Boolean(pendingId) || Boolean(aiPendingId) || Boolean(confirming)" @click="checkAi(listing)">
                  <AuthIcon v-if="aiPendingId === listing.id" name="loader" :size="16" class="auth-spin" />
                  {{ aiPendingId === listing.id ? 'Đang kiểm tra…' : 'Kiểm tra bằng AI' }}
                </button>
                <p v-if="aiErrors[listing.id]" class="p2p-card__error" role="alert">{{ aiErrors[listing.id] }}</p>
              </div>

              <h3>Báo cáo về bài này</h3>
              <p v-if="!details[listing.id].reports.length" class="p2p-muted">Chưa có báo cáo nào.</p>
              <ul v-else class="p2p-detail__rows">
                <li v-for="report in details[listing.id].reports" :key="report.id">
                  <span class="p2p-badge p2p-badge--danger">{{ REPORT_REASON_LABEL[report.reason] || report.reason }}</span>
                  <span>{{ report.status === 'open' ? 'Chờ xử lý' : (RESOLUTION_LABEL[report.resolution] || 'Đã xử lý') }}</span>
                  <span>· {{ report.reporter.name || 'Người dùng' }} · {{ formatDateTime(report.createdAt) }}</span>
                  <small v-if="report.note">Ghi chú: {{ report.note }}</small>
                  <small v-if="report.resolutionNote">Xử lý: {{ report.resolutionNote }}</small>
                </li>
              </ul>

              <h3>Lịch sử gỡ / khôi phục</h3>
              <p v-if="!details[listing.id].history.length" class="p2p-muted">Chưa có thao tác nào từ trang này.</p>
              <ul v-else class="p2p-detail__rows">
                <li v-for="entry in details[listing.id].history" :key="entry.id">
                  <strong>{{ HISTORY_ACTION_LABEL[entry.action] || entry.action }}</strong>
                  <span>· {{ entry.actorEmail || 'Nhân sự' }} · {{ formatDateTime(entry.createdAt) }}</span>
                  <small v-if="entry.reason">Lý do: {{ entry.reason }}</small>
                  <small v-if="entry.resolvedReports">Tự đóng {{ entry.resolvedReports }} báo cáo đang chờ.</small>
                </li>
              </ul>
            </template>
          </div>
        </li>
      </ul>
      <p v-if="truncated" class="p2p-muted">Chỉ hiện 500 bài đầu tiên.</p>
    </template>
  </section>
</template>

<style scoped>
.p2p-page { width: min(1080px, 100%); margin: 0 auto; padding: 24px 8px 52px; display: grid; gap: 16px; }
.p2p-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.p2p-header h1 { font-size: clamp(26px, 3vw, 34px); font-weight: 700; color: #182a31; }
.p2p-header p { margin-top: 6px; color: #617081; max-width: 680px; }
.p2p-scope { display: flex; align-items: center; gap: 6px; color: #246632 !important; font-weight: 600; }
.p2p-toolbar { display: grid; gap: 12px; }
.p2p-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.p2p-tabs button { border: 1px solid #dfe6f1; background: #fff; border-radius: 999px; padding: 7px 14px; font-size: 13px; color: #264455; cursor: pointer; }
.p2p-tabs button.is-active { background: #246632; border-color: #246632; color: #fff; }
.p2p-tabs__count { margin-left: 4px; font-weight: 700; opacity: 0.8; }
.p2p-search { display: flex; align-items: center; gap: 8px; max-width: 420px; padding: 8px 12px; border: 1px solid #dfe6f1; border-radius: 10px; background: #fff; color: #617081; }
.p2p-search input { flex: 1; border: 0; outline: none; font-size: 14px; background: transparent; }
.p2p-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.p2p-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.p2p-card { display: grid; gap: 10px; padding: 16px; background: #fff; border: 1px solid #e1e7f1; border-radius: 14px; box-shadow: 0 8px 24px rgba(27, 52, 88, 0.04); }
.p2p-card--removed { background: #f8f9fb; }
.p2p-card__main { display: flex; gap: 14px; align-items: flex-start; }
.p2p-card__thumb { width: 84px; height: 84px; flex: none; border-radius: 10px; object-fit: cover; background: #eef1f6; }
.p2p-card__thumb--empty { display: grid; place-items: center; color: #8a97a8; }
.p2p-card__body { display: grid; gap: 6px; min-width: 0; }
.p2p-card__badges { display: flex; flex-wrap: wrap; gap: 6px; }
.p2p-card__title { font-size: 16px; color: #182a31; overflow-wrap: anywhere; }
.p2p-card__meta { color: #617081; font-size: 13px; }
.p2p-card__moderation { color: #8a4b00; font-size: 13px; }
.p2p-card__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.p2p-card__field { display: grid; gap: 6px; }
.p2p-card__field span { font-size: 13px; font-weight: 600; color: #264455; }
.p2p-card__field input { border: 1px solid #dfe6f1; border-radius: 10px; padding: 9px 12px; font-size: 14px; }
.p2p-card__error { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; background: #fdecea; color: #b3261e; font-size: 14px; }
.p2p-danger { color: #b3261e; }
.p2p-badge { padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.p2p-badge--success { background: #e3f4e7; color: #1f6b33; }
.p2p-badge--warning { background: #fff3d6; color: #8a5a00; }
.p2p-badge--muted { background: #eef1f6; color: #536174; }
.p2p-badge--danger { background: #fde8e6; color: #b3261e; }
.p2p-detail { display: grid; gap: 10px; padding-top: 10px; border-top: 1px dashed #e1e7f1; }
.p2p-detail__ai { display: grid; gap: 8px; justify-items: start; color: #42536a; font-size: 14px; overflow-wrap: anywhere; }
.p2p-detail h3 { font-size: 14px; color: #182a31; margin: 6px 0 0; }
.p2p-detail__images { display: flex; flex-wrap: wrap; gap: 8px; }
.p2p-detail__images img { width: 120px; height: 120px; border-radius: 10px; object-fit: cover; background: #eef1f6; }
.p2p-detail__note { color: #42536a; font-size: 14px; overflow-wrap: anywhere; }
.p2p-detail__rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.p2p-detail__rows li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 10px; background: #f4f6fb; font-size: 13px; color: #1a2d3a; }
.p2p-detail__rows small { flex-basis: 100%; color: #536174; }
.p2p-muted { display: flex; align-items: center; gap: 6px; color: #708090; font-size: 13px; }
.p2p-state { width: min(720px, 100%); min-height: 240px; margin: 24px auto; display: grid; place-items: center; align-content: center; gap: 12px; padding: 28px; text-align: center; background: #fff; border: 1px solid #e7edf5; border-radius: 20px; }
.p2p-state--inline { min-height: 160px; width: 100%; margin: 0; }
.p2p-state p { color: #617081; }
@media (max-width: 760px) {
  .p2p-header { flex-direction: column; }
  .p2p-card__main { flex-direction: column; }
}
</style>
