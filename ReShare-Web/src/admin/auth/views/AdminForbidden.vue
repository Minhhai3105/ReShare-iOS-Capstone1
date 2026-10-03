<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import AuthIcon from '../components/AuthIcon.vue'
import AuthAccountInfo from '../components/AuthAccountInfo.vue'
import { currentUser, staffAssignment, signOut } from '../auth.store'
import { ADMIN_ROUTE, FORBIDDEN_REASON } from '../auth.constants'

const FORBIDDEN_CONTENT = {
  [FORBIDDEN_REASON.notStaff]: {
    title: 'Không có quyền truy cập Web Admin',
    message: 'Tài khoản đã xác thực nhưng chưa được cấp quyền nhân sự. Liên hệ Quản trị hệ thống nếu bạn cần quyền truy cập.',
  },
  [FORBIDDEN_REASON.revoked]: {
    title: 'Quyền nhân sự đã bị thu hồi',
    message: 'Quyền quản trị của tài khoản đã bị thu hồi hoặc tạm khóa. Liên hệ Quản trị hệ thống để được cấp lại.',
  },
  [FORBIDDEN_REASON.role]: {
    title: 'Vai trò không đủ quyền',
    message: 'Vai trò hiện tại của bạn không được phép mở chức năng này.',
  },
  [FORBIDDEN_REASON.warehouse]: {
    title: 'Không có quyền với kho này',
    message: 'Bạn không được phân công kho này nên không thể xem dữ liệu của kho.',
  },
}

const route = useRoute()
const router = useRouter()

const content = computed(() => FORBIDDEN_CONTENT[route.query.reason] ?? FORBIDDEN_CONTENT[FORBIDDEN_REASON.notStaff])
// Nhân sự còn hiệu lực chỉ bị chặn một chức năng/kho thì vẫn quay về được trang quản trị.
const canReturnHome = computed(() => [FORBIDDEN_REASON.role, FORBIDDEN_REASON.warehouse].includes(route.query.reason))

function onSignOutClick() {
  signOut()
  router.replace({ name: ADMIN_ROUTE.login })
}
</script>

<template>
  <AuthShell>
    <section class="admin-forbidden" aria-labelledby="admin-forbidden-title">
      <span class="auth-chip auth-chip--danger"><span class="auth-dot auth-dot--danger" />Truy cập bị từ chối</span>

      <div class="admin-forbidden__card auth-card auth-card--danger-top">
        <span class="admin-forbidden__icon"><AuthIcon name="shield" :size="44" /></span>
        <p class="admin-forbidden__code auth-mono">403 · FORBIDDEN</p>
        <h1 id="admin-forbidden-title">{{ content.title }}</h1>
        <p class="admin-forbidden__message">{{ content.message }}</p>

        <AuthAccountInfo
          v-if="currentUser"
          :user="currentUser"
          :assignment="staffAssignment"
          class="admin-forbidden__account"
        />

        <RouterLink
          v-if="canReturnHome"
          :to="{ name: ADMIN_ROUTE.home }"
          class="auth-btn auth-btn--soft admin-forbidden__action"
        >
          <AuthIcon name="arrow-left" />Về trang quản trị
        </RouterLink>
        <button type="button" class="auth-btn auth-btn--primary admin-forbidden__action" @click="onSignOutClick">
          <AuthIcon name="log-out" />Đăng xuất
        </button>
      </div>
    </section>
  </AuthShell>
</template>

<style scoped>
.admin-forbidden {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
}

.admin-forbidden__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 36px 44px 40px;
  text-align: center;
}

.admin-forbidden__icon {
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
  border-radius: 50%;
  background: var(--auth-danger-soft);
  color: var(--auth-danger);
}

.admin-forbidden__code {
  color: var(--auth-text-tertiary);
}

.admin-forbidden h1 {
  font-size: 30px;
  font-weight: 700;
}

.admin-forbidden__message {
  font-size: 17px;
  color: var(--auth-text-secondary);
}

.admin-forbidden__account {
  width: 100%;
  margin-top: 12px;
  text-align: left;
}

.admin-forbidden__action {
  width: 100%;
  margin-top: 8px;
}

@media (max-width: 640px) {
  .admin-forbidden__card {
    padding: 28px 20px 32px;
  }

  .admin-forbidden h1 {
    font-size: 24px;
  }
}
</style>
