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

const flush = () => new Promise(resolve => setImmediate(resolve))

test('Network failures back off to 30 seconds and stopping cancels the pending retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  t.mock.method(Math, 'random', () => 0.5)
  const calls = []
  const stop = watchInventoryEvents({ apiBase: 'https://example.test', getToken: async () => 'token', onChange() {}, onError() {},
    fetchImpl: async () => { calls.push(Date.now()); throw new TypeError('network unavailable') },
  })
  try {
    await flush()
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const before = calls.length
      t.mock.timers.tick(delay - 1); await flush()
      assert.equal(calls.length, before)
      t.mock.timers.tick(1); await flush()
      assert.equal(calls.length, before + 1)
    }
    assert.deepEqual(calls, [0, 1000, 3000, 7000, 15000, 31000, 61000, 91000])
    stop()
    t.mock.timers.tick(60000); await flush()
    assert.equal(calls.length, 8)
  } finally { stop() }
})

test('Permanent Firebase session errors and HTTP permission errors stop instead of retrying', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  for (const code of ['auth/invalid-user-token', 'auth/user-token-expired', 'auth/user-disabled', 'auth/user-not-found', 'auth/user-signed-out', 'auth/null-user']) {
    let calls = 0, failure
    const stop = watchInventoryEvents({ apiBase: 'https://example.test', getToken: async () => { calls++; throw Object.assign(new Error('session ended'), { code }) },
      onChange() {}, onError(error) { failure = error }, fetchImpl: async () => assert.fail('No API call without a token'),
    })
    await flush(); t.mock.timers.tick(60000); await flush()
    assert.equal(calls, 1)
    assert.equal(failure.status, 401)
    stop()
  }
  for (const status of [401, 403]) {
    let calls = 0
    const stop = watchInventoryEvents({ apiBase: 'https://example.test', getToken: async () => 'token', onChange() {}, onError() {},
      fetchImpl: async () => { calls++; return { ok: false, status } },
    })
    await flush(); t.mock.timers.tick(60000); await flush()
    assert.equal(calls, 1)
    stop()
  }
})

test('Transient Firebase token errors retry; stopping during token acquisition prevents a late fetch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(Math, 'random', () => 0.5)
  let calls = 0
  const stop = watchInventoryEvents({ apiBase: 'https://example.test', getToken: async () => { calls++; throw Object.assign(new Error('offline'), { code: 'auth/network-request-failed' }) },
    onChange() {}, onError() {}, fetchImpl: async () => assert.fail('No API call without a token'),
  })
  await flush(); t.mock.timers.tick(1000); await flush()
  assert.equal(calls, 2)
  stop()
  let resolveToken
  const stopPending = watchInventoryEvents({ apiBase: 'https://example.test', getToken: () => new Promise(resolve => { resolveToken = resolve }),
    onChange() {}, onError() {}, fetchImpl: async () => assert.fail('Stopped subscription must not fetch'),
  })
  stopPending(); resolveToken('late-token'); await flush()
})

test('A stable stream resets backoff and permission loss cancels and unlocks its reader', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  t.mock.method(Math, 'random', () => 0.5)
  let calls = 0, streamController, stream, cancelled = 0
  const stop = watchInventoryEvents({ apiBase: 'https://example.test', getToken: async () => 'token', onChange() {}, onError() {},
    fetchImpl: async () => {
      calls++
      if (calls <= 2 || calls >= 4) throw new TypeError('offline')
      stream = new ReadableStream({ start(controller) { streamController = controller }, cancel() { cancelled++ } })
      return { ok: true, body: stream }
    },
  })
  try {
    await flush(); t.mock.timers.tick(1000); await flush()
    t.mock.timers.tick(2000); await flush()
    t.mock.timers.tick(30000); streamController.close(); await flush()
    t.mock.timers.tick(999); await flush(); assert.equal(calls, 3)
    t.mock.timers.tick(1); await flush(); assert.equal(calls, 4)
    assert.equal(stream.locked, false)
  } finally { stop() }
  const stopAccess = watchInventoryEvents({ apiBase: 'https://example.test', getToken: async () => 'token', onChange() {}, onError() {},
    fetchImpl: async () => {
      stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('event: access_lost\ndata: {}\n\n')) }, cancel() { cancelled++ } })
      return { ok: true, body: stream }
    },
  })
  await flush()
  assert.equal(cancelled, 1)
  assert.equal(stream.locked, false)
  stopAccess()
})
