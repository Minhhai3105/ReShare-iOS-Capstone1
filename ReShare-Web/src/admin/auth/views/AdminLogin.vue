<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import AuthIcon from '../components/AuthIcon.vue'
import heroImage from '../assets/login-hero.jpg'
import { isLoading, signIn } from '../auth.store'
import { isAdminEmail } from '../auth.service'
import {
  ADMIN_EMAIL_DOMAIN,
  ADMIN_ROUTE,
  AUTH_ERROR,
  EXTENDED_SESSION_DURATION_MS,
  MAX_SIGN_IN_ATTEMPTS,
  SESSION_DURATION_MS,
  SESSION_EXPIRED_REASON,
  SUPPORT_EMAIL,
} from '../auth.constants'

const APP_VERSION = 'v2.14.0'
const HIGHLIGHTS = [
  { label: 'Đơn xử lý/ngày', value: '14,820+' },
  { label: 'Tiêu chuẩn kiểm soát', value: 'ISO 27001', isAccent: true },
  { label: 'Phiên xác thực', value: '256-bit' },
]
const CONNECTION_ERROR = {
  [AUTH_ERROR.network]: {
    badge: 'Hệ thống ngoại tuyến',
    title: 'Không thể kết nối đến máy chủ',
    message:
      'Hệ thống không thể thiết lập kết nối an toàn tới máy chủ xác thực ReShare. Vui lòng kiểm tra lại đường truyền mạng nội bộ (VPN / Wifi) của bạn và thử lại.',
    code: 'NET_TIMEOUT_ERR',
    networkStatus: 'Chưa phản hồi',
    serverStatus: 'Mất kết nối',
  },
  [AUTH_ERROR.server]: {
    badge: 'Máy chủ gặp sự cố',
    title: 'Máy chủ xác thực đang gặp sự cố',
    message:
      'Máy chủ xác thực ReShare phản hồi lỗi khi xử lý yêu cầu đăng nhập. Vui lòng thử lại sau ít phút hoặc liên hệ bộ phận kỹ thuật.',
    code: 'ERR_SERVER_500',
    networkStatus: 'Đã kết nối',
    serverStatus: 'Lỗi 500',
  },
}
const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Ho_Chi_Minh',
})

const route = useRoute()
const router = useRouter()

const form = reactive({ email: '', password: '', keepSignedIn: false })
const fieldErrors = reactive({ email: '', password: '' })
const isPasswordVisible = ref(false)
const failedAttempts = ref(0)
const connectionError = ref(null) // { status, isOnline, checkedAt }
const notice = ref('')
const isSessionExpiredNotice = ref(route.query.reason === SESSION_EXPIRED_REASON)

const hasInvalidCredentials = computed(() => failedAttempts.value > 0)
const remainingAttempts = computed(() => Math.max(MAX_SIGN_IN_ATTEMPTS - failedAttempts.value, 0))
const isLocked = computed(() => remainingAttempts.value === 0)
const submitLabel = computed(() => {
  if (isLoading.value) return 'Đang xác thực…'
  if (isLocked.value) return 'Tạm khóa đăng nhập'
  return hasInvalidCredentials.value ? 'Thực Hiện Đăng Nhập Lại' : 'Đăng Nhập'
})
const emailMessage = computed(
  () => fieldErrors.email || (hasInvalidCredentials.value ? 'Xác thực thất bại với định danh email này' : ''),
)
const connectionErrorText = computed(
  () => CONNECTION_ERROR[connectionError.value?.status] ?? CONNECTION_ERROR[AUTH_ERROR.server],
)
const extendedSessionHours = EXTENDED_SESSION_DURATION_MS / 3_600_000
const sessionMinutes = SESSION_DURATION_MS / 60_000

function validateForm() {
  const email = form.email.trim()
  if (!email) fieldErrors.email = 'Vui lòng nhập email nhân sự.'
  else fieldErrors.email = isAdminEmail(email) ? '' : `Vui lòng dùng email nội bộ ${ADMIN_EMAIL_DOMAIN}.`
  fieldErrors.password = form.password ? '' : 'Vui lòng nhập mật khẩu.'
  return !fieldErrors.email && !fieldErrors.password
}

