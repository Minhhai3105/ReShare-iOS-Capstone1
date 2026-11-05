<script setup>
// Khung quản trị dùng chung cho mọi trang sau đăng nhập: sidebar cố định (thu gọn được) và thanh trên cùng.
import { computed, provide, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AuthIcon from '../auth/components/AuthIcon.vue'
import logoUrl from '../auth/assets/reshare-logo.png'
import { ADMIN_ROUTE, USER_ROLE_LABEL } from '../auth/auth.constants'
import { currentUser, signOut, staffAssignment } from '../auth/auth.store'
import { ADMIN_SHELL_KEY } from './adminShell'
import { canGoBackInHistory, pageFor, parentLocation, visibleSections } from './admin.navigation'
import '../auth/auth-theme.css'

provide(ADMIN_SHELL_KEY, true)

const COLLAPSED_KEY = 'reshare.admin.sidebarCollapsed'
const route = useRoute()
const router = useRouter()

function readCollapsed() {
  try { return window.localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false }
}

const collapsed = ref(readCollapsed())
const mobileOpen = ref(false)

watch(collapsed, (value) => {
  try { window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0') } catch { /* trình duyệt chặn lưu trữ: chỉ mất ghi nhớ */ }
})
// Đổi trang thì đóng menu trượt trên điện thoại.
watch(() => route.fullPath, () => { mobileOpen.value = false })

const role = computed(() => staffAssignment.value?.role ?? '')
const sections = computed(() => visibleSections(role.value))
const page = computed(() => pageFor(route.name))
const activeSection = computed(() => page.value?.section ?? null)
// Vị trí hiện tại: mục trên sidebar, kèm tên trang con nếu khác mục (không lặp tiêu đề lớn của trang).
const crumbs = computed(() => {
  const current = sections.value.find((section) => section.key === activeSection.value)
  if (!current) return [{ label: page.value?.title ?? 'Quản trị' }]
  const isSectionRoot = current.to.name === route.name
  return isSectionRoot ? [{ label: current.label }] : [{ label: current.label, to: current.to }, { label: page.value.title }]
})
const showBack = computed(() => route.name !== ADMIN_ROUTE.home)
const roleLabel = computed(() => USER_ROLE_LABEL[role.value] ?? 'Nhân sự')
// Trên điện thoại sidebar là menu trượt: khi mở luôn hiện đầy đủ, không phụ thuộc trạng thái thu gọn của máy tính.
const showFull = computed(() => !collapsed.value || mobileOpen.value)

function isMobile() {
  return window.matchMedia('(max-width: 900px)').matches
}
const userLabel = computed(() => currentUser.value?.displayName || currentUser.value?.email || 'Nhân sự')

function toggleSidebar() {
  if (isMobile()) mobileOpen.value = !mobileOpen.value
  else collapsed.value = !collapsed.value
}

function collapseSidebar() {
  if (isMobile()) mobileOpen.value = false
  else collapsed.value = true
}

function goBack() {
  if (canGoBackInHistory(window.history.state)) router.back()
  else router.push(parentLocation(route) ?? { name: ADMIN_ROUTE.home })
}

async function logout() {
  await signOut()
  router.replace({ name: ADMIN_ROUTE.login })
}
</script>

<template>
  <div
    class="admin-layout"
    :class="{ 'admin-layout--collapsed': collapsed, 'admin-layout--mobile-open': mobileOpen }"
  >
    <a class="admin-layout__skip" href="#admin-main">Bỏ qua điều hướng</a>

    <aside id="admin-sidebar" class="admin-sidebar" aria-label="Thanh điều hướng quản trị">
      <div class="admin-sidebar__head">
        <button
          v-if="!showFull"
          type="button"
          class="admin-sidebar__logo-button"
          aria-label="Mở rộng thanh điều hướng"
          title="Mở rộng"
          :aria-expanded="false"
          aria-controls="admin-sidebar"
          @click="collapsed = false"
        >
          <img :src="logoUrl" alt="" />
        </button>
        <template v-else>
          <RouterLink :to="{ name: ADMIN_ROUTE.home }" class="admin-sidebar__brand">
            <img :src="logoUrl" alt="" />
            <span><strong>ReShare</strong><small>Admin Portal</small></span>
          </RouterLink>
          <button
            type="button"
            class="admin-sidebar__collapse"
            aria-label="Thu gọn thanh điều hướng"
            title="Thu gọn"
            :aria-expanded="true"
            aria-controls="admin-sidebar"
            @click="collapseSidebar"
          >
            <AuthIcon name="chevron-left" :size="18" />
          </button>
        </template>
      </div>

      <template v-if="showFull">
        <p class="admin-sidebar__heading">Vận hành &amp; quản trị</p>
        <nav class="admin-sidebar__nav" aria-label="Điều hướng quản trị">
          <RouterLink
            v-for="section in sections"
            :key="section.key"
            :to="section.to"
            class="admin-sidebar__link"
            :class="{ 'admin-sidebar__link--active': section.key === activeSection }"
            :aria-current="section.key === activeSection ? 'page' : undefined"
          >
            <AuthIcon :name="section.icon" :size="18" />{{ section.label }}
          </RouterLink>
        </nav>
      </template>
    </aside>

    <button
      v-if="mobileOpen"
      type="button"
      class="admin-layout__backdrop"
      aria-label="Đóng thanh điều hướng"
      @click="mobileOpen = false"
    />

    <div class="admin-layout__body">
      <header class="admin-topbar">
        <button
          type="button"
          class="admin-topbar__icon"
          :aria-label="collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'"
          aria-controls="admin-sidebar"
          :aria-expanded="showFull"
          @click="toggleSidebar"
        >
          <AuthIcon name="menu" :size="20" />
        </button>
        <button v-if="showBack" type="button" class="admin-topbar__back" @click="goBack">
          <AuthIcon name="arrow-left" :size="18" />Quay lại
        </button>
        <nav class="admin-topbar__crumbs" aria-label="Vị trí hiện tại">
          <template v-for="(crumb, index) in crumbs" :key="crumb.label">
            <span v-if="index" class="admin-topbar__crumb-sep" aria-hidden="true">›</span>
            <RouterLink v-if="crumb.to" :to="crumb.to" class="admin-topbar__crumb-link">{{ crumb.label }}</RouterLink>
            <span v-else class="admin-topbar__crumb-current" aria-current="page">{{ crumb.label }}</span>
          </template>
        </nav>
        <span class="admin-topbar__role"><AuthIcon name="shield-check" :size="15" />{{ roleLabel }}</span>
        <span class="admin-topbar__user" :title="userLabel"><AuthIcon name="user" :size="17" />{{ userLabel }}</span>
        <button type="button" class="admin-topbar__logout" @click="logout">
          <AuthIcon name="log-out" :size="17" /><span>Đăng xuất</span>
        </button>
      </header>

      <main id="admin-main" class="admin-layout__content" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style>
.admin-layout {
  --admin-sidebar-width: 248px;
  --admin-sidebar-collapsed: 76px;
  --admin-shell-offset: var(--admin-sidebar-width);
  display: grid;
  grid-template-columns: var(--admin-shell-offset) minmax(0, 1fr);
  min-height: 100vh;
  background: #f6f7fb;
}
.admin-layout--collapsed { --admin-shell-offset: var(--admin-sidebar-collapsed); }

.admin-layout__skip { position: absolute; left: -999px; top: 8px; z-index: 50; padding: 8px 12px; border-radius: 8px; background: var(--auth-primary); color: #fff; }
.admin-layout__skip:focus { left: 8px; }

.admin-sidebar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100vh;
  padding: 18px 14px;
  overflow-y: auto;
  border-right: 1px solid var(--auth-border);
  background: var(--auth-surface);
}
.admin-sidebar__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; }
.admin-sidebar__brand { display: flex; align-items: center; gap: 10px; min-width: 0; color: var(--auth-primary); text-decoration: none; }
.admin-sidebar__brand img,
.admin-sidebar__logo-button img { width: 38px; height: 38px; flex: none; }
.admin-sidebar__brand span { display: flex; flex-direction: column; line-height: 1.2; }
.admin-sidebar__brand strong { font-size: 18px; }
.admin-sidebar__brand small { color: var(--auth-text-secondary); font-size: 12px; }
.admin-sidebar__collapse,
.admin-sidebar__logo-button,
.admin-topbar__icon {
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--auth-text-secondary);
  cursor: pointer;
}
.admin-sidebar__collapse { width: 34px; height: 34px; }
.admin-sidebar__collapse:hover,
.admin-topbar__icon:hover { background: var(--auth-primary-soft); color: var(--auth-primary); }
.admin-sidebar__logo-button { width: 48px; height: 48px; margin: 0 auto; }
.admin-sidebar__logo-button:hover { background: var(--auth-primary-soft); }
.admin-sidebar__heading { margin: 0; padding: 0 10px; color: var(--auth-text-tertiary); font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.admin-sidebar__nav { display: flex; flex-direction: column; gap: 4px; }
.admin-sidebar__link { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 8px 10px; border-radius: 8px; color: var(--auth-text-secondary); font-size: 14px; text-decoration: none; }
.admin-sidebar__link:hover { background: var(--auth-primary-soft); color: var(--auth-primary); }
.admin-sidebar__link--active,
.admin-sidebar__link--active:hover { background: var(--auth-primary); color: #fff; font-weight: 700; }

.admin-layout--collapsed .admin-sidebar { padding-inline: 10px; }
.admin-layout--collapsed .admin-sidebar__head { justify-content: center; }

.admin-layout__body { display: flex; flex-direction: column; min-width: 0; }
.admin-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--auth-border);
  background: var(--auth-surface);
}
.admin-topbar__icon { width: 40px; height: 40px; flex: none; }
.admin-topbar__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--auth-border);
  border-radius: 8px;
  background: var(--auth-surface);
  color: var(--auth-text);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.admin-topbar__back:hover { border-color: var(--auth-primary); color: var(--auth-primary); }
