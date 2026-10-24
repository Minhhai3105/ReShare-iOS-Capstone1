<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import logo from '../assets/logo.png'

const menuOpen = ref(false)
const moreMenu = ref(null)
const links = [
  { label: 'Trang chủ', href: '#home' },
  { label: 'ReShare là gì', href: '#about' },
  { label: 'Cách hoạt động', href: '#how-it-works' },
  { label: 'Công nghệ AI', href: '#ai-tech' },
  { label: 'Tính năng', href: '#features' },
  { label: 'Giá trị', href: '#values' },
  { label: 'Điểm tiếp nhận', href: '#collection-points' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Liên hệ', href: '#contact' },
]
const primaryHrefs = new Set(['#about', '#how-it-works', '#features', '#collection-points', '#faq'])
const primaryLinks = links.filter((link) => primaryHrefs.has(link.href))
const moreLinks = links.filter((link) => !primaryHrefs.has(link.href))

function closeMenu() {
  menuOpen.value = false
}

function closeMoreMenu() {
  moreMenu.value?.removeAttribute('open')
}

function closeMoreOnOutsideClick(event) {
  if (moreMenu.value?.open && !moreMenu.value.contains(event.target)) closeMoreMenu()
}

function closeMoreOnEscape(event) {
  if (event.key !== 'Escape' || !moreMenu.value?.open) return
  closeMoreMenu()
  moreMenu.value.querySelector('summary')?.focus()
}

onMounted(() => {
  document.addEventListener('pointerdown', closeMoreOnOutsideClick)
  document.addEventListener('keydown', closeMoreOnEscape)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', closeMoreOnOutsideClick)
  document.removeEventListener('keydown', closeMoreOnEscape)
})
</script>

<template>
  <header class="landing-header">
    <div class="landing-container landing-header__inner">
      <a class="brand" href="#home" aria-label="ReShare — về đầu trang" @click="closeMenu">
        <img :src="logo" alt="" />
        <span>ReShare</span>
      </a>

      <nav class="landing-nav landing-nav--desktop" aria-label="Điều hướng chính">
        <a v-for="link in primaryLinks" :key="link.href" :href="link.href">
          {{ link.label }}
        </a>
        <details ref="moreMenu" class="landing-more">
          <summary>Thêm</summary>
          <div class="landing-more__list">
            <a v-for="link in moreLinks" :key="link.href" :href="link.href" @click="closeMoreMenu">
              {{ link.label }}
            </a>
          </div>
        </details>
      </nav>

      <button
        class="menu-toggle"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="landing-navigation"
        :aria-label="menuOpen ? 'Đóng menu' : 'Mở menu'"
        @click="menuOpen = !menuOpen"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <nav
        id="landing-navigation"
        class="landing-nav landing-nav--mobile"
        :class="{ 'landing-nav--open': menuOpen }"
        aria-label="Điều hướng di động"
      >
        <a v-for="link in links" :key="link.href" :href="link.href" @click="closeMenu">
          {{ link.label }}
        </a>
        <a class="landing-nav__preview" href="#preview" @click="closeMenu">Khám phá ReShare</a>
      </nav>

      <a class="button button--small header-cta" href="#preview">Khám phá ReShare</a>
    </div>
  </header>
</template>
