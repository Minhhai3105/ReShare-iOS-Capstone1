import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { protectedFetch, setSessionExpiredHandler } from '../src/admin/protected-fetch.js'
import { assertNoSecrets, assertPublicEnvironment } from '../build-security.mjs'

test('requests bearing a token use HTTPS, reject redirects and never use cookies or cache', async () => {
  let sent
  const fakeFetch = async (url, options) => { sent = { url, options }; return { ok: true } }
  await protectedFetch('https://api.example.test/v1/admin/staff', { headers: { Authorization: 'Bearer own-token' } }, fakeFetch)
  assert.equal(sent.options.headers.Authorization, 'Bearer own-token')
  assert.equal(sent.options.redirect, 'error')
  assert.equal(sent.options.credentials, 'omit')
  assert.equal(sent.options.cache, 'no-store')
  assert.equal(sent.options.referrerPolicy, 'no-referrer')
  for (const url of ['http://external.test/api', 'https://user:password@api.example.test/api', 'javascript:alert(1)', 'https://api.example.test/#token']) {
    assert.throws(() => protectedFetch(url, {}, fakeFetch))
  }
  await protectedFetch('http://localhost:3001/v1/admin/staff', {}, fakeFetch)
})

test('build rejects server secrets without treating public Firebase config as a secret', () => {
  assert.doesNotThrow(() => assertPublicEnvironment({ VITE_FIREBASE_API_KEY: 'public-identifier' }))
  assert.throws(() => assertPublicEnvironment({ VITE_CLOUDINARY_API_SECRET: 'private-value' }))
  assert.throws(() => assertNoSecrets('-----BEGIN PRIVATE KEY-----'))
  assert.throws(() => assertNoSecrets('{"type":"service_account"}'))
  assert.throws(() => assertNoSecrets('accidentally-bundled-secret', { CLOUDINARY_API_SECRET: 'accidentally-bundled-secret' }))
  assert.doesNotThrow(() => assertNoSecrets('Firebase apiKey: public-identifier'))
})

test('401 invalidates the rejected session without replaying a write', async () => {
  let requests = 0
  let expiredToken
  setSessionExpiredHandler(async token => { expiredToken = token })
  try {
    const response = await protectedFetch('https://api.example.test/v1/admin/distribution', {
      method: 'POST', headers: { Authorization: 'Bearer rejected-token' }, body: '{}',
    }, async () => { requests += 1; return { status: 401 } })
    assert.equal(response.status, 401)
    assert.equal(requests, 1)
    assert.equal(expiredToken, 'rejected-token')
  } finally { setSessionExpiredHandler(undefined) }
})

test('Cloudflare policy blocks framing and scripts outside the approved sources', () => {
  const policy = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
  assert.match(policy, /frame-ancestors 'none'/)
  assert.match(policy, /object-src 'none'/)
  assert.match(policy, /script-src-attr 'none'/)
  assert.doesNotMatch(policy.match(/script-src [^;]+/)?.[0] || '', /unsafe-inline|unsafe-eval/)
  assert.match(policy, /X-Frame-Options: DENY/)
  assert.match(policy, /\/admin\/\*\s+Cache-Control: no-store/)
})

test('production bundle contains no private credentials or source maps', { skip: !process.env.CHECK_BUILD }, () => {
  const root = fileURLToPath(new URL('../dist/', import.meta.url))
  function scan(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) scan(path)
      else {
        assert.ok(!name.endsWith('.map'), 'Không phát hành source map')
        assertNoSecrets(readFileSync(path, 'utf8'))
      }
    }
  }
  scan(root)
})