.admin-topbar__crumbs { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; overflow: hidden; font-size: 14px; white-space: nowrap; }
.admin-topbar__crumb-link { color: var(--auth-text-secondary); text-decoration: none; }
.admin-topbar__crumb-link:hover { color: var(--auth-primary); text-decoration: underline; }
.admin-topbar__crumb-sep { color: var(--auth-text-tertiary); }
.admin-topbar__crumb-current { overflow: hidden; color: var(--auth-text); font-weight: 600; text-overflow: ellipsis; }
.admin-topbar__role { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: var(--auth-primary-soft); color: var(--auth-primary); font-size: 12px; white-space: nowrap; }
.admin-topbar__user { display: inline-flex; align-items: center; gap: 6px; max-width: 220px; overflow: hidden; color: var(--auth-text-secondary); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.admin-topbar__logout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: var(--auth-accent-soft);
  color: var(--auth-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.admin-topbar__logout:hover { background: var(--auth-danger-soft); color: var(--auth-danger); }

.admin-layout__content { flex: 1; min-width: 0; padding: 24px; outline: none; }
.admin-layout__backdrop { display: none; }

/* Trang đặt trong khung: bỏ nền/khung riêng, nội dung chiếm trọn vùng nội dung. */
.admin-page { min-width: 0; }

@media (max-width: 1100px) {
  .admin-topbar__role { display: none; }
}

@media (max-width: 900px) {
  .admin-layout,
  .admin-layout--collapsed { --admin-shell-offset: 0px; grid-template-columns: minmax(0, 1fr); }
  .admin-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(280px, 86vw);
    transform: translateX(-100%);
    transition: transform .2s ease;
    box-shadow: none;
  }
  .admin-layout--mobile-open .admin-sidebar { transform: none; box-shadow: 0 10px 40px rgb(18 29 25 / .25); }
  .admin-layout__backdrop { position: fixed; inset: 0; z-index: 25; display: block; border: 0; background: rgb(18 29 25 / .45); }
  .admin-topbar { gap: 8px; padding: 8px 12px; }
  .admin-topbar__user { display: none; }
  .admin-topbar__crumb-link,
  .admin-topbar__crumb-sep { display: none; }
  .admin-layout__content { padding: 16px; }
}

@media (max-width: 520px) {
  .admin-topbar__back { padding: 0 10px; }
  .admin-topbar__logout span { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .admin-sidebar { transition: none; }
}
</style>
