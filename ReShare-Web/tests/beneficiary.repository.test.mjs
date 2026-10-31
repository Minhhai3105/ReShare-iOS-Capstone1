import test from 'node:test'
import assert from 'node:assert/strict'
import { createBeneficiaryRepository } from '../src/admin/beneficiaries/beneficiary.repository.js'

test('profile repository sends Firebase token and preserves server validation errors', async () => {
  const calls = []
  const repository = createBeneficiaryRepository({
    apiBase: 'https://api.example.test',
    authInstance: { currentUser: { getIdToken: async () => 'id-token' } },
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return { ok: false, status: 400, json: async () => ({ code: 'VALIDATION', details: { errors: { name: 'Bắt buộc' } } }) }
    },
  })
  await assert.rejects(repository.create({ name: '' }), error => {
    assert.equal(error.status, 400)
    assert.equal(error.details.errors.name, 'Bắt buộc')
    return true
  })
  assert.equal(calls[0].options.headers.Authorization, 'Bearer id-token')
  assert.equal(calls[0].options.method, 'POST')
})

test('lost response after write is uncertain, never reported as success', async () => {
  const repository = createBeneficiaryRepository({
    authInstance: { currentUser: { getIdToken: async () => 'id-token' } },
    fetchImpl: async () => ({ ok: true, status: 201, json: async () => { throw new Error('lost body') } }),
  })
  await assert.rejects(repository.create({ name: 'An' }), { code: 'UNCERTAIN' })
})

test('malformed list response is not treated as empty data', async () => {
  const repository = createBeneficiaryRepository({
    authInstance: { currentUser: { getIdToken: async () => 'id-token' } },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ somethingElse: [] }) }),
  })
  await assert.rejects(repository.list(), { status: 0 })
})

test('repository maps paginated API data and uses the trusted update and verify routes', async () => {
  const calls = []
  const repository = createBeneficiaryRepository({
    authInstance: { currentUser: { getIdToken: async () => 'id-token' } },
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (url.includes('/verify')) return { ok: true, json: async () => ({ beneficiary: { id: 'ben-1' } }) }
      if (url.includes('/update')) return { ok: true, json: async () => ({ beneficiary: { id: 'ben-1' } }) }
      if (url.includes('/ben-1')) return { ok: true, json: async () => ({
        beneficiary: { id: 'ben-1', status: 'approved' }, supportCount: 1,
        supportHistory: [{ voucherId: 'voucher-1', confirmedAt: '2026-10-31T00:00:00Z', lines: [] }], nextCursor: null,
      }) }
      return { ok: true, json: async () => ({ items: [{ id: 'ben-1' }], nextCursor: 'next-page' }) }
    },
  })
  const page = await repository.list({ search: 'An' })
  assert.equal(page.nextCursor, 'next-page')
  assert.equal(page.beneficiaries[0].id, 'ben-1')
  const detail = await repository.get('ben-1')
  assert.equal(detail.history.vouchers[0].id, 'voucher-1')
  await repository.update('ben-1', { warehouseId: 'kho-a', name: 'An', needs: ['books'], expectedVersion: 2 })
  await repository.decide('ben-1', 'approved', '', 3)
  assert.match(calls[2].url, /\/ben-1\/update$/)
  assert.deepEqual(JSON.parse(calls[2].options.body), { name: 'An', needs: ['books'], expectedVersion: 2 })
  assert.match(calls[3].url, /\/ben-1\/verify$/)
  assert.deepEqual(JSON.parse(calls[3].options.body), { status: 'approved', reason: '', expectedVersion: 3 })
})
