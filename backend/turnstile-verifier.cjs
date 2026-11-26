const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EXPECTED_ACTION = 'contact';
const REQUEST_TIMEOUT_MS = 5000;

class TurnstileVerificationError extends Error {
  constructor(status) {
    super(status === 400 ? 'Invalid verification token' : 'Contact verification is unavailable');
    this.status = status;
  }
}

function normalizedHostname(hostname) {
  return typeof hostname === 'string' ? hostname.trim().toLowerCase().replace(/\.$/, '') : '';
}

function createTurnstileVerifier({
  secretKey,
  expectedHostname,
  fetchImpl = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  const secret = typeof secretKey === 'string' ? secretKey.trim() : '';
  const hostname = normalizedHostname(expectedHostname);

  return async function verifyTurnstile(token) {
    if (!secret || !hostname) throw new TurnstileVerificationError(503);

    let response;
    try {
      response = await fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new TurnstileVerificationError(503);
    }

    if (!response.ok) throw new TurnstileVerificationError(503);

    let result;
    try {
      result = await response.json();
    } catch {
      throw new TurnstileVerificationError(503);
    }

    if (result?.success !== true ||
        normalizedHostname(result.hostname) !== hostname ||
        result.action !== EXPECTED_ACTION) {
      throw new TurnstileVerificationError(400);
    }

    return true;
  };
}

module.exports = {
  createTurnstileVerifier,
  TurnstileVerificationError,
};
