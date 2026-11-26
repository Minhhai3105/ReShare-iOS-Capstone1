import test from 'node:test'
import assert from 'node:assert/strict'
import { ContactRequestError, submitContact } from '../src/landing/contactService.js'

const contact = {
  name: 'Test User',
  email: 'test@example.com',
  message: 'Hello',
  turnstileToken: 'challenge-token',
}

test('submits the Turnstile token with the contact request', async () => {
  let request
  await submitContact(contact, {
    endpoint: 'https://api.example/v1/contact',
    fetchImpl: async (...args) => {
      request = args
      return { ok: true, async json() { return { status: 'received' } } }
    },
  })

  assert.equal(request[0], 'https://api.example/v1/contact')
  assert.equal(request[1].method, 'POST')
  assert.deepEqual(JSON.parse(request[1].body), contact)
})

test('retains the Retry-After value from a rate-limited response', async () => {
  await assert.rejects(submitContact(contact, {
    endpoint: 'https://api.example/v1/contact',
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: name => name === 'Retry-After' ? '47' : null },
    }),
  }), error => error instanceof ContactRequestError &&
    error.status === 429 && error.retryAfterSeconds === 47)
})

test('ignores malformed Retry-After values', async () => {
  await assert.rejects(submitContact(contact, {
    endpoint: 'https://api.example/v1/contact',
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: () => 'later' },
    }),
  }), error => error instanceof ContactRequestError &&
    error.status === 429 && error.retryAfterSeconds === null)
})
