import test from 'node:test'
import assert from 'node:assert/strict'
import { inventoryMode } from '../src/admin/inventory/inventory.mode.js'

test('Inventory uses live data by default in both dev and build', () => {
  assert.equal(inventoryMode({ DEV: true }), 'live')
  assert.equal(inventoryMode({ DEV: false }), 'live')
})

test('Mock requires explicit opt-in and cannot enter a build', () => {
  assert.equal(inventoryMode({ DEV: true, VITE_INVENTORY_SOURCE: 'mock' }), 'mock')
  assert.throws(() => inventoryMode({ DEV: false, VITE_INVENTORY_SOURCE: 'mock' }), /not allowed/)
  assert.throws(() => inventoryMode({ DEV: true, VITE_INVENTORY_SOURCE: 'fallback' }), /live or mock/)
})
