<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '../auth/components/AuthShell.vue'
import { ADMIN_ROUTE, USER_ROLE } from '../auth/auth.constants.js'
import { currentUser, signOut, staffAssignment } from '../auth/auth.store.js'
import ContactInboxContent from './ContactInboxContent.vue'
import { useContactInbox } from './useContactInbox.js'

const router = useRouter()
const inbox = useContactInbox()
const canRead = computed(() => Boolean(currentUser.value && staffAssignment.value?.active === true && staffAssignment.value.role === USER_ROLE.systemAdmin))

watch(() => [currentUser.value?.id, staffAssignment.value?.role, staffAssignment.value?.active], () => {
  if (canRead.value) inbox.refresh()
  else inbox.clear()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(inbox.clear)

async function loginAgain() {
  await signOut()
  router.replace({ name: ADMIN_ROUTE.login, query: { redirect: '/admin/contacts' } })
}
</script>

<template>
  <AuthShell>
    <ContactInboxContent
      v-if="canRead"
      :state="inbox.state"
      @refresh="inbox.refresh"
      @next="inbox.next"
      @previous="inbox.previous"
      @select="inbox.select"
      @login="loginAgain"
      @home="router.push({ name: ADMIN_ROUTE.home })"
    >
      <template #navigation>
        <RouterLink :to="{ name: ADMIN_ROUTE.home }">Tổng quan</RouterLink>
      </template>
    </ContactInboxContent>
    <section v-else class="auth-card contact-denied" aria-labelledby="contact-denied-title">
      <h1 id="contact-denied-title">Bạn không có quyền xem liên hệ</h1>
      <p>Hộp thư này dành cho Quản trị hệ thống đang hoạt động.</p>
      <RouterLink :to="{ name: ADMIN_ROUTE.home }">Về tổng quan</RouterLink>
    </section>
  </AuthShell>
</template>

<style scoped>
.contact-denied { width: min(720px, 100%); margin: auto; padding: 32px; }
.contact-denied p { margin: 12px 0 24px; color: var(--auth-text-secondary); }
.contact-denied a { color: var(--auth-primary); }
</style>
