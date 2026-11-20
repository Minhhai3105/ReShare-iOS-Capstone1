<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { ADMIN_ROUTE } from '../auth/auth.constants.js'
import { formatDateTime } from '../moderation/moderation.model.js'
import InlineConfirm from '../shared/InlineConfirm.vue'
import { matchesUserName, providerLabels, userAction, userStatus, usersErrorMessage } from './users.model.js'
import { usersService } from './users.service.js'

const email = ref('')
const name = ref('')
const searchEmail = ref('')
const rows = ref([])
const nextPageToken = ref(null)
const loading = ref(false)
const listError = ref('')
const selected = ref(null)
const detailPanel = ref(null)
const summary = ref(null)
const summaryError = ref('')
const loadingSummary = ref(false)
const confirming = ref(false)
const reason = ref('')
const saving = ref(false)
const actionError = ref('')
const notice = ref('')
let detailRequest = 0

const filtered = computed(() => rows.value.filter(user => matchesUserName(user, name.value)))
const action = computed(() => userAction(selected.value))
const reasonValid = computed(() => reason.value.trim().length > 0 && reason.value.trim().length <= 500)

async function load(append = false) {
  if (loading.value || saving.value || (append && !nextPageToken.value)) return
  loading.value = true
  listError.value = ''
  if (!append) {
    searchEmail.value = email.value.trim()
    rows.value = []
    nextPageToken.value = null
    await selectUser(null)
  }
  try {
    const result = await usersService.list({ email: searchEmail.value, pageToken: append ? nextPageToken.value : '' })
    rows.value = append ? [...rows.value, ...result.users.filter(user => !rows.value.some(row => row.uid === user.uid))] : result.users
    nextPageToken.value = result.nextPageToken
  } catch (error) {
    listError.value = usersErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function selectUser(user) {
  if (saving.value) return
  const request = ++detailRequest
  selected.value = user
  summary.value = null
  summaryError.value = ''
  notice.value = ''
  cancelAction()
  loadingSummary.value = Boolean(user)
  if (!user) return
  await nextTick()
  if (request !== detailRequest) return
  detailPanel.value?.focus()
  try {
    const result = await usersService.summary(user.uid)
    if (request === detailRequest) summary.value = result
  } catch (error) {
    if (request === detailRequest) summaryError.value = usersErrorMessage(error)
  } finally {
    if (request === detailRequest) loadingSummary.value = false
  }
}

function cancelAction() {
  if (saving.value) return
  confirming.value = false
  reason.value = ''
  actionError.value = ''
}

function updateSelected(change) {
  selected.value = { ...selected.value, ...change }
  rows.value = rows.value.map(row => row.uid === selected.value.uid ? selected.value : row)
}

async function confirmAction() {
  const option = action.value
  if (saving.value || loading.value || !confirming.value || !reasonValid.value || !option) return
  saving.value = true
  actionError.value = ''
  notice.value = ''
  try {
    await usersService[option.key](selected.value.uid, reason.value)
    const suspended = option.key === 'suspend'
    updateSelected({ suspended, disabled: suspended, suspendPending: false, unsuspendPending: false })
    confirming.value = false
    reason.value = ''
    notice.value = suspended ? 'Đã khoá tài khoản.' : 'Đã mở khoá tài khoản.'
  } catch (error) {
    if (error?.code === 'SUSPEND_INCOMPLETE') updateSelected({ suspendPending: true, suspended: true })
    if (error?.code === 'UNSUSPEND_INCOMPLETE') updateSelected({ unsuspendPending: true })
    actionError.value = usersErrorMessage(error)
  } finally {
    saving.value = false
  }
}

onMounted(() => load())
</script>

<template>
  <section class="users-page" aria-labelledby="users-title">
    <header>
      <h1 id="users-title">Người dùng</h1>
    </header>

    <div class="users-layout">
      <section class="auth-card users-list" aria-label="Danh sách người dùng">
        <form class="users-filters" novalidate @submit.prevent="load()">
          <label>Địa chỉ email
            <input v-model="email" type="email" maxlength="254" placeholder="Nhập email chính xác" :disabled="saving || loading" />
          </label>
          <button class="auth-btn auth-btn--soft" type="submit" :disabled="saving || loading">
            <AuthIcon name="search" :size="17" />{{ email.trim() ? 'Tìm email' : 'Tải danh sách' }}
          </button>
          <label>Lọc theo tên đã tải
            <input v-model="name" type="search" placeholder="Nhập tên hiển thị" />
          </label>
        </form>
        <p v-if="listError" role="alert" class="auth-field__message">{{ listError }}</p>
        <p v-if="loading" role="status">Đang tải người dùng…</p>
        <p v-else-if="!listError && filtered.length === 0" role="status">Không tìm thấy người dùng phù hợp.</p>
        <div v-if="filtered.length" class="users-table-wrap">
          <table class="users-table" aria-label="Người dùng đã tải">
            <thead>
              <tr><th>Tên</th><th>Email</th><th>Đăng nhập bằng</th><th>Ngày tạo</th><th>Lần đăng nhập cuối</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              <tr v-for="user in filtered" :key="user.uid" :class="{ 'is-selected': selected?.uid === user.uid }" @click="selectUser(user)">
                <th scope="row">
                  <button type="button" class="users-name" :disabled="saving" @click.stop="selectUser(user)">
                    {{ user.displayName?.trim() || 'Chưa có tên' }}
                  </button>
                </th>
                <td>{{ user.email || '—' }}</td>
                <td>{{ providerLabels(user.providers) }}</td>
                <td>{{ formatDateTime(user.createdAt) }}</td>
                <td>{{ formatDateTime(user.lastSignInAt) }}</td>
                <td><span :class="['users-status', `users-status--${userStatus(user).tone}`]">{{ userStatus(user).label }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button v-if="nextPageToken" type="button" class="auth-btn auth-btn--soft users-more" :disabled="loading || saving" @click="load(true)">
          {{ loading ? 'Đang tải…' : 'Xem thêm' }}
        </button>
      </section>

      <aside v-if="selected" ref="detailPanel" tabindex="-1" class="auth-card users-detail" aria-labelledby="user-detail-title">
        <header class="users-detail__header">
          <h2 id="user-detail-title">{{ selected.displayName || 'Chi tiết tài khoản' }}</h2>
          <button type="button" class="auth-btn auth-btn--soft" :disabled="saving" @click="selectUser(null)">Đóng</button>
        </header>
        <dl>
          <div><dt>Mã tài khoản</dt><dd>{{ selected.uid }}</dd></div>
          <div><dt>Email</dt><dd>{{ selected.email || '—' }}</dd></div>
          <div><dt>Số điện thoại</dt><dd>{{ selected.phoneNumber || '—' }}</dd></div>
          <div><dt>Trạng thái</dt><dd>{{ userStatus(selected).label }}</dd></div>
          <div v-if="summary"><dt>Đơn quyên góp</dt><dd>{{ summary.donationCount }}</dd></div>
          <div v-if="summary"><dt>Bài Kho đồ 0đ</dt><dd>{{ summary.listingCount }}</dd></div>
        </dl>
        <p v-if="loadingSummary" role="status">Đang đếm đơn và bài đăng…</p>
        <p v-if="summaryError" role="alert" class="auth-field__message">{{ summaryError }}</p>
        <p v-if="notice" role="status" class="users-notice">{{ notice }}</p>
        <p v-if="selected.staffRole">Thu hồi quyền ở trang <RouterLink :to="{ name: ADMIN_ROUTE.staff }">Nhân sự</RouterLink> trước khi khoá.</p>
        <p v-else-if="!action">Đăng nhập đã bị vô hiệu hoá ngoài luồng quản trị ReShare.</p>
        <template v-else-if="confirming">
          <label class="users-reason">Lý do
            <textarea v-model="reason" maxlength="500" :disabled="saving" rows="2" required />
            <small v-if="!reasonValid">Nhập lý do từ 1 đến 500 ký tự để xác nhận.</small>
          </label>
          <InlineConfirm :message="action.danger ? 'Khoá đăng nhập và gỡ các bài đang mở của tài khoản này?' : 'Cho tài khoản này đăng nhập và sử dụng lại ReShare?'"
            :confirm-label="action.label" cancel-label="Huỷ" :tone="action.danger ? 'danger' : 'warning'"
            :confirm-disabled="!reasonValid || loading" :busy="saving" @confirm="confirmAction" @cancel="cancelAction" />
        </template>
        <button v-else type="button" class="auth-btn auth-btn--soft" :disabled="saving || loading" @click="confirming = true">{{ action.label }}</button>
        <p v-if="actionError" role="alert" class="auth-field__message">{{ actionError }}</p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.users-page, .users-list, .users-detail { display: grid; gap: 16px; min-width: 0; }
.users-page h1 { font-size: 28px; }
.users-layout { display: flex; align-items: flex-start; gap: 16px; }
.users-list { flex: 1; padding: 16px; }
.users-filters, .users-detail__header { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 10px; }
.users-filters label, .users-reason { display: grid; gap: 5px; flex: 1 1 180px; font-weight: 500; }
.users-filters input, .users-reason textarea { min-width: 0; border: 1px solid var(--auth-border); border-radius: 8px; padding: 10px; font: inherit; }
.users-table-wrap { overflow-x: auto; }
.users-table { width: 100%; min-width: 740px; border-collapse: collapse; text-align: left; font-size: 13px; }
.users-table td, .users-table th { padding: 9px; border-bottom: 1px solid var(--auth-border); vertical-align: top; overflow-wrap: anywhere; }
.users-table tbody tr { cursor: pointer; }
.users-table tbody tr:is(:hover, .is-selected) { background: var(--auth-primary-soft); }
.users-name { border: 0; background: transparent; padding: 3px 0; font: inherit; font-weight: 700; color: var(--auth-primary); text-align: left; cursor: pointer; }
.users-status { font-weight: 600; }
.users-status--active, .users-notice { color: var(--auth-primary); }
.users-status--locked { color: var(--auth-danger); }
.users-status--staff { color: var(--auth-text-secondary); }
.users-more { justify-self: start; }
.users-detail { flex: 0 0 min(310px, 32%); padding: 16px; overflow-wrap: anywhere; }
.users-detail__header { justify-content: space-between; align-items: center; }
.users-detail dl { display: grid; gap: 8px; margin: 0; }
.users-detail dl div { display: grid; gap: 2px; }
.users-detail dt, .users-reason small { color: var(--auth-text-secondary); font-size: 13px; }
.users-detail dd { margin: 0; }
.users-page .auth-btn:disabled { opacity: .55; }
@media (max-width: 900px) {
  .users-layout { flex-direction: column; }
  .users-list, .users-detail { width: 100%; }
}
</style>
