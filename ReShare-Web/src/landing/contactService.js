// Bản production chỉ nhận liên hệ khi đã cấu hình URL API.
export const isContactConfigured = Boolean(import.meta.env.VITE_CONTACT_API_URL || import.meta.env.DEV)
const CONTACT_ENDPOINT = import.meta.env.VITE_CONTACT_API_URL || (import.meta.env.DEV ? '/v1/contact' : null)

export class ContactRequestError extends Error {
  constructor(status) {
    super('Contact request failed')
    this.status = status
  }
}

export async function submitContact(contact) {
  if (!CONTACT_ENDPOINT) throw new ContactRequestError(503)
  let response
  try {
    response = await fetch(CONTACT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contact),
    })
  } catch {
    throw new ContactRequestError(0)
  }

  if (!response.ok) throw new ContactRequestError(response.status)
  let result
  try {
    result = await response.json()
  } catch {
    throw new ContactRequestError(response.status)
  }
  if (result?.status !== 'received') throw new ContactRequestError(response.status)
}
