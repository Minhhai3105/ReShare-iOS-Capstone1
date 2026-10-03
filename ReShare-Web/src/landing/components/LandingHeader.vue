<script setup>
import { ref } from 'vue'
import logo from '../assets/logo.png'

const menuOpen = ref(false)
const links = [
  { label: 'Trang chủ', href: '#home' },
  { label: 'ReShare là gì', href: '#about' },
  { label: 'Cách hoạt động', href: '#how-it-works' },
  { label: 'Công nghệ AI', href: '#ai-tech' },
  { label: 'Tính năng', href: '#features' },
  { label: 'Giá trị', href: '#values' },
]

function closeMenu() {
  menuOpen.value = false
}
</script>

<template>
  <header class="landing-header">
    <div class="landing-container landing-header__inner">
      <a class="brand" href="#home" aria-label="ReShare — về đầu trang" @click="closeMenu">
        <img :src="logo" alt="" />
        <span>ReShare</span>
      </a>

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
        class="landing-nav"
        :class="{ 'landing-nav--open': menuOpen }"
        aria-label="Điều hướng chính"
      >
        <a v-for="link in links" :key="link.href" :href="link.href" @click="closeMenu">
          {{ link.label }}
        </a>
      </nav>

      <a class="button button--small header-cta" href="#preview">Khám phá ReShare</a>
    </div>
  </header>
</template>
