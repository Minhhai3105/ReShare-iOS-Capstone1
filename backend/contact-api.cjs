const { createHash, randomUUID } = require('node:crypto');

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 5000;
// A rolling per-email window is a small, persistent limit suitable for a public demo form.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 3;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validateContact(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Invalid contact data');
  }

  const { name, email, message } = body;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_NAME_LENGTH) {
    throw new ApiError(400, 'Invalid name');
  }
  if (typeof email !== 'string' || !email.trim() || email.trim().length > MAX_EMAIL_LENGTH ||
      !EMAIL_PATTERN.test(email.trim())) {
    throw new ApiError(400, 'Invalid email');
  }
  if (typeof message !== 'string' || !message.trim() || message.trim().length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(400, 'Invalid message');
  }

  return { name: name.trim(), email: email.trim(), message: message.trim() };
}

function createContactApi({ db, verifyToken, serverTimestamp, now = Date.now }) {
  if (!db || !verifyToken || !serverTimestamp) {
    throw new Error('Contact API configuration is incomplete');
  }

  async function submit(body) {
    const contact = validateContact(body);
    const currentTime = now();
    const rateKey = createHash('sha256').update(contact.email.toLowerCase()).digest('hex');
    const rateRef = db.collection('contact_rate_limits').doc(rateKey);
    const contactRef = db.collection('contacts').doc(randomUUID());

    await db.runTransaction(async transaction => {
      const rateSnapshot = await transaction.get(rateRef);
      const recentSubmissions = (rateSnapshot.exists ? rateSnapshot.data().timestampsMs : [])
        .filter(timestamp => Number.isSafeInteger(timestamp) && timestamp > currentTime - RATE_LIMIT_WINDOW_MS)
        .sort((left, right) => left - right);

      if (recentSubmissions.length >= MAX_SUBMISSIONS_PER_WINDOW) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((recentSubmissions[0] + RATE_LIMIT_WINDOW_MS - currentTime) / 1000),
        );
        throw new ApiError(429, `Too many requests. Retry after ${retryAfterSeconds} seconds.`);
      }

      transaction.set(contactRef, {
        ...contact,
        status: 'new',
        createdAt: serverTimestamp(),
      });
      transaction.set(rateRef, { timestampsMs: [...recentSubmissions, currentTime] });
    });

    return { status: 201, body: { status: 'received' } };
  }

  async function list(headers) {
    const authHeader = headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!match) throw new ApiError(401, 'Sign in required');

    let claims;
    try {
      claims = await verifyToken(match[1]);
    } catch {
      throw new ApiError(401, 'Invalid session');
    }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');

    const assignment = await db.collection('staff_assignments').doc(claims.uid).get();
    if (!assignment.exists || assignment.data().active !== true ||
        assignment.data().role !== 'system_admin') {
      throw new ApiError(403, 'Only an active System Admin may read contacts');
    }

    const snapshot = await db.collection('contacts')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return {
      status: 200,
      body: {
        contacts: snapshot.docs.map(document => {
          const { name, email, message, status, createdAt } = document.data();
          return { id: document.id, name, email, message, status, createdAt };
        }),
      },
    };
  }

  async function handle(method, path, headers, body) {
    if (path !== '/v1/contact') throw new ApiError(404, 'Not found');
    if (method === 'POST') return submit(body);
    if (method === 'GET') return list(headers);
    throw new ApiError(404, 'Not found');
  }

  return { handle };
}

module.exports = {
  ApiError,
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SUBMISSIONS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  createContactApi,
  validateContact,
};
