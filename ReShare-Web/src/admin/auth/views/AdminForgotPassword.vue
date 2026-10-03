<script setup>
import { computed, ref } from 'vue'
import AuthShell from '../components/AuthShell.vue'
import AuthIcon from '../components/AuthIcon.vue'
import logoUrl from '../assets/reshare-logo.png'
import { isAdminEmail, requestPasswordReset } from '../auth.service'
import { ADMIN_ROUTE, AUTH_ERROR } from '../auth.constants'

const email = ref('')
const emailError = ref('')
const requestError = ref('')
const sentEmail = ref('')
const sentAt = ref('')
const isSending = ref(false)

const isEmailValid = computed(() => isAdminEmail(email.value.trim()))

function onEmailBlur() {
  const value = email.value.trim()
  emailError.value = !value || isAdminEmail(value) ? '' : 'Vui lòng nhập địa chỉ email hợp lệ.'
}

async function sendResetLink(targetEmail) {
  if (isSending.value) return
  isSending.value = true
  requestError.value = ''
  try {
    await requestPasswordReset(targetEmail)
    sentEmail.value = targetEmail
    sentAt.value = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    requestError.value =
      error.status === AUTH_ERROR.network
        ? 'Không thể kết nối dịch vụ xác thực. Kiểm tra mạng và thử lại.'
        : 'Máy chủ đang gặp sự cố, chưa gửi được liên kết. Vui lòng thử lại sau ít phút.'
  } finally {
    isSending.value = false
  }
}

function onSubmit() {
  onEmailBlur()
  if (isEmailValid.value) sendResetLink(email.value.trim())
}
</script>

<template>
  <AuthShell :show-server-status="false">
    <div class="forgot-password">
      <span class="auth-chip auth-mono"><span class="auth-dot" />Cổng quản trị ReShare</span>

      <section class="forgot-password__card auth-card auth-card--accent-top" aria-labelledby="forgot-password-title">
        <div class="forgot-password__body">
          <div class="forgot-password__brand">
            <span class="forgot-password__brand-logo">
              <img class="forgot-password__brand-mark" :src="logoUrl" alt="" />
              ReShare
              <span class="forgot-password__brand-tag">Portal</span>
            </span>
            <span class="forgot-password__brand-chip"><AuthIcon name="shield" :size="16" />Cổng vận hành nội bộ</span>
          </div>

          <template v-if="sentEmail">
            <div class="forgot-password__heading">
              <h1 id="forgot-password-title">Đã gửi liên kết đặt lại</h1>
              <p>
                Nếu <strong class="auth-mono">{{ sentEmail }}</strong> có tài khoản Firebase, hãy kiểm tra hộp thư này.
                Yêu cầu được gửi lúc {{ sentAt }}.
              </p>
            </div>

            <div class="auth-note" role="status">
              <AuthIcon name="mail-check" :size="22" class="auth-note__icon" />
              <div>
                <p class="auth-note__title">Kiểm tra hộp thư</p>
                <p>
                  Mở thư mục <strong>Inbox</strong> và cả <strong>Spam</strong>. Hãy làm theo thời hạn ghi trong email đặt lại mật khẩu.
                </p>
              </div>
            </div>

            <p v-if="requestError" class="auth-field__message" role="alert">
              <AuthIcon name="alert-triangle" :size="16" />{{ requestError }}
            </p>

            <button type="button" class="auth-btn auth-btn--soft forgot-password__resend" :disabled="isSending" @click="sendResetLink(sentEmail)">
              <AuthIcon :name="isSending ? 'loader' : 'refresh'" :size="18" :class="{ 'auth-spin': isSending }" />
              {{ isSending ? 'Đang gửi lại…' : 'Gửi lại liên kết' }}
            </button>
          </template>

          <template v-else>
            <div class="forgot-password__heading">
              <h1 id="forgot-password-title">Quên mật khẩu?</h1>
              <p>Nhập email tài khoản để nhận liên kết đặt lại mật khẩu.</p>
            </div>

            <div class="auth-note">
              <AuthIcon name="badge-check" :size="22" class="auth-note__icon" />
              <div>
                <p class="auth-note__title">Lưu ý bảo mật</p>
                <p>
                  Chỉ tài khoản Firebase đã đăng ký mới có thể đặt lại mật khẩu. Quyền quản trị được kiểm tra riêng sau khi đăng nhập.
                </p>
              </div>
            </div>

            <form class="forgot-password__form" novalidate @submit.prevent="onSubmit">
              <fieldset :disabled="isSending">
                <div class="auth-field">
                  <div class="auth-field__label-row">
                    <label for="reset-email" class="auth-field__label">
                      Email công vụ <span class="auth-field__required">*</span>
                    </label>
                    <span class="auth-field__hint">Email tài khoản</span>
                  </div>
                  <div class="auth-input" :class="{ 'is-invalid': emailError }">
                    <AuthIcon name="mail" />
                    <input
                      id="reset-email"
                      v-model="email"
                      type="email"
                      autocomplete="username"
                      placeholder="Nhập địa chỉ email"
                      :aria-invalid="Boolean(emailError)"
                      aria-describedby="reset-email-message"
                      @blur="onEmailBlur"
                    />
                  </div>
                  <p v-if="emailError" id="reset-email-message" class="auth-field__message">
                    <AuthIcon name="alert-triangle" :size="16" />{{ emailError }}
                  </p>
                  <p v-else id="reset-email-message" class="auth-field__message auth-field__message--muted">
                    Nhập email bạn dùng để đăng nhập ReShare
                  </p>
                </div>

                <p v-if="requestError" class="auth-field__message" role="alert">
                  <AuthIcon name="alert-triangle" :size="16" />{{ requestError }}
                </p>

                <button type="submit" class="auth-btn auth-btn--primary" :disabled="!isEmailValid || isSending">
                  <AuthIcon v-if="isSending" name="loader" :size="18" class="auth-spin" />
                  {{ isSending ? 'Đang gửi…' : 'Gửi liên kết đặt lại' }}
                  <AuthIcon v-if="!isSending" name="arrow-right" :size="18" />
                </button>
              </fieldset>
            </form>

            <p class="forgot-password__spam">Nếu không thấy email, hãy kiểm tra thư mục spam.</p>
          </template>

          <RouterLink :to="{ name: ADMIN_ROUTE.login }" class="auth-btn auth-btn--link forgot-password__back">
            <AuthIcon name="arrow-left" :size="18" />Quay lại đăng nhập
          </RouterLink>
        </div>

        <footer class="forgot-password__footer">
          <AuthIcon name="scroll" :size="16" />Hệ thống tự động ghi nhận nhật ký mọi yêu cầu khôi phục mật khẩu
        </footer>
      </section>

      <p class="forgot-password__security">
        <AuthIcon name="lock" :size="16" />Yêu cầu đặt lại mật khẩu qua Firebase Authentication
      </p>
    </div>
  </AuthShell>
