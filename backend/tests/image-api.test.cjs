const test = require('node:test');
const assert = require('node:assert/strict');
const { createImageApi } = require('../image-api.cjs');

const donationId = '6d4a2909-bb7f-459d-bbcd-2117d96ff7e1';
const catalogId = `cat_${donationId}`;
const clientImageId = '12c135b8-1c53-4de1-a244-5e1a5f7da92a';

function setup() {
  const documents = new Map();
  const ref = (collection, id) => ({
    key: `${collection}/${id}`,
    async get() { return snapshot(documents.get(this.key)); }
  });
  const db = {
    collection(name) { return { doc(id) { return ref(name, id); } }; },
    async runTransaction(work) {
      const writes = [];
      const result = await work({
        get: async reference => snapshot(documents.get(reference.key)),
        set: (reference, data) => writes.push([reference.key, data])
      });
      for (const [key, data] of writes) documents.set(key, data);
      return result;
    }
  };
  const destroyed = [];
  const cloudinary = {
    utils: {
      api_sign_request: params => JSON.stringify(params),
      private_download_url: () => 'https://api.cloudinary.com/private-image'
    },
    uploader: { async destroy(id, options) { destroyed.push({ id, options }); return { result: 'ok' }; } },
    api: { async resource(id) { return { public_id: id, type: 'authenticated', format: 'jpg' }; } }
  };
  const api = createImageApi({ db, verifyToken: async token => ({ uid: token, role: token === 'admin' ? 'system_admin' : 'donor' }), cloudinary, cloudName: 'c9ide1cv', apiKey: 'public-key', apiSecret: 'test-only', now: () => 1780000000000 });
  const call = (path, uid, body) => api.handle('POST', path, { authorization: `Bearer ${uid}` }, body);
  return { documents, destroyed, call, api };
}

function snapshot(data) { return { exists: data !== undefined, data: () => data }; }

test('intent is signed for the server-selected type and bound to its owner', async () => {
  const { call, documents } = setup();
  const request = { purpose: 'donation', recordId: donationId, clientImageId };
  const first = (await call('/v1/images/upload-intents', 'donor', request)).body;
  assert.equal(first.deliveryType, 'authenticated');
  assert.equal(first.cloudName, 'c9ide1cv');
  assert.equal(JSON.parse(first.signature).overwrite, 'false');
  assert.equal((await call('/v1/images/upload-intents', 'donor', request)).body.publicId, first.publicId);
  await assert.rejects(call('/v1/images/upload-intents', 'other', request), { status: 403 });
  assert.equal(documents.get('image_upload_quotas/donor_2026-05-28').count, 1);
});

test('catalog intent uses public delivery; no token is rejected', async () => {
  const { call, api } = setup();
  const result = (await call('/v1/images/upload-intents', 'donor', { purpose: 'catalog_item', recordId: catalogId, clientImageId })).body;
  assert.equal(result.deliveryType, 'upload');
  await assert.rejects(api.handle('POST', '/v1/images/upload-intents', {}, {}), { status: 401 });
});

test('cleanup cannot remove another owner image or an attached image', async () => {
  const { call, destroyed, documents } = setup();
  const publicId = (await call('/v1/images/upload-intents', 'donor', { purpose: 'donation', recordId: donationId, clientImageId })).body.publicId;
  const request = { purpose: 'donation', recordId: donationId, publicIds: [publicId] };
  await assert.rejects(call('/v1/images/cleanup', 'other', request), { status: 403 });
  documents.set(`donations/${donationId}`, { donorId: 'donor', imagePublicIds: [publicId] });
  await assert.rejects(call('/v1/images/cleanup', 'donor', request), { status: 409 });
  assert.equal(destroyed.length, 0);
  documents.delete(`donations/${donationId}`);
  await call('/v1/images/cleanup', 'donor', request);
  assert.equal(destroyed[0].options.type, 'authenticated');
});

test('private donation image requires donor or system admin plus attached intent', async () => {
  const { call, documents } = setup();
  const publicId = (await call('/v1/images/upload-intents', 'donor', { purpose: 'donation', recordId: donationId, clientImageId })).body.publicId;
  documents.set(`donations/${donationId}`, { donorId: 'donor', imageProvider: 'cloudinary', imagePublicIds: [publicId] });
  const request = { donationId, publicId };
  await assert.rejects(call('/v1/images/read-access', 'other', request), { status: 403 });
  await assert.rejects(call('/v1/images/read-access', 'warehouse', request), { status: 403 });
  assert.match((await call('/v1/images/read-access', 'donor', request)).body.url, /^https:/);
  assert.match((await call('/v1/images/read-access', 'admin', request)).body.url, /^https:/);
});
