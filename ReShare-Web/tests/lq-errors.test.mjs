import test from 'node:test'
import assert from 'node:assert/strict'
import { mapLqError, mockError } from '../src/admin/lq-errors.js'
import { createDemoDistributionRepository } from '../src/admin/distribution/distribution.repository.js'
import { previewActor, previewAssignment } from '../src/admin/distribution/distribution.mock.js'
import { createMockReportsRepository } from '../src/admin/reports/reports.repository.js'

test('session and permission errors have distinct recovery; HTTP 401/403 take the same paths', () => {
  assert.equal(mapLqError(mockError('UNAUTHENTICATED')).kind, 'session')
  assert.equal(mapLqError({ status: 401 }).kind, 'session')
  assert.equal(mapLqError(mockError('FORBIDDEN')).kind, 'permission')
  assert.equal(mapLqError({ status: 403 }).action, undefined)
})

test('write errors with uncertain outcome never propose blind retry, including unclassified 409/500', () => {
  for (const error of [mockError('TIMEOUT'), new TypeError('fetch failed'), { status: 500 }, { status: 409 }, mockError('UNAGREED_CODE')]) {
    assert.equal(mapLqError(error, { write: true }).kind, 'unknown')
    assert.equal(mapLqError(error, { write: true }).action, undefined)
  }
  assert.equal(mapLqError(mockError('NOT_SENT'), { write: true }).kind, 'retry')
  assert.equal(mapLqError(new Error('network')).kind, 'retry')
})

test('mock conflict codes request a reload instead of replaying the write', () => {
  for (const code of ['INSUFFICIENT_STOCK', 'STOCK_CONFLICT', 'STALE_DATA', 'NOT_FOUND']) {
    assert.equal(mapLqError(mockError(code), { write: true }).kind, 'conflict')
  }
})

test('identical timeout errors may represent either no commit or a committed mock voucher', async () => {
  for (const scenario of ['TIMEOUT', 'TIMEOUT_AFTER_COMMIT']) {
    const repo = createDemoDistributionRepository({ getAssignment: () => previewAssignment, getActor: () => previewActor })
    const draft = { itemId: 'DEMO-INV-001', warehouseId: 'hai-chau', beneficiaryId: 'DEMO-BEN-001', quantity: 2, handedOver: true, expectedVersion: 1 }
    await assert.rejects(repo.createVoucher(draft, scenario), { code: 'TIMEOUT' })
    assert.equal(repo.list().inventory[0].available, scenario === 'TIMEOUT' ? 3 : 1)
    // This observes the in-memory simulator only, not a production reconciliation API.
  }
})

test('report adapter exposes proposed mock errors without any fallback data', async () => {
  for (const code of ['FORBIDDEN', 'UNAUTHENTICATED', 'STALE_DATA', 'STOCK_CONFLICT']) {
    await assert.rejects(createMockReportsRepository({ delayMs: 0, scenario: code }).load({ assignment: previewAssignment }), { code })
  }
})
