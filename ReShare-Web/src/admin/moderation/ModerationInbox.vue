<script setup>
import { computed, ref, watch } from 'vue'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE, USER_ROLE } from '../auth/auth.constants'
import { staffAssignment } from '../auth/auth.store'
import { moderationRepository } from './moderation.repository'
import {
  REPORT_REASON_LABEL, RESOLUTION_LABEL, TARGET_LABEL, actionsFor, formatDateTime, moderationErrorMessage, targetSummary,
} from './moderation.model'

const canManage = computed(() => staffAssignment.value?.active === true && staffAssignment.value.role === USER_ROLE.systemAdmin)
const status = ref('open')
const reports = ref([])
const truncated = ref(false)
const isLoading = ref(true)
const loadError = ref('')
const pending = ref('')
const actionError = ref({})
const notes = ref({})
let requestId = 0

async function load() {
  const current = ++requestId
  isLoading.value = true
  loadError.value = ''
  try {
    const result = await moderationRepository.list(status.value)
    if (current !== requestId) return
    reports.value = result.reports
    truncated.value = result.truncated
  } catch (error) {
    if (current === requestId) loadError.value = moderationErrorMessage(error)
  } finally {
    if (current === requestId) isLoading.value = false
  }
}

watch([status, canManage], ([, allowed]) => { if (allowed) load() }, { immediate: true })

async function resolve(report, option) {
  if (pending.value || !window.confirm(option.confirm)) return
  pending.value = `${report.id}:${option.action}`
  actionError.value = { ...actionError.value, [report.id]: '' }
  try {
    await moderationRepository.resolve(report.id, option.action, notes.value[report.id] || '')
    reports.value = reports.value.filter((item) => item.id !== report.id)
  } catch (error) {
    if (error?.code === 'SUSPEND_INCOMPLETE') {
      // Báo cáo vẫn mở ở trạng thái khoá dở: đổi nút thành "Hoàn tất khoá tài khoản".
      reports.value = reports.value.map((item) => (item.id === report.id ? { ...item, pendingAction: 'suspend_user' } : item))
    }
    actionError.value = { ...actionError.value, [report.id]: moderationErrorMessage(error) }
  } finally {
    pending.value = ''
  }
}
</script>

<template>
  <section v-if="!canManage" class="mod-state">
    <AuthIcon name="shield" :size="28" />
    <h2>Chỉ Quản trị hệ thống xử lý báo cáo vi phạm</h2>
    <RouterLink :to="{ name: ADMIN_ROUTE.home }" class="auth-btn auth-btn--soft">Về tổng quan</RouterLink>
  </section>

  <section v-else class="mod-page" aria-labelledby="mod-title">
    <header class="mod-header">
      <div>
        <h1 id="mod-title">Báo cáo vi phạm</h1>
        <p>Báo cáo từ người dùng app về bài Kho đồ 0đ, tin nhắn hoặc tài khoản. Điều khoản cam kết xử lý trong vòng 24 giờ.</p>
      </div>
      <button type="button" class="auth-btn auth-btn--soft" :disabled="isLoading" @click="load">
        <AuthIcon name="refresh" :size="18" />Tải lại
      </button>
    </header>

    <div class="mod-tabs" role="tablist" aria-label="Trạng thái báo cáo">
      <button v-for="tab in [{ id: 'open', label: 'Chờ xử lý' }, { id: 'resolved', label: 'Đã xử lý' }]" :key="tab.id"
        type="button" role="tab" :aria-selected="status === tab.id" :class="{ 'is-active': status === tab.id }" @click="status = tab.id">
        {{ tab.label }}
      </button>
    </div>

    <div v-if="isLoading" class="mod-state mod-state--inline">
      <AuthIcon name="loader" :size="24" class="auth-spin" /><p>Đang tải báo cáo… Máy chủ miễn phí có thể mất 30–50 giây để khởi động.</p>
    </div>
    <div v-else-if="loadError" class="mod-state mod-state--inline" role="alert">
      <AuthIcon name="alert-triangle" :size="24" /><p>{{ loadError }}</p>
      <button type="button" class="auth-btn auth-btn--soft" @click="load">Thử lại</button>
    </div>
    <div v-else-if="!reports.length" class="mod-state mod-state--inline">
      <AuthIcon name="check-circle" :size="24" /><p>{{ status === 'open' ? 'Không có báo cáo nào đang chờ xử lý.' : 'Chưa có báo cáo nào đã xử lý.' }}</p>
    </div>

    <ul v-else class="mod-list">
      <li v-for="report in reports" :key="report.id" class="mod-card">
        <div class="mod-card__top">
          <span class="mod-badge">{{ TARGET_LABEL[report.targetType] || report.targetType }}</span>
          <span class="mod-badge mod-badge--reason">{{ REPORT_REASON_LABEL[report.reason] || report.reason }}</span>
          <span v-if="report.resolution" class="mod-badge mod-badge--done">{{ RESOLUTION_LABEL[report.resolution] }}</span>
          <small>{{ formatDateTime(report.createdAt) }}</small>
        </div>
        <p class="mod-card__target">{{ targetSummary(report) || '—' }}</p>
        <dl class="mod-card__people">
          <div><dt>Người bị báo cáo</dt><dd>{{ report.targetUser.name || report.targetUser.id }}<span v-if="report.targetUser.suspended"> · đã khoá</span></dd></div>
          <div><dt>Người báo cáo</dt><dd>{{ report.reporter.name || report.reporter.id }}</dd></div>
        </dl>
        <p v-if="report.attributionMismatch" class="mod-card__warn" role="note">
          Người báo cáo khai sai chủ nội dung. Danh sách hiển thị chủ thật; không khoá tài khoản từ báo cáo này.
        </p>
        <p v-if="report.pendingAction === 'suspend_user'" class="mod-card__warn" role="note">
          Đã chặn tài khoản này ghi dữ liệu nhưng chưa khoá xong đăng nhập. Bấm “Hoàn tất khoá tài khoản”.
        </p>
        <p v-if="report.note" class="mod-card__note">Ghi chú của người báo cáo: {{ report.note }}</p>
        <p v-if="report.resolutionNote" class="mod-card__note">Ghi chú xử lý: {{ report.resolutionNote }}</p>

        <template v-if="actionsFor(report).length">
          <label class="mod-card__field">
            <span>Ghi chú xử lý (tuỳ chọn)</span>
            <input v-model="notes[report.id]" type="text" maxlength="500" placeholder="Ví dụ: bài rao bán, vi phạm mục 4" />
          </label>
          <div class="mod-card__actions">
            <button v-for="option in actionsFor(report)" :key="option.action" type="button"
              :class="['auth-btn', option.danger ? 'auth-btn--primary mod-danger' : 'auth-btn--soft']"
              :disabled="Boolean(pending)" @click="resolve(report, option)">
              <AuthIcon v-if="pending === `${report.id}:${option.action}`" name="loader" :size="16" class="auth-spin" />
              {{ option.label }}
            </button>
          </div>
          <p v-if="actionError[report.id]" class="mod-card__error" role="alert">{{ actionError[report.id] }}</p>
        </template>
      </li>
    </ul>
    <p v-if="truncated" class="mod-muted">Chỉ hiện 200 báo cáo đầu tiên.</p>
  </section>
