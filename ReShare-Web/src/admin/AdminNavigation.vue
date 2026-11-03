<script setup>
import { computed } from 'vue'
import AuthIcon from './auth/components/AuthIcon.vue'
import { adminNavigation } from './navigation.js'

const props = defineProps({ role: String, vertical: Boolean, mobileOnly: Boolean })
const entries = computed(() => adminNavigation(props.role))
</script>

<template>
  <nav v-if="entries.length" class="admin-navigation" :class="{ 'admin-navigation--vertical': vertical, 'admin-navigation--mobile-only': mobileOnly }" aria-label="Điều hướng quản trị">
    <RouterLink v-for="entry in entries" :key="entry.key" :to="entry.to" active-class="admin-navigation__active">
      <AuthIcon :name="entry.authIcon" :size="17" />{{ entry.label }}
    </RouterLink>
    <span class="admin-navigation__pending" aria-disabled="true">Nhật ký · Chưa hỗ trợ</span>
    <span class="admin-navigation__pending" aria-disabled="true">Cấu hình · Chưa hỗ trợ</span>
  </nav>
</template>

<style scoped>
.admin-navigation { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 24px; background: #fff; border-bottom: 1px solid #e5e8ef; }
.admin-navigation a { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 12px; border-radius: 8px; color: #40514a; text-decoration: none; font-size: 14px; }
.admin-navigation a:hover, .admin-navigation__active { background: #e3f3e5; color: #18571f !important; }
.admin-navigation a:focus-visible { outline: 3px solid #2d6a4f; outline-offset: 2px; }
.admin-navigation__pending { align-self: center; padding: 8px; color: #68756e; font-size: 12px; }
.admin-navigation--vertical { flex-direction: column; padding: 0; border: 0; }
.admin-navigation--mobile-only { display: none; }
@media (max-width: 760px) { .admin-navigation { padding: 8px 12px; } .admin-navigation--mobile-only { display: flex; } }
</style>
