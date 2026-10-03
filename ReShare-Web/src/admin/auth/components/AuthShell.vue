<script setup>
import AuthIcon from './AuthIcon.vue'
import logoUrl from '../assets/reshare-logo.svg'
import { SUPPORT_EMAIL } from '../auth.constants'

defineProps({ showServerStatus: { type: Boolean, default: true } })

const currentYear = new Date().getFullYear()
</script>

<template>
  <div class="auth-shell">
    <header class="auth-shell__header">
      <div class="auth-shell__brand">
        <span class="auth-shell__logo">
          <img class="auth-shell__logo-mark" :src="logoUrl" alt="" />
          ReShare
          <span class="auth-shell__logo-tag">Portal</span>
        </span>
        <span class="auth-shell__title">
          <strong>ReShare</strong>
          <span>Portal quản trị hệ thống</span>
        </span>
      </div>
      <div class="auth-shell__meta">
        <span class="auth-shell__tls"><AuthIcon name="shield-check" :size="16" />Hệ thống bảo mật TLS 1.3</span>
        <span class="auth-shell__contact">
          <AuthIcon name="headset" :size="16" />Hỗ trợ kỹ thuật:
          <a class="auth-mono" :href="`mailto:${SUPPORT_EMAIL}`">{{ SUPPORT_EMAIL }}</a>
        </span>
        <span class="auth-shell__contact auth-shell__hotline">Hotline nội bộ: <span class="auth-mono">1900 6868</span></span>
      </div>
    </header>

    <main class="auth-shell__main">
      <slot />
    </main>

    <footer class="auth-shell__footer">
      <span>© {{ currentYear }} ReShare Operations System. Cổng thông tin nội bộ dành riêng cho nhân sự được phân quyền.</span>
      <span v-if="showServerStatus" class="auth-shell__server">
        <span class="auth-dot" />Hệ thống máy chủ: VN-SGN-01 (Ổn định)
      </span>
    </footer>
  </div>
</template>

<style>
/* Style dùng chung cho các màn auth Admin (tiền tố auth-). */
.auth-shell {
  --auth-primary: #1f6b2c;
  --auth-primary-hover: #18571f;
  --auth-primary-disabled: #8fae92;
  --auth-primary-soft: #e3f3e5;
  --auth-accent-soft: #eef1fb;
  --auth-bg: #f5f7fa;
  --auth-surface: #ffffff;
  --auth-border: #dde2ea;
  --auth-text: #1c2331;
  --auth-text-secondary: #4b5464;
  --auth-text-tertiary: #7b8392;
  --auth-danger: #c62828;
  --auth-danger-soft: #fdeceb;
  --auth-warning: #8a5a00;
  --auth-warning-soft: #fff4d6;
  --auth-radius: 12px;
  --auth-shadow: 0 10px 30px rgb(28 35 49 / 0.08), 0 2px 6px rgb(28 35 49 / 0.04);
  --auth-tap: 44px;

  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(40rem 30rem at 0% 45%, rgb(155 225 160 / 0.18), transparent 70%),
    radial-gradient(40rem 30rem at 100% 85%, rgb(155 225 160 / 0.16), transparent 70%),
    var(--auth-bg);
  color: var(--auth-text);
  font-family: 'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.5;
}

:where(.auth-shell) *,
:where(.auth-shell) *::before,
:where(.auth-shell) *::after {
  box-sizing: border-box;
}

/* :where() giữ độ ưu tiên = 0 để không đè lên class của component */
:where(.auth-shell) :where(h1, h2, p, dl, dd, ul, figure) {
  margin: 0;
}

:where(.auth-shell) :where(button, input) {
  font: inherit;
  color: inherit;
}

.auth-shell :focus-visible {
  outline: 3px solid rgb(31 107 44 / 0.35);
  outline-offset: 2px;
}

.auth-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 40px;
  background: var(--auth-surface);
  border-bottom: 1px solid var(--auth-border);
}

.auth-shell__brand {
  display: flex;
  align-items: center;
  gap: 28px;
}

.auth-shell__logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: var(--auth-primary);
}

.auth-shell__logo-mark {
  width: 36px;
  height: 36px;
}

.auth-shell__logo-tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--auth-primary-soft);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.auth-shell__title {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.auth-shell__title strong {
  font-size: 20px;
  color: var(--auth-primary);
}

.auth-shell__title span {
  font-size: 13px;
  text-transform: uppercase;
  color: var(--auth-text-secondary);
}

.auth-shell__meta {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 14px;
  font-weight: 500;
}

.auth-shell__tls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--auth-accent-soft);
}

.auth-shell__contact {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.auth-shell__contact a,
.auth-shell__hotline .auth-mono {
  color: var(--auth-primary);
  text-decoration: none;
}

.auth-shell__hotline {
  padding-left: 16px;
  border-left: 1px solid var(--auth-border);
}

.auth-shell__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48px 40px;
}

