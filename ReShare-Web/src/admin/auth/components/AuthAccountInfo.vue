<script setup>
import { computed } from 'vue'
import { USER_ROLE_LABEL } from '../auth.constants'

const props = defineProps({
  user: { type: Object, required: true },
  assignment: { type: Object, default: null },
})

const roleLabel = computed(() => {
  if (!props.assignment) return 'Chưa được cấp quyền nhân sự'
  const label = USER_ROLE_LABEL[props.assignment.role] ?? props.assignment.role
  return props.assignment.active ? label : `${label} (đã thu hồi)`
})
</script>

<template>
  <dl class="auth-account-info">
    <div>
      <dt>Họ tên</dt>
      <dd>{{ user.displayName }}</dd>
    </div>
    <div>
      <dt>Email</dt>
      <dd class="auth-mono">{{ user.email }}</dd>
    </div>
    <div>
      <dt>Vai trò hiện tại</dt>
      <dd><span class="auth-account-info__role">{{ roleLabel }}</span></dd>
    </div>
    <slot />
  </dl>
</template>

<style>
.auth-account-info {
  display: flex;
  flex-direction: column;
  padding: 6px 20px;
  border-radius: 12px;
  background: var(--auth-accent-soft);
}

.auth-account-info > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--auth-border);
}

.auth-account-info > div:last-child {
  border-bottom: none;
}

.auth-account-info dt {
  color: var(--auth-text-secondary);
}

.auth-account-info dd {
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}

.auth-account-info__role {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--auth-primary-soft);
  color: var(--auth-primary);
  font-size: 14px;
}
</style>
