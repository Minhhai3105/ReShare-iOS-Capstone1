import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const key = 'reshare:preload-reload-at'
const dependencies = new Map([
  ['vue', 'export function createApp() { return { use() { return this }, mount() {} } }'],
  ['./App.vue', 'export default {}'],
  ['./router', 'export default {}'],
])
const prefix = '\0preload-test:'
let server
let pageNumber = 0

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    ssr: { noExternal: ['vue'] },
    server: { middlewareMode: true, watch: null, ws: false },
    plugins: [{
      name: 'preload-test-dependencies',
      enforce: 'pre',
      // Chạy đúng main.js, thay điểm khởi động Vue và router để test không cần DOM hoặc API thật.
      resolveId(id, importer) {
        if (importer?.split('?')[0].endsWith('/src/main.js') && dependencies.has(id)) return prefix + id
      },
      load(id) {
        if (id.startsWith(prefix)) return dependencies.get(id.slice(prefix.length))
      },
    }],
  })
})
afterEach(() => { delete globalThis.window })
after(() => server?.close())

async function openPage(tab) {
  const browser = new EventTarget()
  browser.sessionStorage = {
    getItem(name) {
      if (tab.blockRead) throw new Error('Bộ nhớ bị chặn')
      return tab.storage.get(name) ?? null
    },
    setItem(name, value) {
      if (tab.blockWrite) throw new Error('Bộ nhớ bị chặn')
      tab.storage.set(name, value)
    },
  }
  browser.history = {
    get state() { return tab.state },
    replaceState(state) {
      if (tab.blockHistory) throw new Error('Lịch sử bị chặn')
      tab.state = state
    },
  }
  browser.location = { reload() { tab.reloads += 1 } }
  globalThis.window = browser
  await server.ssrLoadModule(`/src/main.js?page=${++pageNumber}`)
  return () => browser.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
}

test('Lỗi preload thử tải lại một lần, cho thử lại sau đủ 10 giây', async (t) => {
  let now = 50_000
  t.mock.method(Date, 'now', () => now)
  const tab = { storage: new Map(), reloads: 0 }
  const firstError = await openPage(tab)
  assert.equal(firstError(), false)
  assert.equal(tab.storage.get(key), '50000')
  const errorAfterReload = await openPage(tab)
  now = 59_999
  assert.equal(errorAfterReload(), true)
  assert.equal(tab.reloads, 1)
  now = 60_000
  assert.equal(errorAfterReload(), false)
  assert.equal(tab.reloads, 2)
})

test('Bộ nhớ bị chặn: dùng history.state qua lần tải lại và giữ thông tin router', async (t) => {
  t.mock.method(Date, 'now', () => 50_000)
  for (const blocked of [{ blockRead: true }, { blockWrite: true }]) {
    const tab = { storage: new Map(), state: { position: 7, current: '/admin' }, reloads: 0, ...blocked }
    const firstError = await openPage(tab)
    assert.equal(firstError(), false)
    assert.deepEqual(tab.state, { position: 7, current: '/admin', [key]: 50_000 })
    const errorAfterReload = await openPage(tab)
    assert.equal(errorAfterReload(), true)
    assert.equal(tab.reloads, 1)
  }
})

test('Giữ lỗi gốc nếu cả bộ nhớ và lịch sử đều không ghi được lần thử', async () => {
  const tab = { storage: new Map(), blockWrite: true, blockHistory: true, reloads: 0 }
  const onError = await openPage(tab)
  assert.equal(onError(), true)
  assert.equal(tab.reloads, 0)
})
