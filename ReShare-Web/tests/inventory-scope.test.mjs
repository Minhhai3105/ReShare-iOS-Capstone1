import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveInventoryScope } from '../src/admin/inventory/inventory.scope.js'

test('Empty inventory query selects one assigned warehouse for both list and SSE', () => {
  const staff = { isAllWarehouses: false, warehouseIds: ['warehouse-a', 'warehouse-b'] }
  for (const value of [undefined, null, '', '   ']) assert.deepEqual(resolveInventoryScope(value, staff), { warehouseId: 'warehouse-a', allowed: true })
  assert.deepEqual(resolveInventoryScope('warehouse-b', staff), { warehouseId: 'warehouse-b', allowed: true })
  assert.equal(resolveInventoryScope('foreign', staff).allowed, false)
  assert.equal(resolveInventoryScope('', { isAllWarehouses: false, warehouseIds: [] }).allowed, false)
})

test('System Admin can select all; malformed/array queries and missing access cannot broaden scope', () => {
  const admin = { isAllWarehouses: true }
  assert.deepEqual(resolveInventoryScope('', admin), { warehouseId: '', allowed: true })
  assert.deepEqual(resolveInventoryScope(' warehouse-a ', admin), { warehouseId: 'warehouse-a', allowed: true })
  for (const value of [['warehouse-a'], ['a', 'b'], {}, 1, '../other']) assert.equal(resolveInventoryScope(value, admin).allowed, false)
  assert.equal(resolveInventoryScope('', null).allowed, false)
})
