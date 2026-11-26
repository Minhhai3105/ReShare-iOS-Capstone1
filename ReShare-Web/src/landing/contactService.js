const env = import.meta.env || {}
const CONTACT_ENDPOINT = env.VITE_CONTACT_API_URL || (env.DEV ? '/v1/contact' : null)
export const contactTurnstileSiteKey = env.VITE_TURNSTILE_SITE_KEY?.trim() || ''
export const isContactConfigured = Boolean(CONTACT_ENDPOINT && contactTurnstileSiteKey)

export class ContactRequestError extends Error {
  constructor(status, retryAfterSeconds = null) {
    super('Contact request failed')
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export async function submitContact(contact, overrides = {}) {
  const { endpoint = CONTACT_ENDPOINT, fetchImpl = fetch } = overrides
  if (!endpoint) throw new ContactRequestError(503)
  let response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contact),
    })
  } catch {
    throw new ContactRequestError(0)
  }

  if (!response.ok) {
    const rawRetryAfter = response.headers?.get?.('Retry-After')
    const retryAfterSeconds = /^\d+$/.test(rawRetryAfter || '') ? Number(rawRetryAfter) : null
    throw new ContactRequestError(
      response.status,
      Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : null,
    )
  }
  let result
  try {
    result = await response.json()
  } catch {
    throw new ContactRequestError(response.status)
  }
  if (result?.status !== 'received') throw new ContactRequestError(response.status)
}
