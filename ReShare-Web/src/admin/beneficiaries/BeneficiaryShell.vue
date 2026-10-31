<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AdminChrome from '../AdminChrome.vue'
import { ADMIN_ROUTE, USER_ROLE } from '../auth/auth.constants'
import { currentUser, staffAssignment } from '../auth/auth.store'

const router = useRouter()
const role = computed(() => staffAssignment.value?.role === USER_ROLE.systemAdmin
  ? USER_ROLE.systemAdmin
  : USER_ROLE.warehouseAdmin)
const accountName = computed(() => currentUser.value?.displayName || 'Nhân sự được phân quyền')
const warehouseLabel = computed(() => {
  if (role.value === USER_ROLE.systemAdmin && !staffAssignment.value?.warehouseIds?.length) return 'Toàn hệ thống'
  const warehouseIds = staffAssignment.value?.warehouseIds || []
  if (warehouseIds.length === 1) return `Kho ${warehouseIds[0]}`
  return `${warehouseIds.length} kho được phân quyền`
})

function navigate(screen) {
  if (screen === 'B') router.push({ name: ADMIN_ROUTE.beneficiaryList })
  if (screen === 'E') router.push({ name: ADMIN_ROUTE.donationQueue })
}
</script>

<template>
  <AdminChrome
    screen="B"
    :role="role"
    :enabled-screens="['B', 'E']"
    :show-preview="false"
    :warehouse-label="warehouseLabel"
    :account-name="accountName"
    @navigate="navigate"
  >
    <slot />
  </AdminChrome>
</template>
