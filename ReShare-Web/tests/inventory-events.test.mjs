import test from 'node:test'
import assert from 'node:assert/strict'
import { watchInventoryEvents } from '../src/admin/inventory/inventory.events.js'

test('Stream handles split events and permission loss; credentials never appear in the URL', async () => {
  let changed = 0, request
  let resolveError
  const error = new Promise(resolve => { resolveError = resolve })
  const chunks = ['event: inven', 'tory\r', '\ndata: {"revision":1}\r\n\r\n', 'event: access_lost\ndata: {}\n\n']
  const stop = watchInventoryEvents({ apiBase: 'https://example.test', warehouseId: 'a', getToken: async () => 'private-token',
    onChange: () => { changed += 1 }, onError: resolveError,
    fetchImpl: async (url, options) => {
      request = { url, options }
      return { ok: true, body: new ReadableStream({ start(controller) { chunks.forEach(chunk => controller.enqueue(new TextEncoder().encode(chunk))) } }) }
    },
  })
  try {
    assert.equal((await error).status, 403)
    assert.equal(changed, 1)
    assert.equal(request.options.headers.Authorization, 'Bearer private-token')
    assert.ok(!request.url.includes('private-token'))
    assert.ok(request.url.includes('warehouseId=a'))
  } finally { stop() }
})

test('Stopping an event subscription aborts the connection and prevents reconnection', async () => {
  let requestSignal
  const stop = watchInventoryEvents({ apiBase: 'https://example.test', getToken: async () => 'token', onChange() {}, onError() {},
    fetchImpl: async (_, options) => { requestSignal = options.signal; return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) },
  })
  await new Promise(resolve => setImmediate(resolve))
  stop()
  assert.equal(requestSignal.aborted, true)
})
