import { createRouter, createWebHistory } from 'vue-router'
import { adminRoutes, installAdminAuth } from '@/admin/admin.routes'
import LandingPage from '@/landing/LandingPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: LandingPage }, ...adminRoutes],
  // Khung quản trị giữ nguyên giữa các trang nên phải tự cuộn về đầu khi sang trang khác;
  // đổi bộ lọc (chỉ đổi query) giữ vị trí. Landing giữ hành vi cũ.
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.path.startsWith('/admin') && to.path !== from.path) return { top: 0 }
    return false
  },
})

installAdminAuth(router)

router.afterEach((to) => {
  document.title = to.path.startsWith('/admin') ? 'ReShare — Quản trị' : 'ReShare — Sẻ chia đúng cách'
})

export default router