function getRedirectLocation() {
  const { redirect } = route.query
  return typeof redirect === 'string' && /^\/admin(\/|$)/.test(redirect) ? redirect : { name: ADMIN_ROUTE.home }
}

function toConnectionError(status) {
  return { status, isOnline: navigator.onLine, checkedAt: timeFormatter.format(new Date()) }
}

async function onSubmit() {
  if (isLoading.value || isLocked.value || !validateForm()) return
  notice.value = ''
  isSessionExpiredNotice.value = false
  try {
    await signIn(form.email.trim(), form.password, { keepSignedIn: form.keepSignedIn })
    router.replace(getRedirectLocation())
  } catch (error) {
    if (error.status === AUTH_ERROR.invalidCredentials) {
      connectionError.value = null
      failedAttempts.value += 1
      form.password = ''
      return
    }
    connectionError.value = toConnectionError(error.status)
  }
}

function onCheckNetworkClick() {
  connectionError.value = toConnectionError(connectionError.value.status)
}

function onSsoClick() {
  notice.value = 'Đăng nhập SSO Google chưa được hỗ trợ ở phiên bản này. Vui lòng dùng email và mật khẩu nhân sự.'
}
</script>

<template>
  <AuthShell>
    <section v-if="connectionError" class="connection-error" aria-labelledby="connection-error-title">
      <span class="auth-chip auth-chip--danger"><span class="auth-dot auth-dot--danger" />{{ connectionErrorText.badge }}</span>

      <div class="connection-error__card auth-card auth-card--danger-top">
        <div class="connection-error__icon">
          <AuthIcon name="cloud-off" :size="44" />
          <span class="connection-error__icon-badge">!</span>
        </div>
        <h1 id="connection-error-title">{{ connectionErrorText.title }}</h1>
        <p class="connection-error__message">{{ connectionErrorText.message }}</p>

        <div class="connection-error__diagnostic">
          <div class="connection-error__diagnostic-header">
            <span><AuthIcon name="terminal" :size="16" />Chẩn đoán nội bộ</span>
            <span class="auth-mono">Thời gian: {{ connectionError.checkedAt }} UTC+7</span>
          </div>
          <p class="connection-error__code auth-mono" role="alert">
            <AuthIcon name="wifi" :size="18" />Mã lỗi: {{ connectionErrorText.code }} (Vui lòng thử lại sau giây lát)
          </p>
          <dl class="connection-error__checks">
            <div>
              <dt>Máy trạm</dt>
              <dd :class="connectionError.isOnline ? 'is-ok' : 'is-error'">
                <span class="auth-dot" :class="{ 'auth-dot--danger': !connectionError.isOnline }" />
                {{ connectionError.isOnline ? 'Sẵn sàng' : 'Mất mạng' }}
              </dd>
            </div>
            <div>
              <dt>Mạng nội bộ / VPN</dt>
              <dd class="is-muted"><span class="auth-dot" />{{ connectionErrorText.networkStatus }}</dd>
            </div>
            <div>
              <dt>Auth server</dt>
              <dd class="is-error"><span class="auth-dot auth-dot--danger" />{{ connectionErrorText.serverStatus }}</dd>
            </div>
          </dl>
        </div>

        <div class="connection-error__actions">
          <button type="button" class="auth-btn auth-btn--primary" :disabled="isLoading" @click="onSubmit">
            <AuthIcon :name="isLoading ? 'loader' : 'refresh'" :size="18" :class="{ 'auth-spin': isLoading }" />
            {{ isLoading ? 'Đang thử lại…' : 'Thử lại ngay' }}
          </button>
          <button type="button" class="auth-btn auth-btn--soft" :disabled="isLoading" @click="onCheckNetworkClick">
            <AuthIcon name="wifi" :size="18" />Kiểm tra trạng thái mạng
          </button>
          <button type="button" class="auth-btn auth-btn--link" :disabled="isLoading" @click="connectionError = null">
            <AuthIcon name="arrow-left" :size="18" />Quay lại
          </button>
        </div>
      </div>

      <div class="connection-error__help">
        <span><AuthIcon name="help-circle" :size="18" />Cần cấp quyền VPN nội bộ? Liên hệ IT Helpdesk ReShare: <strong>ext. 102</strong></span>
        <span class="auth-mono">Node: SGN-AUTH-03</span>
      </div>
    </section>

    <div v-else class="admin-login">
      <section class="admin-login__intro">
        <span class="auth-chip"><span class="auth-dot" />Cổng xác thực tập trung IAM</span>
        <h1>Hệ Thống Vận Hành ReShare</h1>
        <p class="admin-login__lead">
          Nền tảng kiểm soát chuỗi cung ứng, tiếp nhận tuần hoàn thời trang và định danh tài sản thời gian thực.
        </p>

        <div class="admin-login__showcase">
          <figure class="admin-login__hero">
            <img :src="heroImage" alt="Nhân sự ReShare phân loại hàng tại trạm xử lý" />
            <figcaption><AuthIcon name="network" :size="22" />Trạm xử lý trung tâm Tân Bình • 99.98% Sẵn sàng</figcaption>
          </figure>
          <dl class="admin-login__highlights">
            <div v-for="highlight in HIGHLIGHTS" :key="highlight.label">
              <dt>{{ highlight.label }}</dt>
              <dd class="auth-mono" :class="{ 'is-accent': highlight.isAccent }">{{ highlight.value }}</dd>
            </div>
          </dl>
        </div>

        <ul class="admin-login__badges">
          <li><AuthIcon name="shield" :size="18" />Mã hóa End-to-End</li>
          <li><AuthIcon name="shield-check" :size="18" />Tuân thủ Chính sách Nội bộ</li>
        </ul>
      </section>

      <section class="admin-login__card auth-card" aria-labelledby="admin-login-title">
        <div class="admin-login__card-body">
          <header class="admin-login__card-header">
            <div>
              <h2 id="admin-login-title">Đăng Nhập Quản Trị</h2>
              <p>Sử dụng tài khoản nhân sự ReShare cấp quyền</p>
            </div>
            <span class="admin-login__card-icon"><AuthIcon name="shield-check" :size="24" /></span>
          </header>

          <div v-if="hasInvalidCredentials" class="auth-alert auth-alert--error" role="alert">
            <AuthIcon name="alert-circle" :size="26" class="auth-alert__icon" />
            <div class="auth-alert__body">
              <div class="admin-login__alert-title">
                <strong class="auth-alert__title">Đăng nhập không thành công</strong>
                <span class="admin-login__alert-code auth-mono">Mã: ERR_AUTH_401</span>
              </div>
              <p>
                Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại thông tin hoặc sử dụng chức năng
                <RouterLink :to="{ name: ADMIN_ROUTE.forgotPassword }" class="auth-link">Quên mật khẩu</RouterLink>.
              </p>
            </div>
          </div>
          <div v-else-if="isSessionExpiredNotice" class="auth-alert auth-alert--warning" role="alert">
            <AuthIcon name="alert-triangle" :size="24" class="auth-alert__icon" />
            <div class="auth-alert__body">
              <strong class="auth-alert__title">Phiên đăng nhập đã hết hạn</strong>
              <p>Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.</p>
            </div>
          </div>
          <div v-if="notice" class="auth-alert auth-alert--info" role="status">
            <AuthIcon name="help-circle" :size="22" class="auth-alert__icon" />
            <p class="auth-alert__body">{{ notice }}</p>
          </div>

          <form class="admin-login__form" novalidate @submit.prevent="onSubmit">
            <fieldset :disabled="isLoading">
              <div class="auth-field">
                <div class="auth-field__label-row">
                  <label for="admin-email" class="auth-field__label">
                    Email nhân sự <span class="auth-field__required">*</span>
                  </label>
                  <span class="auth-field__hint auth-mono">SSO {{ ADMIN_EMAIL_DOMAIN }}</span>
                </div>
                <div class="auth-input" :class="{ 'is-invalid': emailMessage }">
                  <AuthIcon name="mail" />
                  <input
                    id="admin-email"
                    v-model="form.email"
                    type="email"
                    autocomplete="username"
                    :placeholder="`ten.nhanvien${ADMIN_EMAIL_DOMAIN}`"
                    :aria-invalid="Boolean(emailMessage)"
                    aria-describedby="admin-email-message"
                  />
                  <button
                    v-if="form.email"
                    type="button"
                    class="auth-input__action"
                    aria-label="Xóa email"
                    @click="form.email = ''"
                  >
                    <AuthIcon name="x-circle" />
                  </button>
                </div>
                <p v-if="emailMessage" id="admin-email-message" class="auth-field__message">
                  <AuthIcon name="alert-triangle" :size="16" />{{ emailMessage }}
                </p>
              </div>

              <div class="auth-field">
                <div class="auth-field__label-row">
                  <label for="admin-password" class="auth-field__label">
                    Mật khẩu bảo mật <span class="auth-field__required">*</span>
                  </label>
                  <RouterLink :to="{ name: ADMIN_ROUTE.forgotPassword }" class="auth-link">Quên mật khẩu?</RouterLink>
                </div>
                <div class="auth-input" :class="{ 'is-invalid': fieldErrors.password }">
                  <AuthIcon name="lock" />
                  <input
                    id="admin-password"
                    v-model="form.password"
                    :type="isPasswordVisible ? 'text' : 'password'"
                    autocomplete="current-password"
                    :placeholder="hasInvalidCredentials ? 'Nhập lại mật khẩu…' : 'Nhập mật khẩu'"
                    :aria-invalid="Boolean(fieldErrors.password)"
                    aria-describedby="admin-password-message"
                  />
                  <button
                    type="button"
                    class="auth-input__action"
                    :aria-label="isPasswordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                    :aria-pressed="isPasswordVisible"
                    @click="isPasswordVisible = !isPasswordVisible"
                  >
                    <AuthIcon :name="isPasswordVisible ? 'eye-off' : 'eye'" />
                  </button>
                </div>
                <p v-if="fieldErrors.password" id="admin-password-message" class="auth-field__message">
                  <AuthIcon name="alert-triangle" :size="16" />{{ fieldErrors.password }}
                </p>
                <p v-else-if="hasInvalidCredentials && !form.password" id="admin-password-message" class="auth-field__message">
                  <AuthIcon name="refresh" :size="16" />Trường mật khẩu đã được làm trống để nhập lại an toàn
                </p>
              </div>

              <div v-if="hasInvalidCredentials" class="admin-login__monitor">
                <AuthIcon name="badge-check" :size="22" class="auth-note__icon" />
                <div>
                  <div class="admin-login__monitor-header">
                    <span class="auth-note__title">Giám sát bảo mật IAM</span>
                    <span class="admin-login__monitor-count auth-mono">Còn {{ remainingAttempts }} lần thử</span>
                  </div>
                  <p>
                    Lưu ý: Tài khoản sẽ tạm khóa tự động sau <strong>{{ MAX_SIGN_IN_ATTEMPTS }} lần thử sai liên tiếp</strong>
                    để phòng vệ brute-force.
                  </p>
                  <div
                    class="admin-login__monitor-bar"
                    role="progressbar"
                    :aria-valuenow="failedAttempts"
                    aria-valuemin="0"
                    :aria-valuemax="MAX_SIGN_IN_ATTEMPTS"
                    aria-label="Số lần đăng nhập sai"
                  >
                    <span :style="{ width: `${(failedAttempts / MAX_SIGN_IN_ATTEMPTS) * 100}%` }" />
                  </div>
                </div>
              </div>

              <div class="admin-login__keep">
                <label>
                  <input v-model="form.keepSignedIn" type="checkbox" />
                  Duy trì phiên đăng nhập ({{ extendedSessionHours }} giờ làm việc)
                </label>
                <span class="auth-mono">{{ APP_VERSION }}</span>
              </div>

              <button type="submit" class="auth-btn auth-btn--primary" :disabled="isLoading || isLocked">
                <AuthIcon :name="isLoading ? 'loader' : 'log-in'" :class="{ 'auth-spin': isLoading }" />
                {{ submitLabel }}
              </button>

              <div class="admin-login__secondary">
                <button type="button" class="auth-btn auth-btn--soft" @click="onSsoClick">
                  <AuthIcon name="key" :size="18" />Đăng nhập SSO Google
                </button>
                <a
                  class="auth-btn auth-btn--soft"
                  :href="`mailto:${SUPPORT_EMAIL}?subject=Yêu cầu mở khóa tài khoản quản trị`"
                >
                  <AuthIcon name="help-circle" :size="18" />Yêu cầu mở khóa
                </a>
              </div>
            </fieldset>
          </form>
        </div>

        <footer class="admin-login__card-footer">
          <span><AuthIcon name="server" :size="18" />IP kiểm tra: <span class="auth-mono">118.69.182.44</span></span>
          <span><AuthIcon name="lock" :size="18" />Khóa phiên tự động: <span class="auth-mono">{{ sessionMinutes }}m</span></span>
        </footer>
      </section>
    </div>
  </AuthShell>
