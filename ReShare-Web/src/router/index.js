import { createRouter, createWebHistory } from 'vue-router'
import { adminRoutes, installAdminAuth } from '@/admin/admin.routes'
import LandingPage from '@/landing/LandingPage.vue'
import { PRIVACY_POLICY_PATH, TERMS_OF_USE_PATH } from '@/landing/legal.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LandingPage },
    // Trang pháp lý công khai: app iOS mở bằng đường dẫn cố định (Constants.Links), đừng đổi path.
    {
      path: PRIVACY_POLICY_PATH,
      name: 'privacy-policy',
      component: () => import('@/landing/PrivacyPolicyPage.vue'),
      meta: { legal: true, title: 'Chính sách quyền riêng tư — ReShare' },
    },
    {
      path: TERMS_OF_USE_PATH,
      name: 'terms-of-use',
      component: () => import('@/landing/TermsOfUsePage.vue'),
      meta: { legal: true, title: 'Điều khoản sử dụng — ReShare' },
    },
    ...adminRoutes,
  ],
  // Khung quản trị giữ nguyên giữa các trang nên phải tự cuộn về đầu khi sang trang khác;
  // đổi bộ lọc (chỉ đổi query) giữ vị trí. Landing giữ hành vi cũ.
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.path.startsWith('/admin') && to.path !== from.path) return { top: 0 }
    // Landing bật scroll-behavior: smooth; sang trang pháp lý thì lên đầu ngay, không trượt từ footer.
    if (to.meta.legal && to.path !== from.path) return { top: 0, behavior: 'instant' }
    return false
  },
})

installAdminAuth(router)

router.afterEach((to) => {
  document.title = to.meta.title || (to.path.startsWith('/admin') ? 'ReShare — Quản trị' : 'ReShare — Sẻ chia đúng cách')
})

export default router
