<script setup>
import { ref } from 'vue'
import logo from '../assets/logo.png'

const email = ref('')

const footerLinks = [
  { label: 'ReShare là gì', href: '#about' },
  { label: 'Cách hoạt động', href: '#how-it-works' },
  { label: 'Công nghệ AI', href: '#ai-tech' },
  { label: 'Tính năng', href: '#features' },
  { label: 'Giá trị', href: '#values' },
]

function sendNewsletterRequest() {
  const subject = encodeURIComponent('Đăng ký nhận tin ReShare')
  const body = encodeURIComponent(`Vui lòng đăng ký nhận tin cho địa chỉ email: ${email.value}`)
  window.location.href = `mailto:hello@reshare.vn?subject=${subject}&body=${body}`
}
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
          <a class="footer-contact-link" href="mailto:hello@reshare.vn">
            <span aria-hidden="true">✉</span> hello@reshare.vn
          </a>
          <span class="footer-contact-link">
            <span aria-hidden="true">⌖</span> Việt Nam
          </span>
        </div>
        <div class="footer-newsletter">
          <h2>Nhận tin từ ReShare</h2>
          <p>Theo dõi câu chuyện cộng đồng và các nhu cầu mới.</p>
          <form class="newsletter-form" @submit.prevent="sendNewsletterRequest">
            <label class="visually-hidden" for="newsletter-email">Email của bạn</label>
            <input
              id="newsletter-email"
              v-model="email"
              type="email"
              name="email"
              autocomplete="email"
              placeholder="Email của bạn"
              required
            />
            <button class="newsletter-submit" type="submit" aria-label="Gửi yêu cầu đăng ký nhận tin">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" /></svg>
            </button>
          </form>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© 2026 ReShare. Cùng trao đúng, chia sẻ bền lâu.</span>
        <span>Chính sách quyền riêng tư · Cổng nội bộ</span>
      </div>
    </div>
  </footer>
</template>