</template>

<style scoped>
.admin-login {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 640px);
  align-items: center;
  gap: 40px;
  width: 100%;
  max-width: 1720px;
  margin: 0 auto;
}

.admin-login__intro {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 18px;
  padding-left: 72px;
}

.admin-login__intro h1 {
  font-size: clamp(32px, 3.2vw, 48px);
  font-weight: 700;
  line-height: 1.2;
  color: var(--auth-primary);
}

.admin-login__lead {
  max-width: 820px;
  font-size: 20px;
  color: var(--auth-text-secondary);
}

.admin-login__showcase {
  width: 100%;
  max-width: 920px;
  margin-top: 18px;
  padding: 22px;
  border-radius: 20px;
  background: var(--auth-accent-soft);
}

.admin-login__hero {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
}

.admin-login__hero img {
  display: block;
  width: 100%;
  aspect-ratio: 874 / 360;
  object-fit: cover;
}

.admin-login__hero figcaption {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 40px 22px 18px;
  background: linear-gradient(transparent, rgb(20 60 30 / 0.85));
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}

.admin-login__highlights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.admin-login__highlights > div {
  padding: 12px 12px 14px;
  border-radius: 8px;
  background: var(--auth-surface);
}

.admin-login__highlights dt {
  font-size: 15px;
  font-weight: 500;
  color: var(--auth-text-secondary);
}

