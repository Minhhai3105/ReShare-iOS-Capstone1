import { createRouter, createWebHistory } from 'vue-router'
import { adminRoutes, installAdminAuth } from '@/admin/admin.routes'

const router = createRouter({
  history: createWebHistory(),
  // Tạm chuyển "/" vào Admin cho tới khi có Landing Page.
  routes: [{ path: '/', redirect: '/admin' }, ...adminRoutes],
})

installAdminAuth(router)

export default router
