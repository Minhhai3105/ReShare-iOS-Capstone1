// For separate web/backend origins, set this URL and allow the exact web origin on the backend.
const CONTACT_ENDPOINT = import.meta.env.VITE_CONTACT_API_URL || '/v1/contact'

export class ContactRequestError extends Error {
  constructor(status) {
    super('Contact request failed')
    this.status = status
  }
}

export async function submitContact(contact) {
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