</template>

<style scoped>
.mod-page { width: min(980px, 100%); margin: 0 auto; padding: 24px 8px 52px; display: grid; gap: 16px; }
.mod-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.mod-header h1 { font-size: clamp(26px, 3vw, 34px); font-weight: 700; color: #182a31; }
.mod-header p { margin-top: 6px; color: #617081; max-width: 640px; }
.mod-tabs { display: flex; gap: 8px; }
.mod-tabs button { border: 1px solid #dfe6f1; background: #fff; border-radius: 999px; padding: 7px 16px; font-size: 13px; color: #264455; cursor: pointer; }
.mod-tabs button.is-active { background: #246632; border-color: #246632; color: #fff; }
.mod-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.mod-card { display: grid; gap: 10px; padding: 18px; background: #fff; border: 1px solid #e1e7f1; border-radius: 14px; box-shadow: 0 8px 24px rgba(27, 52, 88, 0.04); }
.mod-card__top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.mod-card__top small { margin-left: auto; color: #617081; }
.mod-badge { padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #eef1f6; color: #536174; }
.mod-badge--reason { background: #fde8e6; color: #b3261e; }
.mod-badge--done { background: #e3f4e7; color: #1f6b33; }
.mod-card__target { font-size: 15px; color: #182a31; overflow-wrap: anywhere; }
.mod-card__people { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; }
.mod-card__people div { padding: 8px 10px; border-radius: 10px; background: #f4f6fb; }
.mod-card__people dt { color: #617081; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.mod-card__people dd { margin: 3px 0 0; color: #1a2d3a; overflow-wrap: anywhere; }
.mod-card__note { color: #42536a; font-size: 13px; }
.mod-card__field { display: grid; gap: 6px; }
.mod-card__field span { font-size: 13px; font-weight: 600; color: #264455; }
.mod-card__field input { border: 1px solid #dfe6f1; border-radius: 10px; padding: 9px 12px; font-size: 14px; }
.mod-card__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.mod-danger { background: #b3261e; border-color: #b3261e; }
.mod-card__error { color: #c62828; }
.mod-card__warn { padding: 8px 10px; border-radius: 10px; background: #fff4e5; color: #8a4b00; font-size: 13px; }
.mod-muted { color: #708090; font-size: 13px; }
.mod-state { width: min(720px, 100%); min-height: 240px; margin: 24px auto; display: grid; place-items: center; align-content: center; gap: 12px; padding: 28px; text-align: center; background: #fff; border: 1px solid #e7edf5; border-radius: 20px; }
.mod-state--inline { min-height: 160px; width: 100%; margin: 0; }
.mod-state p { color: #617081; }
@media (max-width: 760px) {
  .mod-header { flex-direction: column; }
  .mod-card__people { grid-template-columns: 1fr; }
}
</style>