</template>

<style scoped>
.forgot-password {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: 100%;
  max-width: 700px;
  margin: 0 auto;
}

.forgot-password .auth-chip.auth-mono {
  font-weight: 500;
}

.forgot-password__card {
  width: 100%;
}

.forgot-password__body {
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 40px 44px 30px;
}

.forgot-password__brand {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.forgot-password__brand-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 700;
  color: var(--auth-primary);
}

.forgot-password__brand-mark {
  width: 50px;
  height: 50px;
}

.forgot-password__brand-tag {
  padding: 2px 8px;
  border-radius: 4px;
  background: #b8edb9;
  font-size: 14px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.forgot-password__brand-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--auth-accent-soft);
  font-size: 14px;
  font-weight: 600;
  color: var(--auth-text-secondary);
}

.forgot-password__brand-chip svg {
  color: var(--auth-primary);
}

.forgot-password__heading h1 {
  font-size: 32px;
  font-weight: 700;
}

.forgot-password__heading p {
  margin-top: 6px;
  font-size: 18px;
  color: var(--auth-text-secondary);
  word-break: break-word;
}

.forgot-password__heading strong {
  color: var(--auth-text);
}

.forgot-password__form fieldset {
  display: flex;
  flex-direction: column;
  gap: 22px;
  margin: 0;
  padding: 0;
  border: none;
  min-width: 0;
}

.forgot-password__resend {
  min-height: 54px;
  color: var(--auth-primary);
  font-size: 17px;
}

.forgot-password__spam {
  margin-top: -8px;
  text-align: center;
  font-size: 17px;
  color: var(--auth-text-secondary);
}

.forgot-password__back {
  padding-top: 18px;
  border-top: 1px solid var(--auth-border);
  border-radius: 0;
}

.forgot-password__footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 24px;
  background: #f6f7fb;
  font-size: 14px;
  font-weight: 600;
  color: var(--auth-text-secondary);
  text-align: center;
}

.forgot-password__security {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--auth-text-secondary);
}

.forgot-password__security svg {
  color: var(--auth-primary);
}

@media (max-width: 640px) {
  .forgot-password__body {
    padding: 28px 20px 24px;
  }

  .forgot-password__heading h1 {
    font-size: 26px;
  }
}
</style>
