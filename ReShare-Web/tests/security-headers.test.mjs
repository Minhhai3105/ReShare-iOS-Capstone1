import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Cloudflare Pages đọc public/_headers; kiểm để không ai lỡ xoá header bảo mật.
test('public/_headers áp header bảo mật cho mọi trang', () => {
  const text = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
  const lines = text.split('\n').filter(line => !line.startsWith('#'))
  assert.equal(lines.find(line => line.trim())?.trim(), '/*')
  for (const header of [
    'X-Content-Type-Options: nosniff',
    'X-Frame-Options: DENY',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'Strict-Transport-Security: max-age=31536000',
  ]) assert.ok(lines.some(line => line.trim() === header), header)
  assert.ok(!/Content-Security-Policy/i.test(text), 'CSP chưa được kiểm với Turnstile/Firebase')
})
