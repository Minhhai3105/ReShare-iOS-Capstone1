const test = require('node:test');
const assert = require('node:assert/strict');
const { createContactApi, MAX_SUBMISSIONS_PER_WINDOW, RATE_LIMIT_WINDOW_MS } = require('../contact-api.cjs');

function setup() {
  let currentTime = 1780000000000;
  let nextId = 0;
  const documents = new Map();
  const collection = name => ({
    doc(id) {
      const key = `${name}/${id}`;
      return {
        id,
        key,
        async get() { return snapshot(documents.get(key)); },
      };
    },
    orderBy() { return this; },
    limit() { return this; },
    async get() {
      const docs = [...documents.entries()]
        .filter(([key]) => key.startsWith(`${name}/`))
        .map(([key, data]) => ({ id: key.slice(name.length + 1), data: () => data }));
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
  const get = (authorization = '') => api.handle('GET', '/v1/contact', { authorization });

  return {
    api, body, documents, get, post,
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
