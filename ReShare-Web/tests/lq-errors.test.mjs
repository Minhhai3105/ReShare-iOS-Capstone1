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

// distribution-api phát WAREHOUSE_INACTIVE và IDEMPOTENCY_CONFLICT (cả hai là 409,
// từ chối dứt khoát, không ghi gì). Trước đây hai mã này rơi vào nhánh "chưa xác
// định kết quả" và khoá form — sai sự thật và chặn người dùng vô cớ.
test('mã 409 dứt khoát của backend không bị xếp vào nhóm chưa xác định kết quả', () => {
  for (const code of ['WAREHOUSE_INACTIVE', 'IDEMPOTENCY_CONFLICT']) {
    const mapped = mapLqError(mockError(code), { write: true })
    assert.equal(mapped.kind, 'conflict')
    assert.equal(mapped.action, 'Tải lại dữ liệu')
    assert.notEqual(mapped.title, 'Chưa xác định kết quả')
  }
})

// Backend trả message cụ thể ("Chỉ còn 3 chiếc...") hữu ích hơn câu chung, đừng ghi đè.
test('giữ message cụ thể của backend cho nhóm conflict', () => {
  const beMessage = 'Chỉ còn 3 chiếc. Vui lòng điều chỉnh số lượng.'
  const mapped = mapLqError(Object.assign(new Error(beMessage), { code: 'INSUFFICIENT_STOCK' }), { write: true })
  assert.equal(mapped.message, beMessage)
  // Không có message thì mới dùng câu chung.
  assert.match(mapLqError(mockError('STOCK_CONFLICT'), { write: true }).message, /Tải lại dữ liệu/)
})

// Khoá cứng chỉ dành cho trường hợp KHÔNG có khóa gửi lại. Có idempotencyKey thì
// gửi lại an toàn (distribution-api trả 200 replay, không trừ tồn hai lần).
test('kết quả không rõ phân biệt được gửi lại an toàn và phải khoá', () => {
  for (const error of [mockError('NETWORK_ERROR'), mockError('TIMEOUT'), new TypeError('fetch failed'), { status: 500 }]) {
    const mapped = mapLqError(error, { write: true })
    assert.equal(mapped.kind, 'unknown')
    assert.equal(mapped.replayable, true, `${error.code ?? error.status} phải gửi lại được`)
    assert.match(mapped.message, /kiểm tra lại lần gửi/i)
  }
  const unknownCode = mapLqError(mockError('UNAGREED_CODE'), { write: true })
  assert.equal(unknownCode.replayable, false)
  assert.match(unknownCode.message, /Đã khóa tạo phiếu mới/)
})
