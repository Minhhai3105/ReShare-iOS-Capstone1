import test from 'node:test'
import assert from 'node:assert/strict'
import { createDemoDistributionRepository, createLiveDistributionRepository, newRequestKey, validateDistribution } from '../src/admin/distribution/distribution.repository.js'
import { distributionFixtures, previewActor, previewAssignment } from '../src/admin/distribution/distribution.mock.js'

function setup() {
  let assignment = structuredClone(previewAssignment)
  const repository = createDemoDistributionRepository({ getAssignment: () => assignment, getActor: () => previewActor })
  const draft = (quantity = 2) => ({
    itemId: 'DEMO-INV-001', warehouseId: 'hai-chau', beneficiaryId: 'DEMO-BEN-001',
    quantity, handedOver: true, note: '', expectedVersion: repository.list().inventory[0].version,
  })
  return { repository, draft, setAssignment: (value) => { assignment = value } }
}

test('stock 3 -> export 2 -> stock 1; subsequent export 2 fails without deducting again', async () => {
  const { repository, draft } = setup()
  const { voucher, movement, item } = await repository.createVoucher(draft())
  assert.equal(item.available, 1)
  assert.equal(voucher.before, 3)
  assert.equal(voucher.after, 1)
  assert.equal(voucher.movementId, movement.id)
  assert.equal(movement.voucherId, voucher.id)
  assert.equal(movement.quantity, -2)
  assert.equal(voucher.itemId, item.id)
  assert.equal(voucher.warehouseId, 'hai-chau')
  assert.equal(voucher.beneficiaryId, 'DEMO-BEN-001')
  assert.equal(voucher.actor.id, previewActor.id)
  assert.ok(Number.isFinite(Date.parse(voucher.timestamp)))
  await assert.rejects(repository.createVoucher(draft()), { code: 'INSUFFICIENT_STOCK', item: { ...item, available: 1 } })
  assert.equal(repository.list().inventory[0].available, 1)
})

test('two concurrent mock requests cannot both spend stock 3 with quantity 2', async () => {
  const { repository, draft } = setup()
  const results = await Promise.allSettled([repository.createVoucher(draft()), repository.createVoucher(draft())])
  assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1)
  assert.equal(results.filter((entry) => entry.status === 'rejected').length, 1)
  assert.equal(repository.list().inventory[0].available, 1)
})

test('partial exports leave the remainder available, with unique document references', async () => {
  const { repository, draft } = setup()
  const first = await repository.createVoucher(draft(2))
  const second = await repository.createVoucher(draft(1))
  assert.equal(second.item.available, 0)
  assert.notEqual(first.voucher.id, second.voucher.id)
  assert.notEqual(first.movement.id, second.movement.id)
  assert.equal(first.voucher.after, 1)
  assert.equal(first.item.available, 1, 'returned snapshots do not change after subsequent commits')
})

