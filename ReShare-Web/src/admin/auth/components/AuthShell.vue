<script setup>
import AuthIcon from './AuthIcon.vue'
import logoUrl from '../assets/reshare-logo.png'

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
        <span class="auth-shell__tls"><AuthIcon name="shield-check" :size="16" />Truy cập theo vai trò được cấp</span>
        <span class="auth-shell__contact">
          <AuthIcon name="headset" :size="16" />Liên hệ người quản trị hệ thống để được hỗ trợ
        </span>
      </div>
    </header>

    <main class="auth-shell__main">
      <slot />
    </main>

    <footer class="auth-shell__footer">
      <span>© {{ currentYear }} ReShare Operations System. Cổng thông tin nội bộ dành riêng cho nhân sự được phân quyền.</span>
      <span v-if="showServerStatus" class="auth-shell__server">
        <span class="auth-dot" />Xác thực qua Firebase Authentication
      </span>
    </footer>
  </div>
</template>

<style src="../auth-theme.css"></style>
