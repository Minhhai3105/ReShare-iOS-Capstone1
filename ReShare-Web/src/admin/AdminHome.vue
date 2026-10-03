<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from './auth/components/AuthShell.vue'
import AuthIcon from './auth/components/AuthIcon.vue'
import AuthAccountInfo from './auth/components/AuthAccountInfo.vue'
import { currentUser, signOut, staffAssignment } from './auth/auth.store'
import { ADMIN_ROUTE, USER_ROLE } from './auth/auth.constants'

const router = useRouter()

const warehousesLabel = computed(() =>
  staffAssignment.value.role === USER_ROLE.systemAdmin ? 'Toàn hệ thống' : staffAssignment.value.warehouseIds.join(', '),
)

async function onSignOutClick() {
  await signOut()
  router.replace({ name: ADMIN_ROUTE.login })
}
</script>

<template>
  <AuthShell>
    <section v-if="currentUser && staffAssignment" class="admin-home auth-card" aria-labelledby="admin-home-title">
      <span class="admin-home__icon"><AuthIcon name="badge-check" :size="36" /></span>
      <h1 id="admin-home-title">Đăng nhập thành công</h1>
      <p class="admin-home__message">Trang tạm sau đăng nhập. Tổng quan và chọn kho sẽ có ở story sau.</p>

      <AuthAccountInfo :user="currentUser" :assignment="staffAssignment" class="admin-home__account">
        <div>
          <dt>Kho được giao</dt>
          <dd class="auth-mono">{{ warehousesLabel }}</dd>
        </div>
      </AuthAccountInfo>

      <button type="button" class="auth-btn auth-btn--primary admin-home__sign-out" @click="onSignOutClick">
        <AuthIcon name="log-out" />Đăng xuất
      </button>
    </section>
  </AuthShell>
</template>

<style scoped>
.admin-home {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 44px;
  text-align: center;
}

.admin-home__icon {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--auth-primary-soft);
  color: var(--auth-primary);
}

.admin-home h1 {
  font-size: 28px;
  font-weight: 700;
}

.admin-home__message {
  color: var(--auth-text-secondary);
}

.admin-home__account {
  width: 100%;
  margin-top: 12px;
  text-align: left;
}

.admin-home__sign-out {
  width: 100%;
  margin-top: 16px;
}

@media (max-width: 640px) {
  .admin-home {
    padding: 28px 20px;
  }
}
</style>
