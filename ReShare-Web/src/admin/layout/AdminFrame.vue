<script setup>
// Thay cho AuthShell ở các trang nghiệp vụ: trong khung quản trị chỉ hiển thị nội dung trang,
// ngoài khung (route xem thử) giữ nguyên AuthShell như trước.
import AuthShell from '../auth/components/AuthShell.vue'
import { useInAdminShell } from './adminShell'

defineOptions({ inheritAttrs: false })
const inShell = useInAdminShell()
</script>

<template>
  <div v-if="inShell" class="admin-page"><slot /></div>
  <AuthShell v-else v-bind="$attrs"><slot /></AuthShell>
</template>