.auth-shell__footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 32px;
  background: var(--auth-surface);
  font-size: 14px;
  color: var(--auth-text-secondary);
}

.auth-shell__server {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

/* --- Thành phần dùng chung --- */
.auth-mono {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.auth-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--auth-primary);
  flex-shrink: 0;
}

.auth-dot--danger {
  background: var(--auth-danger);
}

.auth-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--auth-accent-soft);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--auth-text-secondary);
}

.auth-chip--danger {
  background: var(--auth-danger-soft);
  color: var(--auth-danger);
}

.auth-card {
  background: var(--auth-surface);
  border-radius: 20px;
  box-shadow: var(--auth-shadow);
}

.auth-card--accent-top {
  overflow: hidden;
  border-top: 8px solid transparent;
  border-image: linear-gradient(90deg, var(--auth-primary), #9be2a0) 1;
}

.auth-card--danger-top {
  overflow: hidden;
  border-top: 8px solid transparent;
  border-image: linear-gradient(90deg, #e57373, var(--auth-danger), #e57373) 1;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.auth-field__label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.auth-field__label {
  font-weight: 500;
  font-size: 16px;
}

.auth-field__required {
  color: var(--auth-danger);
}

.auth-field__hint {
  font-size: 13px;
  color: var(--auth-text-tertiary);
}

.auth-input {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 54px;
  padding: 0 6px 0 16px;
  border: 1.5px solid var(--auth-border);
  border-radius: 10px;
  background: var(--auth-surface);
  color: var(--auth-text-tertiary);
}

.auth-input:focus-within {
  border-color: var(--auth-primary);
  box-shadow: 0 0 0 1px var(--auth-primary);
}

.auth-input.is-invalid {
  border-color: var(--auth-danger);
  color: var(--auth-danger);
  box-shadow: none;
}

.auth-input input {
  flex: 1;
  min-width: 0;
  height: 50px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 16px;
  color: var(--auth-text);
}

.auth-input input::placeholder {
  color: var(--auth-text-tertiary);
}

.auth-input__action {
  display: grid;
  place-items: center;
  width: var(--auth-tap);
  height: var(--auth-tap);
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--auth-text-secondary);
  cursor: pointer;
}

.auth-field__message {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--auth-danger);
}

.auth-field__message--muted {
  color: var(--auth-text-secondary);
  font-weight: 600;
}

.auth-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: var(--auth-tap);
  padding: 0 18px;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.auth-btn:disabled {
  cursor: not-allowed;
}

.auth-btn--primary {
  min-height: 56px;
  background: var(--auth-primary);
  color: #fff;
  font-size: 17px;
}

.auth-btn--primary:hover:not(:disabled) {
  background: var(--auth-primary-hover);
}

.auth-btn--primary:disabled {
  background: var(--auth-primary-disabled);
}

.auth-btn--soft {
  background: var(--auth-accent-soft);
  color: var(--auth-text);
}

.auth-btn--soft:hover:not(:disabled) {
  background: #e2e7f7;
}

.auth-btn--link {
  background: none;
  color: var(--auth-primary);
  font-size: 17px;
  font-weight: 500;
}

.auth-link {
  color: var(--auth-primary);
  font-weight: 600;
}

.auth-alert {
  display: flex;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 10px;
  border-left: 5px solid currentColor;
}

.auth-alert--error {
  background: var(--auth-danger-soft);
  color: var(--auth-danger);
}

.auth-alert--warning {
  background: var(--auth-warning-soft);
  color: var(--auth-warning);
}

.auth-alert--info {
  background: var(--auth-accent-soft);
  color: var(--auth-primary);
}

.auth-alert__icon {
  flex-shrink: 0;
}

.auth-alert__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--auth-text);
}

.auth-alert__title {
  font-size: 17px;
  font-weight: 700;
  color: inherit;
}

.auth-alert--error .auth-alert__title,
.auth-alert--warning .auth-alert__title {
  color: currentColor;
}

.auth-note {
  display: flex;
  gap: 12px;
  padding: 18px 20px;
  border-radius: 12px;
  background: var(--auth-accent-soft);
  color: var(--auth-text-secondary);
}

.auth-note__icon {
  flex-shrink: 0;
  color: var(--auth-primary);
}

.auth-note__title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--auth-primary);
}

.auth-spin {
  animation: auth-spin 1s linear infinite;
}

@keyframes auth-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1100px) {
  .auth-shell__meta .auth-shell__contact {
    display: none;
  }
}

@media (max-width: 720px) {
  .auth-shell__header,
  .auth-shell__main {
    padding-left: 16px;
    padding-right: 16px;
  }

  .auth-shell__title,
  .auth-shell__meta {
    display: none;
  }

  .auth-shell__footer {
    flex-direction: column;
    padding: 16px;
  }
}
</style>
