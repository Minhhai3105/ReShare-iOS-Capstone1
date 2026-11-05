import test from 'node:test'
import assert from 'node:assert/strict'
import { createInventorySyncState, inventoryRevision } from '../src/admin/inventory/inventory.sync.js'

test('Matching HTTP snapshot and SSE baseline need no second load regardless of arrival order', () => {
  const httpFirst = createInventorySyncState()
  httpFirst.acknowledge('revision-1')
  assert.equal(httpFirst.observe('revision-1'), false)
  const eventFirst = createInventorySyncState()
  assert.equal(eventFirst.observe('revision-1'), true)
  eventFirst.acknowledge('revision-1')
  assert.equal(eventFirst.needsRefresh, false)
  assert.equal(eventFirst.observe('revision-1'), false, 'Unchanged reconnect baseline is already loaded')
});

test('A newer revision during GET remains pending until a snapshot covering it succeeds', () => {
  const state = createInventorySyncState()
  state.observe('revision-1')
  state.observe('revision-2')
  state.acknowledge('revision-1')
  assert.equal(state.needsRefresh, true)
  state.acknowledge('revision-2')
  assert.equal(state.needsRefresh, false)
  state.acknowledge(null)
  assert.equal(state.observe('revision-2'), true, 'Failed GET must not acknowledge the data')
  state.clear()
  assert.equal(state.needsRefresh, false)
  assert.equal(state.observe('revision-2'), true, 'Another scope/account must load its own snapshot')
});

test('Revision values accept legacy integer events and reject malformed metadata', () => {
  assert.equal(inventoryRevision(0), '0')
  for (const value of [null, undefined, {}, '', -1, 1.5, 'x'.repeat(129)]) assert.equal(inventoryRevision(value), null)
});
