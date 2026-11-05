const test = require('node:test');
const assert = require('node:assert/strict');
const { createDonationResubmitApi } = require('../donation-resubmit-api.cjs');

function setup() {
  const images = ['a', 'b', 'c'].map(letter => { const id = `${letter.repeat(8)}-${letter.repeat(4)}-4${letter.repeat(3)}-8${letter.repeat(3)}-${letter.repeat(12)}`; return `donations/11111111-1111-4111-8111-111111111111/${id}`; });
  const documents = new Map([
    ['donations/11111111-1111-4111-8111-111111111111', { id: '11111111-1111-4111-8111-111111111111', donorId: 'owner', status: 'pending', reviewState: 'needs_information', version: 2,
      warehouseId: 'warehouse-a', title: 'Old', description: '', category: 'books', condition: 'good', imageProvider: 'cloudinary', imagePublicIds: images }],
    ['image_upload_batches/donation_11111111-1111-4111-8111-111111111111', { ownerUid: 'owner', assets: Object.fromEntries(images.map((id, i) => [i, id])) }],
  ]);
  const ref = key => ({ key, id: key.split('/').at(-1) });
  const snapshot = reference => ({ exists: documents.has(reference.key), data: () => structuredClone(documents.get(reference.key)) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction: async work => {
    const writes = [];
    const result = await work({ get: async reference => snapshot(reference),
      set: (reference, value) => writes.push(() => documents.set(reference.key, value)),
      update: (reference, value) => writes.push(() => documents.set(reference.key, { ...documents.get(reference.key), ...value })) });
    writes.forEach(write => write()); return result;
  } };
  const api = createDonationResubmitApi({ db, verifyToken: async token => ({ uid: token }), serverTimestamp: () => 'test-time' });
  const draft = { title: 'Books clarified', description: 'More information', category: 'books', condition: 'good', quantity: 3, unitId: 'piece', expectedVersion: 2, idempotencyKey: 'retry-key-123456789' };
  const call = (body = draft, owner = 'owner') => api.handle('POST', '/v1/donations/11111111-1111-4111-8111-111111111111/resubmit', { authorization: `Bearer ${owner}` }, body);
  return { documents, draft, call, api };
}

test('Only the owner can resubmit; private operational fields cannot be supplied', async () => {
  const { call, draft, api } = setup();
  await assert.rejects(api.handle('POST', '/v1/donations/11111111-1111-4111-8111-111111111111/resubmit', {}, draft), { status: 401 });
  await assert.rejects(call(draft, 'another-user'), { status: 403 });
  await assert.rejects(call({ ...draft, warehouseId: 'another-warehouse' }), { status: 400 });
  await assert.rejects(call({ ...draft, status: 'approved' }), { status: 400 });
});

test('Resubmit clears the information hold, increments version and saves a private audit', async () => {
  const { call, documents } = setup();
  const result = await call();
  assert.equal(result.status, 200);
  const item = documents.get('donations/11111111-1111-4111-8111-111111111111');
  assert.equal(item.reviewState, null);
  assert.equal(item.status, 'pending');
  assert.equal(item.version, 3);
  assert.equal(item.warehouseId, 'warehouse-a');
  assert.equal(item.history.at(-1).action, 'resubmit');
  assert.equal(item.history.at(-1).internalNote, undefined);
  const audits = [...documents.entries()].filter(([key]) => key.startsWith('donation_resubmissions/'));
  assert.equal(audits.length, 1);
  assert.equal(audits[0][1].before.title, 'Old');
  assert.equal(audits[0][1].after.title, 'Books clarified');
  assert.equal((await call()).body.idempotentReplay, true);
  assert.equal(documents.get('donations/11111111-1111-4111-8111-111111111111').version, 3);
});

test('Stale versions, wrong lifecycle and changed replay content cannot overwrite data', async () => {
  const { call, draft, documents } = setup();
  await assert.rejects(call({ ...draft, expectedVersion: 1 }), { status: 409 });
  await call();
  await assert.rejects(call({ ...draft, title: 'Different' }), { status: 409 });
  await assert.rejects(call({ ...draft, expectedVersion: 3, idempotencyKey: 'another-key-123456' }), { status: 409 });
  documents.get('donations/11111111-1111-4111-8111-111111111111').status = 'approved';
  await assert.rejects(call({ ...draft, expectedVersion: 3, idempotencyKey: 'third-key-12345678' }), { status: 409 });
});

test('Replacement images require an owner upload batch and remain linked for read and cleanup checks', async () => {
  const { call, draft, documents } = setup();
  const imagePublicIds = ['d', 'e', 'f'].map(letter => { const id = `${letter.repeat(8)}-${letter.repeat(4)}-4${letter.repeat(3)}-8${letter.repeat(3)}-${letter.repeat(12)}`; return `donations/22222222-2222-4222-8222-222222222222/${id}`; });
  const body = { ...draft, imagePublicIds, imageUploadRecordId: '22222222-2222-4222-8222-222222222222' };
  await assert.rejects(call(body), { status: 403 });
  documents.set('image_upload_batches/donation_22222222-2222-4222-8222-222222222222', { ownerUid: 'someone-else', assets: { x: imagePublicIds[0], y: imagePublicIds[1], z: imagePublicIds[2] } });
  await assert.rejects(call(body), { status: 403 });
  documents.get('image_upload_batches/donation_22222222-2222-4222-8222-222222222222').ownerUid = 'owner';
  await call(body);
  assert.equal(documents.get('donations/11111111-1111-4111-8111-111111111111').imageUploadRecordId, '22222222-2222-4222-8222-222222222222');
  assert.equal(documents.get('image_upload_batches/donation_22222222-2222-4222-8222-222222222222').attachedDonationId, '11111111-1111-4111-8111-111111111111');
});

test('Legacy or unverifiable kept images request replacement without changing donation or audit', async () => {
  for (const variant of ['missing', 'empty', 'two', 'malformed', 'missing-batch', 'wrong-owner']) {
    const { call, documents } = setup();
    const donation = documents.get('donations/11111111-1111-4111-8111-111111111111');
    if (variant === 'missing') delete donation.imagePublicIds;
    if (variant === 'empty') donation.imagePublicIds = [];
    if (variant === 'two') donation.imagePublicIds = donation.imagePublicIds.slice(0, 2);
    if (variant === 'malformed') donation.imagePublicIds = ['legacy-a', 'legacy-b', 'legacy-c'];
    if (variant === 'missing-batch') documents.delete('image_upload_batches/donation_11111111-1111-4111-8111-111111111111');
    if (variant === 'wrong-owner') documents.get('image_upload_batches/donation_11111111-1111-4111-8111-111111111111').ownerUid = 'someone-else';
    const before = structuredClone([...documents]);
    await assert.rejects(call(), { status: 400, code: 'REPLACEMENT_IMAGES_REQUIRED' }, variant);
    assert.deepEqual([...documents], before, variant);
  }
});

test('A legacy donation recovers with a new owner-authorized batch and retains retry safety', async () => {
  const { call, draft, documents } = setup();
  const donation = documents.get('donations/11111111-1111-4111-8111-111111111111');
  delete donation.imagePublicIds;
  delete donation.imageProvider;
  const uploadId = '22222222-2222-4222-8222-222222222222';
  const imagePublicIds = ['d', 'e', 'f'].map(letter => `donations/${uploadId}/${letter.repeat(8)}-${letter.repeat(4)}-4${letter.repeat(3)}-8${letter.repeat(3)}-${letter.repeat(12)}`);
  documents.set(`image_upload_batches/donation_${uploadId}`, { ownerUid: 'owner', assets: Object.fromEntries(imagePublicIds.map((id, i) => [i, id])) });
  const body = { ...draft, imagePublicIds, imageUploadRecordId: uploadId };
  assert.equal((await call(body)).status, 200);
  assert.equal((await call(body)).body.idempotentReplay, true);
  const updated = documents.get('donations/11111111-1111-4111-8111-111111111111');
  assert.equal(updated.version, 3);
  assert.equal(updated.reviewState, null);
  assert.deepEqual(updated.imagePublicIds, imagePublicIds);
});

test('Explicit invalid replacement fields cannot silently reuse old images', async () => {
  const { call, draft } = setup();
  for (const imagePublicIds of [null, [], ['bad-public-id']]) {
    await assert.rejects(call({ ...draft, imagePublicIds }), { status: 400 });
  }
});
