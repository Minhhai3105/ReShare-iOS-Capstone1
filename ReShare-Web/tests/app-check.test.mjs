import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readAppCheckConfig } from '../src/admin/auth/app-check.js'

test('RC1D-145: chưa đặt site key thì không bật App Check, Web Admin chạy như cũ', () => {
  assert.equal(readAppCheckConfig({}), null)
  assert.equal(readAppCheckConfig({ VITE_APPCHECK_SITE_KEY: '   ' }), null)
})

test('RC1D-145: có site key thì bật reCAPTCHA Enterprise, bỏ khoảng trắng thừa', () => {
  assert.deepEqual(readAppCheckConfig({ VITE_APPCHECK_SITE_KEY: ' site-key ' }), { siteKey: 'site-key', debugToken: null })
})

test('RC1D-145: token debug chỉ dùng khi dev, bản build bỏ qua', () => {
  assert.deepEqual(readAppCheckConfig({ DEV: true, VITE_APPCHECK_SITE_KEY: 'k', VITE_APPCHECK_DEBUG_TOKEN: 'true' }), { siteKey: 'k', debugToken: true })
  assert.deepEqual(readAppCheckConfig({ DEV: true, VITE_APPCHECK_SITE_KEY: 'k', VITE_APPCHECK_DEBUG_TOKEN: 'abc-123' }), { siteKey: 'k', debugToken: 'abc-123' })
  assert.deepEqual(readAppCheckConfig({ DEV: false, VITE_APPCHECK_SITE_KEY: 'k', VITE_APPCHECK_DEBUG_TOKEN: 'abc-123' }), { siteKey: 'k', debugToken: null })
})

test('RC1D-145: App Check khởi tạo trước Auth và Firestore', () => {
  const source = readFileSync(new URL('../src/admin/auth/firebase.js', import.meta.url), 'utf8')
  const appCheck = source.indexOf('initializeAppCheck(app')
  assert.ok(appCheck > 0)
  assert.ok(appCheck < source.indexOf('getAuth(app)'))
  assert.ok(appCheck < source.indexOf('getFirestore(app)'))
})