test('quantity rejects zero, negatives, decimals, exponent/hex input, unsafe integers and blank', async () => {
  const { repository, draft } = setup()
  for (const quantity of [0, -1, 1.5, '', ' ', '1e0', '0x1', 'Infinity', 'NaN', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(repository.createVoucher(draft(quantity)), { code: 'VALIDATION' })
    assert.equal(repository.list().inventory[0].available, 3)
  }
})

test('requires approved beneficiary in same warehouse and physical handover', async () => {
  const { repository, draft } = setup()
  for (const changes of [{ beneficiaryId: '' }, { beneficiaryId: 'DEMO-BEN-003' }, { beneficiaryId: 'DEMO-BEN-004' }, { handedOver: false }, { note: 'x'.repeat(501) }]) {
    await assert.rejects(repository.createVoucher({ ...draft(), ...changes }), { code: 'VALIDATION' })
  }
  assert.equal(repository.list().inventory[0].available, 3)
})

test('lists only assigned warehouse data and refuses cross-warehouse inventory', async () => {
  const { repository, draft } = setup()
  const options = repository.list()
  assert.deepEqual(options.warehouses.map((entry) => entry.id), ['hai-chau'])
  assert.ok(options.inventory.every((entry) => entry.warehouseId === 'hai-chau'))
  assert.ok(options.beneficiaries.every((entry) => entry.warehouseId === 'hai-chau' && entry.approved))
  await assert.rejects(repository.createVoucher({ ...draft(), warehouseId: 'son-tra', itemId: 'DEMO-INV-003' }), { code: 'FORBIDDEN' })
  await assert.rejects(repository.createVoucher({ ...draft(), itemId: 'DEMO-INV-003' }), { code: 'NOT_FOUND' })
})

test('rechecks assignment at commit, including revocation while request is pending', async () => {
  const { repository, draft, setAssignment } = setup()
  const request = repository.createVoucher(draft())
  setAssignment({ ...previewAssignment, active: false })
  await assert.rejects(request, { code: 'FORBIDDEN' })
  assert.equal(repository.list().inventory.length, 0)
  setAssignment(previewAssignment)
  assert.equal(repository.list().inventory[0].available, 3)
})

test('simulated shortage returns new stock and allows an adjusted submission', async () => {
  const { repository, draft } = setup()
  await assert.rejects(repository.createVoucher(draft(), 'shortage'), (error) => {
    assert.equal(error.code, 'INSUFFICIENT_STOCK')
    assert.equal(error.item.available, 1)
    assert.match(error.message, /Tồn mới: 1/)
    return true
  })
  const result = await repository.createVoucher(draft(1))
  assert.equal(result.item.available, 0)
  assert.equal(result.voucher.id, 'DEMO-PX-0001', 'failed submission did not create a voucher')
})

test('simulated version conflict does not deduct stock and requires fresh confirmation', async () => {
  const { repository, draft } = setup()
  const stale = draft()
  await assert.rejects(repository.createVoucher(stale, 'conflict'), { code: 'STOCK_CONFLICT' })
  assert.equal(repository.list().inventory[0].available, 3)
  await assert.rejects(repository.createVoucher(stale), { code: 'STOCK_CONFLICT' })
  const result = await repository.createVoucher(draft())
  assert.equal(result.item.available, 1)
  assert.equal(result.voucher.id, 'DEMO-PX-0001')
})

test('snapshots cannot mutate the mock ledger and new sessions restore fixtures', async () => {
  const { repository, draft } = setup()
  const list = repository.list()
  list.inventory[0].available = 999
  assert.equal(repository.list().inventory[0].available, 3)
  await repository.createVoucher(draft())
  assert.equal(setup().repository.list().inventory[0].available, 3)
  assert.equal(distributionFixtures.inventory[0].available, 3)
})

test('FE validation reports stock and prevents negative preview', () => {
  const item = distributionFixtures.inventory[0]
  const errors = validateDistribution({ quantity: '4', beneficiaryId: 'DEMO-BEN-001', handedOver: true }, item, distributionFixtures.beneficiaries)
  assert.match(errors.quantity, /Chỉ còn 3 chiếc/)
  assert.equal(validateDistribution({ quantity: '2', beneficiaryId: 'DEMO-BEN-001', handedOver: true }, item, distributionFixtures.beneficiaries).quantity, undefined)
})

test('live distribution sends token, stock version and retry key to backend', async () => {
  const originalFetch = globalThis.fetch
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, ...options }
    return { ok: true, json: async () => ({ success: true }) }
  }
  try {
    const repository = createLiveDistributionRepository({
      apiBase: 'https://api.example.test',
      authInstance: { currentUser: { getIdToken: async () => 'test-token' } },
    })
    await repository.createVoucher({
      warehouseId: 'wh_dn_01', itemId: 'item-1', beneficiaryId: 'ben-1',
      quantity: 2, handedOver: true, note: '', expectedVersion: 3,
      idempotencyKey: 'retry-key-123',
    })
    assert.equal(request.url, 'https://api.example.test/v1/admin/distribution')
    assert.equal(request.headers.Authorization, 'Bearer test-token')
    assert.deepEqual(JSON.parse(request.body), {
      warehouseId: 'wh_dn_01', itemId: 'item-1', beneficiaryId: 'ben-1',
      quantity: 2, handedOver: true, note: '', expectedVersion: 3,
      idempotencyKey: 'retry-key-123',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('retry key stays usable when crypto.randomUUID is unavailable outside a secure context', () => {
  const accepted = /^[A-Za-z0-9_-]{8,128}$/
  assert.match(newRequestKey(), accepted)

  // globalThis.crypto là getter-only nên phải thay bằng defineProperty rồi phục hồi.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const realCrypto = globalThis.crypto
  try {
    // Mô phỏng http context: getRandomValues vẫn có, randomUUID thì không.
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: (bytes) => realCrypto.getRandomValues(bytes) },
    })
    assert.equal(typeof globalThis.crypto.randomUUID, 'undefined')
    const fallbackKey = newRequestKey()
    assert.match(fallbackKey, accepted)
    assert.equal(fallbackKey.length, 32)
    assert.notEqual(fallbackKey, newRequestKey())
  } finally {
    Object.defineProperty(globalThis, 'crypto', descriptor)
  }
})

test('a 2xx response with an unreadable body is uncertain, never a success', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => { throw new Error('connection reset while reading body') },
  })
  try {
    const repository = createLiveDistributionRepository({
      apiBase: 'https://api.example.test',
      authInstance: { currentUser: { getIdToken: async () => 'test-token' } },
    })
    await assert.rejects(
      () => repository.createVoucher({
        warehouseId: 'wh_dn_01', itemId: 'item-1', beneficiaryId: 'ben-1',
        quantity: 2, handedOver: true, note: '', expectedVersion: 3,
        idempotencyKey: 'retry-key-123',
      }),
      // NETWORK_ERROR là tín hiệu để màn hình giữ idempotencyKey và cho gửi lại.
      (error) => error.code === 'NETWORK_ERROR',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('an error response with an unreadable body keeps the generic failure message', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => { throw new Error('empty body') },
  })
  try {
    const repository = createLiveDistributionRepository({
      apiBase: 'https://api.example.test',
      authInstance: { currentUser: { getIdToken: async () => 'test-token' } },
    })
    await assert.rejects(
      () => repository.createVoucher({
        warehouseId: 'wh_dn_01', itemId: 'item-1', beneficiaryId: 'ben-1',
        quantity: 2, handedOver: true, note: '', expectedVersion: 3,
        idempotencyKey: 'retry-key-123',
      }),
      (error) => error.code === 'ERROR' && /Không thể tạo phiếu xuất/.test(error.message),
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