.admin-login__highlights dd {
  font-size: 22px;
  font-weight: 600;
}

.admin-login__highlights dd.is-accent {
  color: var(--auth-primary);
}

.admin-login__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
  margin-top: 30px;
  padding: 0;
  list-style: none;
  font-weight: 600;
  color: var(--auth-text-secondary);
}

.admin-login__badges li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.admin-login__badges li svg {
  color: var(--auth-primary);
}

.admin-login__card {
  overflow: hidden;
}

.admin-login__card-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 48px 46px 32px;
}

.admin-login__card-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.admin-login__card-header h2 {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.2;
}

.admin-login__card-header p {
  margin-top: 6px;
  font-size: 17px;
  color: var(--auth-text-secondary);
}

.admin-login__card-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 10px;
  background: var(--auth-accent-soft);
  color: var(--auth-primary);
}

.admin-login__alert-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.admin-login__alert-code {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.7);
  font-size: 13px;
  color: var(--auth-danger);
}

.admin-login__form fieldset {
  display: flex;
  flex-direction: column;
  gap: 22px;
  margin: 0;
  padding: 0;
  border: none;
  min-width: 0;
}

.admin-login__monitor {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--auth-accent-soft);
  color: var(--auth-text-secondary);
}

.admin-login__monitor > div {
  flex: 1;
}

