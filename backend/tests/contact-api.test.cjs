const test = require('node:test');
const assert = require('node:assert/strict');
const { createContactApi, MAX_SUBMISSIONS_PER_WINDOW, RATE_LIMIT_WINDOW_MS } = require('../contact-api.cjs');

function setup() {
  let currentTime = 1780000000000;
  let nextId = 0;
  const documents = new Map();
  const reads = [];
  let afterContactsRead;
  const snapshotOf = (id, data) => ({ id, exists: data !== undefined, data: () => data, get: field => data?.[field] });
  const collection = (name, orders = [], maximum = Infinity, cursor = null) => ({
    doc(id) {
      const key = `${name}/${id}`;
      return {
        id,
        key,
        async get() { return snapshotOf(id, documents.get(key)); },
      };
    },
    orderBy(field, direction) { return collection(name, [...orders, [typeof field === 'string' ? field : '__name__', direction]], maximum, cursor); },
    startAfter(doc) { return collection(name, orders, maximum, doc); },
    limit(count) { return collection(name, orders, count, cursor); },
    async get() {
      const compare = (a, b) => {
        for (const [field, direction] of orders) {
          const left = field === '__name__' ? a.id : a.get(field);
          const right = field === '__name__' ? b.id : b.get(field);
          const difference = left < right ? -1 : left > right ? 1 : 0;
          if (difference) return direction === 'desc' ? -difference : difference;
        }
        return 0;
      };
      let docs = [...documents.entries()]
        .filter(([key]) => key.startsWith(`${name}/`))
        .map(([key, data]) => snapshotOf(key.slice(name.length + 1), data)).sort(compare);
      if (cursor) docs = docs.filter(doc => compare(doc, cursor) > 0);
      docs = docs.slice(0, maximum);
      reads.push({ name, count: docs.length, limit: maximum });
      if (name === 'contacts') afterContactsRead?.();
      return { docs };
    },
  });
  const db = {
    collection,
    async runTransaction(work) {
      const writes = [];
      const result = await work({
        get: async reference => snapshot(documents.get(reference.key)),
        set: (reference, data) => writes.push([reference.key, data]),
      });
      for (const [key, data] of writes) documents.set(key, data);
      return result;
    },
  };
  const api = createContactApi({
    db,
    verifyToken: async token => {
      if (token === 'invalid') throw new Error('Invalid token');
      return { uid: token };
    },
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    now: () => currentTime,
  });
  documents.set('staff_assignments/admin', { active: true, role: 'system_admin' });
  const body = { name: '  Test User ', email: 'TEST@example.com ', message: '  Hello ReShare  ' };
  const post = (requestBody = body) => api.handle('POST', '/v1/contact', {}, requestBody);
  const get = (authorization = '', query = '') => api.handle('GET', '/v1/contact', { authorization }, null, `/v1/contact${query}`);

  return {
    api, body, documents, get, post, reads,
    onContactsRead(callback) { afterContactsRead = callback; },
    advanceTime(milliseconds) { currentTime += milliseconds; },
  };
}

function snapshot(data) {
  return { exists: data !== undefined, data: () => data };
}

test('valid contact is normalized and atomically stored in the internal inbox', async () => {
  const { post, documents } = setup();
  const result = await post();

  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { status: 'received' });
  const saved = [...documents.entries()].find(([key]) => key.startsWith('contacts/'))[1];
  assert.deepEqual(saved, {
    name: 'Test User',
    email: 'TEST@example.com',
    message: 'Hello ReShare',
    status: 'new',
    createdAt: 'SERVER_TIMESTAMP',
  });
});

test('rejects empty, malformed, non-string, and oversized fields without storing', async () => {
  const { post, documents } = setup();
  const invalidBodies = [
    { name: '  ', email: 'a@example.com', message: 'hello' },
    { name: 'Name', email: 'not-an-email', message: 'hello' },
    { name: 'Name', email: 'a@example.com', message: '  ' },
    { name: 12, email: 'a@example.com', message: 'hello' },
    { name: 'x'.repeat(101), email: 'a@example.com', message: 'hello' },
    { name: 'Name', email: 'x'.repeat(249) + '@a.com', message: 'hello' },
    { name: 'Name', email: 'a@example.com', message: 'x'.repeat(5001) },
  ];

  for (const body of invalidBodies) {
    await assert.rejects(post(body), { status: 400 });
  }
  assert.equal([...documents.keys()].filter(key => key.startsWith('contacts/')).length, 0);
});

