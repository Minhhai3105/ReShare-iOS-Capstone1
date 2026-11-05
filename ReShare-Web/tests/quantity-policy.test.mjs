import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { quantityBase, quantityFromBase } from '../src/admin/shared/quantity.js'
import { validateDistribution } from '../src/admin/distribution/distribution.repository.js'
const backend = createRequire(import.meta.url)('../../backend/quantity.cjs')

test('Web and API apply the same unit policy to counts, kilograms and legacy labels', () => {
  for (const unit of ['piece', 'kg', 'bag', 'box', 'set', 'chiếc', 'bộ', 'unknown']) {
    for (const value of [1, 0, -1, 1.125, 0.001, 0.0001, '1.0000', '1e3', '', null, Infinity, '9007199254741']) {
      assert.equal(quantityBase(value, unit), backend.quantityBase(value, unit), `${unit}/${value}`)
    }
  }
  assert.equal(quantityFromBase(quantityBase(0.3, 'kg') - quantityBase(0.1, 'kg'), 'kg'), 0.2)
})

test('The distribution form accepts fractional kg and rejects fractional count units', () => {
  const beneficiary = { id: 'b', approved: true, warehouseId: 'w' }
  const draft = { quantity: '0.125', beneficiaryId: 'b', handedOver: true }
  assert.deepEqual(validateDistribution(draft, { unitId: 'kg', unit: 'kg', available: 1.125, warehouseId: 'w' }, [beneficiary]), {})
  assert.ok(validateDistribution(draft, { unit: 'chiếc', available: 2, warehouseId: 'w' }, [beneficiary]).quantity)
})
