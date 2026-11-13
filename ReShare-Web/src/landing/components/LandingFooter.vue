<script setup>
import logo from '../assets/logo.png'
import { LEGAL_CONTACT_EMAIL, PRIVACY_POLICY_PATH, TERMS_OF_USE_PATH } from '../legal.js'

const footerLinks = [
  { label: 'ReShare là gì', href: '#about' },
  { label: 'Cách hoạt động', href: '#how-it-works' },
  { label: 'Công nghệ AI', href: '#ai-tech' },
  { label: 'Tính năng', href: '#features' },
  { label: 'Giá trị', href: '#values' },
  { label: 'Điểm tiếp nhận', href: '#collection-points' },
  { label: 'Câu hỏi thường gặp', href: '#faq' },
  { label: 'Liên hệ', href: '#contact' },
]

</script>

<template>
  <footer class="landing-footer">
    <div class="landing-container">
      <div class="footer-main">
        <div class="footer-about">
          <a class="brand brand--footer" href="#home">
            <img :src="logo" alt="" />
            <span>ReShare</span>
          </a>
          <p>Chia sẻ giá trị. Kết nối cộng đồng.</p>
        </div>
        <div class="footer-column">
          <h2>Khám phá</h2>
          <a v-for="link in footerLinks" :key="link.href" :href="link.href">{{ link.label }}</a>
        </div>
        <div class="footer-column footer-contact">
          <h2>Kết nối</h2>
          <a class="footer-contact-link" :href="`mailto:${LEGAL_CONTACT_EMAIL}`">{{ LEGAL_CONTACT_EMAIL }}</a>
          <a class="footer-contact-link" href="#contact">Gửi liên hệ</a>
          <span class="footer-contact-link">
            <span aria-hidden="true">⌖</span> Việt Nam
          </span>
        </div>
        <div class="footer-newsletter">
          <h2>Cập nhật từ ReShare</h2>
          <p>Điểm tiếp nhận sẽ được công bố khi dự án sẵn sàng vận hành.</p>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© 2026 ReShare. Cùng trao đúng, chia sẻ bền lâu.</span>
        <span><RouterLink :to="PRIVACY_POLICY_PATH">Chính sách quyền riêng tư</RouterLink> · <RouterLink :to="TERMS_OF_USE_PATH">Điều khoản sử dụng</RouterLink> · Cổng nội bộ</span>
      </div>
    </div>
  </footer>
</template>
