import { createRouter, createWebHistory } from 'vue-router'
import { adminRoutes, installAdminAuth } from '@/admin/admin.routes'
import LandingPage from '@/landing/LandingPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: LandingPage }, ...adminRoutes],
})

installAdminAuth(router)

router.afterEach((to) => {
  document.title = to.path.startsWith('/admin') ? 'ReShare — Quản trị' : 'ReShare — Sẻ chia đúng cách'
})

export default router
