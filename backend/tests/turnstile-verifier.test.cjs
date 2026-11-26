const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createTurnstileVerifier,
  TurnstileVerificationError,
} = require('../turnstile-verifier.cjs');

const successfulResponse = (overrides = {}) => ({
  ok: true,
  async json() {
    return { success: true, hostname: 'reshare.pages.dev', action: 'contact', ...overrides };
  },
});

test('sends the token to Siteverify and requires success, expected hostname, and contact action', async () => {
  let request;
  const verify = createTurnstileVerifier({
    secretKey: 'server-only-test-secret',
    expectedHostname: 'ReShare.Pages.Dev.',
    fetchImpl: async (...args) => {
      request = args;
      return successfulResponse();
    },
  });

  assert.equal(await verify('challenge-token'), true);
  assert.equal(request[0], 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(request[1].method, 'POST');
  assert.equal(request[1].headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(request[1].body.get('secret'), 'server-only-test-secret');
  assert.equal(request[1].body.get('response'), 'challenge-token');
});

test('rejects unsuccessful, wrong-hostname, and wrong-action responses', async () => {
  const responses = [
    successfulResponse({ success: false }),
    successfulResponse({ hostname: 'attacker.example' }),
    successfulResponse({ action: 'other' }),
  ];

  for (const response of responses) {
    const verify = createTurnstileVerifier({
      secretKey: 'test-secret',
      expectedHostname: 'reshare.pages.dev',
      fetchImpl: async () => response,
    });
    await assert.rejects(verify('challenge-token'), error =>
      error instanceof TurnstileVerificationError && error.status === 400);
  }
});

test('fails closed for missing config, network errors, unsuccessful HTTP responses, and invalid JSON', async () => {
  const missingConfig = createTurnstileVerifier({ expectedHostname: 'reshare.pages.dev' });
  await assert.rejects(missingConfig('challenge-token'), { status: 503 });

  const verifyWith = fetchImpl => createTurnstileVerifier({
    secretKey: 'test-secret',
    expectedHostname: 'reshare.pages.dev',
    fetchImpl,
  });
  await assert.rejects(verifyWith(async () => { throw new Error('network'); })('token'), { status: 503 });
  await assert.rejects(verifyWith(async () => ({ ok: false }))('token'), { status: 503 });
  await assert.rejects(verifyWith(async () => ({
    ok: true,
    async json() { throw new Error('invalid response'); },
  }))('token'), { status: 503 });
});
