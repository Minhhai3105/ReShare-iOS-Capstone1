export const CONTACT_PAGE_SIZE = 20
const env = import.meta.env || {}
const DEFAULT_ENDPOINT = env.VITE_CONTACT_API_URL ||
  `${(env.VITE_ADMIN_API_BASE_URL || 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')}/v1/contact`

const failure = (status) => Object.assign(new Error('Không tải được liên hệ'), { status })

async function getSessionToken() {
  const { auth } = await import('../auth/firebase.js')
  if (!auth.currentUser) throw failure(401)
  try { return await auth.currentUser.getIdToken() }
  catch (error) {
    if (['auth/invalid-user-token', 'auth/user-token-expired', 'auth/user-disabled', 'auth/user-signed-out'].includes(error?.code)) throw failure(401)
    throw error
  }
}

export async function fetchContactInbox({ cursor = null, signal } = {}, overrides = {}) {
  const { endpoint = DEFAULT_ENDPOINT, getToken = getSessionToken, fetchImpl = fetch } = overrides
  const token = await getToken()
  if (!token) throw failure(401)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const url = new URL(endpoint)
  url.searchParams.set('limit', String(CONTACT_PAGE_SIZE))
  if (cursor) url.searchParams.set('cursor', cursor)
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal, cache: 'no-store' })
  if (!response.ok) throw failure(response.status)
  let data
  try { data = await response.json() } catch { throw failure('INVALID_PAYLOAD') }
  const text = (value, max) => typeof value === 'string' && Boolean(value.trim()) && value.length <= max
  if (!Array.isArray(data?.contacts) || data.contacts.length > CONTACT_PAGE_SIZE || data.pageSize !== CONTACT_PAGE_SIZE ||
      typeof data.hasMore !== 'boolean' ||
      (data.hasMore ? !text(data.nextCursor, 2048) || data.contacts.length !== CONTACT_PAGE_SIZE : data.nextCursor !== null) ||
      !data.contacts.every(item => item && text(item.id, 128) && text(item.name, 100) && text(item.email, 254) &&
        text(item.message, 5000) && typeof item.status === 'string' &&
        (item.createdAt === null || typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)))) ||
      new Set(data.contacts.map(item => item.id)).size !== data.contacts.length) throw failure('INVALID_PAYLOAD')
  return data
}
