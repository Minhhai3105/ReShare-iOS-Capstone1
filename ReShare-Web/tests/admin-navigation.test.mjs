import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createServer } from 'vite'
import { adminNavigation } from '../src/admin/navigation.js'

test('live navigation uses registered routes and respects staff roles', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), logLevel: 'error',
    server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { adminRoutes } = await server.ssrLoadModule('/src/admin/admin.routes.js')
    const { default: Chrome } = await server.ssrLoadModule('/src/admin/AdminChrome.vue')
    const names = new Set(adminRoutes.map(route => route.name))
    for (const role of ['warehouse_admin', 'system_admin']) {
      const entries = adminNavigation(role)
      assert.ok(entries.some(entry => entry.key === 'beneficiaries'))
      assert.ok(entries.some(entry => entry.key === 'reports'))
      for (const entry of entries) assert.ok(names.has(entry.to.name), `Route chưa đăng ký: ${entry.to.name}`)
      assert.equal(entries.some(entry => entry.key === 'staff'), role === 'system_admin')
      const router = createRouter({ history: createMemoryHistory(), routes: adminRoutes.map(route => ({
        ...route, component: { render: () => null }, redirect: undefined,
      })) })
      await router.push('/admin/reports')
      await router.isReady()
      const html = await renderToString(createSSRApp(Chrome, { screen: 'Q', live: true, showPreview: false, role }).use(router))
      assert.match(html, /href="\/admin\/beneficiaries"/)
      assert.match(html, /href="\/admin\/reports"/)
      assert.match(html, /Nhật ký · Chưa hỗ trợ/)
      assert.doesNotMatch(html, /Preview dữ liệu mock|Vai trò demo|<em>DEMO<\/em>/)
      assert.equal(html.includes('href="/admin/staff"'), role === 'system_admin')
    }
    assert.deepEqual(adminNavigation('donor'), [])
  } finally { await server.close() }
})