.admin-login__monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.admin-login__monitor-count {
  padding: 2px 10px;
  border-radius: 4px;
  background: var(--auth-danger-soft);
  font-size: 13px;
  color: var(--auth-danger);
}

.admin-login__monitor-bar {
  height: 6px;
  margin-top: 10px;
  border-radius: 999px;
  background: #dde3f3;
  overflow: hidden;
}

.admin-login__monitor-bar span {
  display: block;
  height: 100%;
  background: var(--auth-danger);
  transition: width 0.2s;
}

.admin-login__keep {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: var(--auth-text-secondary);
}

.admin-login__keep label {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: var(--auth-tap);
  font-size: 17px;
  cursor: pointer;
}

.admin-login__keep input {
  width: 22px;
  height: 22px;
  accent-color: var(--auth-primary);
}

.admin-login__keep .auth-mono {
  font-size: 13px;
  color: var(--auth-text-tertiary);
}

.admin-login__secondary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: -6px;
}

.admin-login__secondary .auth-btn {
  min-height: 50px;
  font-size: 16px;
}

.admin-login__card-footer {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 18px 24px;
  background: #f6f7fb;
  font-size: 14px;
  font-weight: 600;
  color: var(--auth-text-secondary);
}

.admin-login__card-footer span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.connection-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
}

