<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { requestPasswordChange } from '../auth.service'
import { ADMIN_ROUTE } from '../auth.constants'
import { passwordChangeErrorMessage, validatePasswordChange } from '../password-change.model'
import AuthIcon from '../components/AuthIcon.vue'

const fields = [
  { key: 'currentPassword', label: 'Mật khẩu hiện tại', autocomplete: 'current-password' },
  { key: 'newPassword', label: 'Mật khẩu mới', autocomplete: 'new-password' },
  { key: 'confirmation', label: 'Nhập lại mật khẩu mới', autocomplete: 'new-password' },
]
const passwords = reactive({ currentPassword: '', newPassword: '', confirmation: '' })
const didSubmit = ref(false)
const isSaving = ref(false)
const changed = ref(false)
const requestError = ref('')
const errors = computed(() => validatePasswordChange(passwords.currentPassword, passwords.newPassword, passwords.confirmation))

function clearPasswords() {
  for (const { key } of fields) passwords[key] = ''
}

onBeforeUnmount(clearPasswords)

async function submit() {
  if (isSaving.value) return
  didSubmit.value = true
  requestError.value = ''
  if (Object.keys(errors.value).length) return

  isSaving.value = true
  try {
    await requestPasswordChange(passwords.currentPassword, passwords.newPassword)
    clearPasswords()
    changed.value = true
  } catch (error) {
    requestError.value = passwordChangeErrorMessage(error)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section class="auth-card password-card" aria-labelledby="change-password-title">
    <h1 id="change-password-title">Đổi mật khẩu</h1>
    <template v-if="changed">
      <p class="auth-note" role="status">Đã đổi mật khẩu.</p>
      <RouterLink :to="{ name: ADMIN_ROUTE.home }" class="auth-btn auth-btn--soft">Về tổng quan</RouterLink>
    </template>
    <form v-else novalidate @submit.prevent="submit">
      <fieldset class="password-card__fields" :disabled="isSaving">
        <div v-for="field in fields" :key="field.key" class="auth-field">
          <label :for="field.key" class="auth-field__label">{{ field.label }}</label>
          <div class="auth-input" :class="{ 'is-invalid': didSubmit && errors[field.key] }">
            <AuthIcon name="lock" :size="18" />
            <input
              :id="field.key"
              v-model="passwords[field.key]"
              type="password"
              :autocomplete="field.autocomplete"
              :aria-invalid="Boolean(didSubmit && errors[field.key])"
              :aria-describedby="didSubmit && errors[field.key] ? `${field.key}-error` : undefined"
              required
            />
          </div>
          <p v-if="didSubmit && errors[field.key]" :id="`${field.key}-error`" class="auth-field__message" role="alert">
            {{ errors[field.key] }}
          </p>
        </div>
        <p v-if="requestError" class="auth-field__message" role="alert">{{ requestError }}</p>
        <button type="submit" class="auth-btn auth-btn--primary">
          {{ isSaving ? 'Đang đổi mật khẩu…' : 'Đổi mật khẩu' }}
        </button>
      </fieldset>
    </form>
  </section>
</template>

<style scoped>
.password-card { display: grid; gap: 20px; max-width: 520px; padding: 24px; }
.password-card h1 { margin: 0; color: var(--auth-text); font-size: 24px; }
.password-card > .auth-btn { justify-self: start; }
.password-card__fields { display: grid; gap: 16px; margin: 0; min-width: 0; padding: 0; border: 0; }
.password-card__fields .auth-btn { justify-self: start; }
</style>
