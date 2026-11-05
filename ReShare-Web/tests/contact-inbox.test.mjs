import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchContactInbox, CONTACT_PAGE_SIZE } from '../src/admin/contacts/contact-inbox.service.js'
import { useContactInbox } from '../src/admin/contacts/useContactInbox.js'

const contact = id => ({ id, name: 'Nguyễn Văn An', email: 'an@example.com', message: 'Nội dung\nDòng thứ hai', status: 'new', createdAt: '2026-11-05T03:00:00.000Z' })
const page = (contacts = [], nextCursor = null) => ({ contacts, pageSize: CONTACT_PAGE_SIZE, hasMore: Boolean(nextCursor), nextCursor })
const call = (fetchImpl, getToken = async () => 'private-token', options = {}) => fetchContactInbox(options, { endpoint: 'https://api.example.test/v1/contact', getToken, fetchImpl })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('Inbox uses authenticated GET with bounded pagination and credentials outside the URL', async () => {
  let request
  const result = await call(async (url, options) => { request = { url, options }; return { ok: true, json: async () => page([contact('a')]) } }, undefined, { cursor: 'safe-cursor' })
  assert.equal(request.url.pathname, '/v1/contact')
  assert.equal(request.url.searchParams.get('limit'), '20')
  assert.equal(request.url.searchParams.get('cursor'), 'safe-cursor')
  assert.equal(request.options.headers.Authorization, 'Bearer private-token')
  assert.equal(request.options.cache, 'no-store')
  assert.ok(!request.url.toString().includes('private-token'))
  assert.equal(result.contacts[0].name, 'Nguyễn Văn An')
})

test('Missing or late authentication cannot issue an inbox request', async () => {
  await assert.rejects(call(async () => assert.fail('No request without a session'), async () => ''), { status: 401 })
  const controller = new AbortController(), token = deferred()
  const pending = call(async () => assert.fail('No request after abort'), () => token.promise, { signal: controller.signal })
  controller.abort(); token.resolve('late-token')
  await assert.rejects(pending, { name: 'AbortError' })
})

test('Permission, network and malformed responses stay errors instead of becoming empty data', async () => {
  for (const status of [401, 403, 500]) await assert.rejects(call(async () => ({ ok: false, status })), { status })
  await assert.rejects(call(async () => { throw new TypeError('offline') }), TypeError)
  const invalid = [null, {}, { contacts: [] }, page([contact('a'), contact('a')]), page([{ ...contact('a'), createdAt: {} }]), page([{ ...contact('a'), message: null }]), { ...page(), hasMore: true }, { ...page(), nextCursor: 'unexpected' }]
  for (const data of invalid) await assert.rejects(call(async () => ({ ok: true, json: async () => data })), { status: 'INVALID_PAYLOAD' })
  await assert.rejects(call(async () => ({ ok: true, json: async () => { throw new Error('bad JSON') } })), { status: 'INVALID_PAYLOAD' })
})

test('Next, previous and refresh use cursor history without retaining old page contents', async () => {
  const seen = []
  const inbox = useContactInbox(async ({ cursor }) => {
    seen.push(cursor)
    return cursor ? page([contact('older')]) : page([contact('newest')], 'second-page')
  })
  try {
    await inbox.refresh(); assert.equal(inbox.state.selectedId, 'newest')
    await inbox.next(); assert.equal(inbox.state.page, 2); assert.equal(inbox.state.selectedId, 'older')
    await inbox.previous(); assert.equal(inbox.state.page, 1)
    await inbox.next(); await inbox.refresh()
    assert.deepEqual(seen, [null, 'second-page', null, 'second-page', null])
    assert.equal(inbox.state.page, 1)
    inbox.select('nonexistent'); assert.equal(inbox.state.selectedId, 'newest')
  } finally { inbox.clear() }
})

test('Refresh wins over stale responses and permission loss clears private data', async () => {
  const requests = []
  const inbox = useContactInbox(({ signal }) => { const item = deferred(); requests.push({ ...item, signal }); return item.promise })
  const first = inbox.refresh(), second = inbox.refresh()
  assert.equal(requests[0].signal.aborted, true)
  requests[1].resolve(page([contact('current')]))
  await second
  requests[0].resolve(page([contact('stale')]))
  await first
  assert.equal(inbox.state.contacts[0].id, 'current')
  const last = inbox.refresh()
  inbox.clear()
  assert.equal(requests[2].signal.aborted, true)
  requests[2].resolve(page([contact('must-stay-hidden')]))
  await last
  assert.deepEqual(inbox.state.contacts, [])
  assert.equal(inbox.state.selectedId, null)
  assert.equal(inbox.state.syncedAt, null)
})

test('A denied refresh discards old contacts and selection', async () => {
  let denied = false
  const inbox = useContactInbox(async () => { if (denied) throw Object.assign(new Error('revoked'), { status: 403 }); return page([contact('private')]) })
  await inbox.refresh(); denied = true; await inbox.refresh()
  assert.equal(inbox.state.error, 403)
  assert.equal(inbox.state.contacts.length, 0)
  assert.equal(inbox.state.selectedId, null)
  inbox.clear()
})
