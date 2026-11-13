<script setup>
// Khung chung cho các trang pháp lý công khai (Chính sách quyền riêng tư, Điều khoản sử dụng):
// header gọn có đường về trang chủ, nội dung dạng văn bản, footer có liên hệ. App iOS mở các
// trang này qua đường dẫn cố định nên đừng đổi path trong router.
import logo from './assets/logo.png'
import { LEGAL_CONTACT_EMAIL, LEGAL_LINKS } from './legal.js'

defineProps({
  title: { type: String, required: true },
  effectiveDate: { type: String, required: true },
})
</script>

<template>
  <div class="landing-page legal-page">
    <header class="legal-header">
      <div class="landing-container legal-header__inner">
        <RouterLink class="brand" to="/">
          <img :src="logo" alt="" />
          <span>ReShare</span>
        </RouterLink>
        <RouterLink class="legal-header__home" to="/">← Về trang chủ</RouterLink>
      </div>
    </header>

    <main class="landing-container legal-main">
      <h1>{{ title }}</h1>
      <p class="legal-meta">Có hiệu lực từ {{ effectiveDate }}</p>
      <article class="legal-body">
        <slot />
      </article>
    </main>

    <footer class="legal-footer">
      <div class="landing-container legal-footer__inner">
        <span>© 2026 ReShare · Đồ án Capstone của nhóm C1SE.49</span>
        <nav aria-label="Trang pháp lý">
          <RouterLink v-for="link in LEGAL_LINKS" :key="link.to" :to="link.to">{{ link.label }}</RouterLink>
          <a :href="`mailto:${LEGAL_CONTACT_EMAIL}`">{{ LEGAL_CONTACT_EMAIL }}</a>
        </nav>
      </div>
    </footer>
  </div>
</template>

<!-- landing.css đã nằm trong bundle chính (LandingPage import tĩnh trong router), không import lại. -->
<style scoped>
.legal-header { border-bottom: 1px solid var(--line); background: var(--paper); }
.legal-header__inner { display: flex; align-items: center; justify-content: space-between; min-height: 72px; }
.legal-header__home { color: var(--green); font-weight: 600; text-decoration: none; }
.legal-main { max-width: 820px; padding-top: 40px; padding-bottom: 64px; }
.legal-main h1 { font-family: var(--display); font-size: clamp(28px, 4vw, 40px); color: var(--ink); margin: 0 0 8px; }
.legal-meta { color: var(--body); margin: 0 0 28px; }
.legal-body :deep(h2) { font-family: var(--display); font-size: 20px; color: var(--ink); margin: 32px 0 10px; }
.legal-body :deep(p), .legal-body :deep(li) { color: #3d4f48; line-height: 1.7; }
.legal-body :deep(ul) { padding-left: 22px; }
.legal-body :deep(a) { color: var(--green); }
.legal-body :deep(.legal-note) { padding: 14px 16px; border-radius: 12px; background: var(--mint); color: var(--ink); }
.legal-footer { border-top: 1px solid var(--line); background: var(--mint); }
.legal-footer__inner { display: flex; flex-wrap: wrap; gap: 12px 24px; justify-content: space-between; padding-top: 20px; padding-bottom: 20px; color: var(--body); font-size: 14px; }
.legal-footer nav { display: flex; flex-wrap: wrap; gap: 8px 18px; }
.legal-footer a { color: var(--green); text-decoration: none; }
@media (max-width: 640px) {
  .legal-main { padding-top: 28px; }
  .legal-footer__inner { flex-direction: column; }
}
</style>