test('limits an email to three submissions in ten minutes and allows retry after the window', async () => {
  const { advanceTime, documents, post } = setup();
  for (let index = 0; index < MAX_SUBMISSIONS_PER_WINDOW; index += 1) await post();
  await assert.rejects(post(), { status: 429 });
  assert.equal([...documents.keys()].filter(key => key.startsWith('contacts/')).length, 3);

  advanceTime(RATE_LIMIT_WINDOW_MS);
  assert.equal((await post()).status, 201);
});

test('contact inbox is restricted to active System Admins', async () => {
  const { documents, get, post } = setup();
  await post();
  documents.set('staff_assignments/warehouse', { active: true, role: 'warehouse_admin' });
  documents.set('staff_assignments/inactive', { active: false, role: 'system_admin' });

  await assert.rejects(get(), { status: 401 });
  await assert.rejects(get('Bearer invalid'), { status: 401 });
  await assert.rejects(get('Bearer unknown'), { status: 403 });
  await assert.rejects(get('Bearer warehouse'), { status: 403 });
  await assert.rejects(get('Bearer inactive'), { status: 403 });
  const result = await get('Bearer admin');
  assert.equal(result.status, 200);
  assert.equal(result.body.contacts.length, 1);
  assert.deepEqual(
    Object.keys(result.body.contacts[0]).sort(),
    ['createdAt', 'email', 'id', 'message', 'name', 'status'],
  );
});

test('unknown paths and methods are rejected', async () => {
  const { api } = setup();
  await assert.rejects(api.handle('POST', '/contact', {}, {}), { status: 404 });
  await assert.rejects(api.handle('DELETE', '/v1/contact', {}, {}), { status: 404 });
});

test('Inbox pagination is bounded and stable when contacts have the same timestamp', async () => {
  const { documents, get, reads } = setup();
  const createdAt = new Date('2026-11-05T03:00:00Z');
  for (let i = 0; i < 55; i++) documents.set(`contacts/contact_${String(i).padStart(2, '0')}`, {
    name: 'Test User', email: 'qa@example.com', message: `Message ${i}`, status: 'new', createdAt, internalSecret: 'not for clients',
  });
  const seen = [];
  let cursor = null;
  do {
    const result = await get('Bearer admin', `?limit=20${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(result.body.pageSize, 20);
    assert.ok(result.body.contacts.length <= 20);
    for (const contact of result.body.contacts) {
      assert.equal(contact.createdAt, createdAt.toISOString());
      assert.equal(contact.internalSecret, undefined);
      seen.push(contact.id);
    }
    cursor = result.body.nextCursor;
    assert.equal(result.body.hasMore, Boolean(cursor));
  } while (cursor);
  assert.equal(seen.length, 55);
  assert.equal(new Set(seen).size, 55);
  assert.deepEqual(seen, Array.from({ length: 55 }, (_, i) => `contact_${String(54 - i).padStart(2, '0')}`));
  assert.ok(reads.filter(row => row.name === 'contacts').every(row => row.limit === 21 && row.count <= 21));
});

test('Invalid limits and cursors fail instead of exposing an unbounded inbox', async () => {
  const { get, documents } = setup();
  for (const query of ['?limit=0', '?limit=51', '?limit=-1', '?limit=1.5', '?limit=', '?limit=20&limit=10', '?cursor=bad', '?cursor=a&cursor=b']) {
    await assert.rejects(get('Bearer admin', query), { status: 400 }, query);
  }
  const cursor = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  for (const value of [{ v: 1, id: 'missing', filterKey: 'contact-inbox' }, { v: 1, id: 'x', filterKey: 'other' }, { v: 1, id: '../private', filterKey: 'contact-inbox' }]) {
    await assert.rejects(get('Bearer admin', `?cursor=${cursor(value)}`), { status: 400 });
  }
  documents.set('contacts/no-time', { name: 'Legacy' });
  await assert.rejects(get('Bearer admin', `?cursor=${cursor({ v: 1, id: 'no-time', filterKey: 'contact-inbox' })}`), { status: 400 });
  await assert.rejects(get('', '?cursor=bad'), { status: 401 });
});

test('Revoking a System Admin while the query runs prevents the private response', async () => {
  const { get, post, documents, onContactsRead } = setup();
  await post();
  onContactsRead(() => documents.set('staff_assignments/admin', { role: 'system_admin', active: false }));
  await assert.rejects(get('Bearer admin'), { status: 403 });
});