.connection-error__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 36px 44px 44px;
  text-align: center;
}

.connection-error__icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 136px;
  height: 136px;
  margin-bottom: 10px;
  border-radius: 50%;
  background: var(--auth-accent-soft);
  color: var(--auth-text-secondary);
}

.connection-error__icon-badge {
  position: absolute;
  right: -4px;
  bottom: 8px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--auth-danger);
  color: #fff;
  font-weight: 700;
  font-size: 20px;
}

.connection-error__card h1 {
  font-size: 34px;
  font-weight: 700;
}

.connection-error__message {
  max-width: 640px;
  font-size: 19px;
  color: var(--auth-text-secondary);
}

.connection-error__diagnostic {
  width: 100%;
  margin-top: 18px;
  padding: 20px 22px;
  border-radius: 12px;
  background: var(--auth-accent-soft);
  text-align: left;
}

.connection-error__diagnostic-header {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--auth-text-secondary);
}

.connection-error__diagnostic-header > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-transform: uppercase;
}

.connection-error__diagnostic-header .auth-mono {
  font-weight: 400;
}

.connection-error__code {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  font-size: 17px;
  color: var(--auth-danger);
}

.connection-error__checks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.connection-error__checks > div {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--auth-surface);
}

.connection-error__checks dt {
  font-size: 13px;
  text-transform: uppercase;
  color: var(--auth-text-secondary);
}

.connection-error__checks dd {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.connection-error__checks dd.is-ok {
  color: var(--auth-primary);
}

.connection-error__checks dd.is-error {
  color: var(--auth-danger);
}

.connection-error__checks dd.is-muted {
  color: var(--auth-text-secondary);
}

.connection-error__checks dd.is-muted .auth-dot {
  background: var(--auth-text-tertiary);
}

.connection-error__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  width: 100%;
  margin-top: 26px;
}

.connection-error__actions .auth-btn {
  min-height: 58px;
  font-size: 18px;
}

.connection-error__actions .auth-btn--primary,
.connection-error__actions .auth-btn--soft {
  flex: 1;
  min-width: 220px;
}

.connection-error__actions .auth-btn--soft {
  color: var(--auth-primary);
}

.connection-error__help {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  font-size: 17px;
  color: var(--auth-text-secondary);
}

.connection-error__help > span:first-child {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
}

.connection-error__help .auth-mono {
  font-size: 15px;
  color: var(--auth-text-tertiary);
}

@media (max-width: 1200px) {
  .admin-login {
    grid-template-columns: 1fr;
    max-width: 680px;
  }

  .admin-login__intro {
    padding-left: 0;
  }
}

@media (max-width: 640px) {
  .admin-login__card-body {
    padding: 32px 20px 24px;
  }

  .admin-login__card-header h2,
  .connection-error__card h1 {
    font-size: 26px;
  }

  .admin-login__highlights,
  .connection-error__checks,
  .admin-login__secondary {
    grid-template-columns: 1fr;
  }

  .connection-error__card {
    padding: 28px 20px 32px;
  }

  .connection-error__help {
    flex-direction: column;
  }
}
</style>
