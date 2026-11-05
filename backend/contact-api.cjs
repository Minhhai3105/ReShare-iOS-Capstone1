const { createHash, randomUUID } = require('node:crypto');
const { FieldPath } = require('firebase-admin/firestore');
const { runTransaction } = require('./firestore-transaction.cjs');
const { cursorFor, readCursor } = require('./scoped-pagination.cjs');

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

    await runTransaction(db, async transaction => {
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

  async function requireSystemAdmin(uid) {
    const assignment = await db.collection('staff_assignments').doc(uid).get();
    if (!assignment.exists || assignment.data().active !== true ||
        assignment.data().role !== 'system_admin') {
      throw new ApiError(403, 'Only an active System Admin may read contacts');
    }
  }

  async function list(headers, requestUrl) {
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

    await requireSystemAdmin(claims.uid);
    let params;
    try { params = new URL(requestUrl || '/v1/contact', 'http://localhost').searchParams; }
    catch { throw new ApiError(400, 'Invalid contact query'); }
    const rawLimit = params.get('limit');
    const pageSize = rawLimit === null ? 50 : Number(rawLimit);
    if (params.getAll('limit').length > 1 || params.getAll('cursor').length > 1 ||
        (rawLimit !== null && !/^\d{1,2}$/.test(rawLimit)) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      throw new ApiError(400, 'Contact page size must be between 1 and 50');
    }
    const cursor = await readCursor(db, 'contacts', params.get('cursor'), 'contact-inbox', doc => Boolean(doc.data().createdAt));
    let query = db.collection('contacts')
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc');
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.limit(pageSize + 1).get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;
    // A role revoked while the query is running must not receive the private inbox.
    await requireSystemAdmin(claims.uid);
    return {
      status: 200,
      body: {
        contacts: docs.map(document => {
          const { name, email, message, status, createdAt } = document.data();
          const date = createdAt?.toDate?.() || (createdAt instanceof Date ? createdAt : null);
          return { id: document.id, name, email, message, status, createdAt: date ? date.toISOString() : null };
        }),
        pageSize,
        hasMore,
        nextCursor: hasMore ? cursorFor(docs.at(-1), 'contact-inbox') : null,
      },
    };
  }

  async function handle(method, path, headers, body, requestUrl) {
    if (path !== '/v1/contact') throw new ApiError(404, 'Not found');
    if (method === 'POST') return submit(body);
    if (method === 'GET') return list(headers, requestUrl);
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
