<script setup>
import { computed, onMounted, ref } from 'vue'
import AuthIcon from '../auth/components/AuthIcon.vue'
import InlineConfirm from '../shared/InlineConfirm.vue'
import { formatDateTime, unsuspendErrorMessage } from './moderation.model'
import { moderationRepository } from './moderation.repository'

const users = ref([])
const loading = ref(true)
const saving = ref(false)
const selectedUid = ref('')
const reason = ref('')
const loadError = ref('')
const actionError = ref('')
const notice = ref('')
const reasonValid = computed(() => reason.value.trim().length > 0 && reason.value.trim().length <= 500)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    users.value = await moderationRepository.listSuspendedUsers()
  } catch (error) {
    loadError.value = unsuspendErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function select(uid = '') {
  if (saving.value) return
  selectedUid.value = uid
  reason.value = ''
  actionError.value = ''
  notice.value = ''
}

async function unsuspend(user) {
  if (saving.value || selectedUid.value !== user.uid || !reasonValid.value) return
  saving.value = true
  actionError.value = ''
  try {
    await moderationRepository.unsuspend(user.uid, reason.value)
    selectedUid.value = ''
    reason.value = ''
    users.value = users.value.filter(item => item.uid !== user.uid)
    notice.value = 'Đã mở khoá tài khoản.'
    await load()
  } catch (error) {
    if (error?.code === 'UNSUSPEND_INCOMPLETE') {
      users.value = users.value.map(item => item.uid === user.uid ? { ...item, unsuspendPending: true } : item)
    }
    actionError.value = unsuspendErrorMessage(error)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="suspended" aria-label="Tài khoản đang bị khoá" :aria-busy="loading">
    <div class="suspended__tools">
      <p v-if="notice" role="status">{{ notice }}</p>
      <button type="button" class="auth-btn auth-btn--soft" :disabled="loading || saving" @click="load">
        <AuthIcon name="refresh" :size="18" />Tải lại
      </button>
    </div>
    <p v-if="loading" class="suspended__state" role="status">Đang tải tài khoản đang bị khoá…</p>
    <p v-else-if="loadError" class="suspended__state auth-field__message" role="alert">{{ loadError }}</p>
    <p v-else-if="users.length === 0" class="suspended__state">Không có tài khoản đang bị khoá.</p>
    <ul v-else class="suspended__list">
      <li v-for="user in users" :key="user.uid" class="auth-card suspended__card">
        <div class="suspended__row">
          <div class="suspended__identity">
            <strong>{{ user.displayName || 'Chưa có tên' }}</strong>
            <span>{{ user.email || 'Chưa có email' }}</span>
            <small>Ngày khoá: {{ formatDateTime(user.suspendedAt) }}</small>
            <small v-if="user.unsuspendPending" class="suspended__warning">Mở khoá chưa hoàn tất</small>
          </div>
          <button v-if="selectedUid !== user.uid" type="button" class="auth-btn auth-btn--soft" :disabled="saving" @click="select(user.uid)">
            {{ user.unsuspendPending ? 'Hoàn tất mở khoá' : 'Mở khoá' }}
          </button>
        </div>
        <template v-if="selectedUid === user.uid">
          <label class="suspended__reason">
            <span>Lý do mở khoá</span>
            <textarea v-model="reason" :disabled="saving" maxlength="500" rows="2" required />
            <small v-if="!reasonValid">Nhập lý do từ 1 đến 500 ký tự để xác nhận.</small>
          </label>
          <InlineConfirm message="Cho tài khoản này đăng nhập và sử dụng lại ReShare?"
            :confirm-label="user.unsuspendPending ? 'Hoàn tất mở khoá' : 'Mở khoá'" cancel-label="Huỷ"
            :busy="saving" :confirm-disabled="!reasonValid" @confirm="unsuspend(user)" @cancel="select()" />
          <p v-if="actionError" class="auth-field__message" role="alert">{{ actionError }}</p>
        </template>
      </li>
    </ul>
    <small v-if="!loading && users.length === 100">Hiển thị tối đa 100 tài khoản.</small>
  </section>
</template>

<style scoped>
.suspended, .suspended__list, .suspended__card { display: grid; gap: 12px; }
.suspended__tools, .suspended__row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.suspended__tools { justify-content: flex-end; }
.suspended__tools p { margin-right: auto; color: var(--auth-primary); }
.suspended__list { list-style: none; padding: 0; margin: 0; }
.suspended__card, .suspended__state { padding: 16px; }
.suspended__identity, .suspended__reason { display: grid; gap: 4px; overflow-wrap: anywhere; }
.suspended__identity span, .suspended__reason small { color: var(--auth-text-secondary); }
.suspended__warning { color: #8a4b00; }
.suspended__reason textarea { border: 1px solid var(--auth-border); border-radius: 8px; padding: 8px; font: inherit; resize: vertical; }
.suspended .auth-btn:disabled { opacity: .58; }
</style>
