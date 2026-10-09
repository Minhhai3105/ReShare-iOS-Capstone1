const { randomUUID } = require('node:crypto');

const MAX_IMAGES_PER_RECORD = 6;
const MAX_INTENTS_PER_USER_PER_DAY = 60;
const RECORD_ID = /^(?:cat_)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function imagePurpose(value) {
  if (value === 'catalog_item') return { collection: 'catalog_items', prefix: 'catalog_items', deliveryType: 'upload' };
  if (value === 'donation') return { collection: 'donations', prefix: 'donations', deliveryType: 'authenticated' };
  throw new ApiError(400, 'Invalid purpose');
}

function validateRecordId(purpose, recordId) {
  if (typeof recordId !== 'string' || !RECORD_ID.test(recordId) ||
      (purpose === 'catalog_item') !== recordId.startsWith('cat_')) {
    throw new ApiError(400, 'Invalid recordId');
  }
}

function validatePublicIds(publicIds, prefix) {
  if (!Array.isArray(publicIds) || publicIds.length < 1 || publicIds.length > MAX_IMAGES_PER_RECORD ||
      new Set(publicIds).size !== publicIds.length ||
      !publicIds.every(id => typeof id === 'string' && id.startsWith(`${prefix}/`) && IMAGE_ID.test(id.slice(prefix.length + 1)))) {
    throw new ApiError(400, 'Invalid publicIds');
  }
}

function createImageApi({ db, verifyToken, cloudinary, cloudName, apiKey, apiSecret, now = Date.now }) {
  if (!db || !verifyToken || !cloudinary || !cloudName || !apiKey || !apiSecret) {
    throw new Error('Image API configuration is incomplete');
  }

  async function recordSnapshot(purpose, recordId) {
    return db.collection(imagePurpose(purpose).collection).doc(recordId).get();
  }

  function batchReference(purpose, recordId) {
    return db.collection('image_upload_batches').doc(`${purpose}_${recordId}`);
  }

  async function uploadIntent(uid, body) {
    const { purpose, recordId, clientImageId } = body;
    const config = imagePurpose(purpose);
    validateRecordId(purpose, recordId);
    if (typeof clientImageId !== 'string' || !IMAGE_ID.test(clientImageId)) {
      throw new ApiError(400, 'Invalid clientImageId');
    }
    if ((await recordSnapshot(purpose, recordId)).exists) {
      throw new ApiError(409, 'Record already published');
    }

    const batchRef = batchReference(purpose, recordId);
    const today = new Date(now()).toISOString().slice(0, 10);
    const quotaRef = db.collection('image_upload_quotas').doc(`${uid}_${today}`);
    const publicId = await db.runTransaction(async transaction => {
      const [batchSnap, quotaSnap] = await Promise.all([
        transaction.get(batchRef), transaction.get(quotaRef)
      ]);
      const batch = batchSnap.exists ? batchSnap.data() : null;
      if (batch && batch.ownerUid !== uid) throw new ApiError(403, 'Record belongs to another user');
      const assets = batch?.assets || {};
      if (assets[clientImageId]) return assets[clientImageId];
      if (Object.keys(assets).length >= MAX_IMAGES_PER_RECORD) throw new ApiError(409, 'Image limit reached');
      const count = quotaSnap.exists ? quotaSnap.data().count : 0;
      if (count >= MAX_INTENTS_PER_USER_PER_DAY) throw new ApiError(429, 'Daily image limit reached');

      const id = `${config.prefix}/${recordId}/${randomUUID()}`;
      transaction.set(batchRef, {
        ownerUid: uid, purpose, recordId,
        assets: { ...assets, [clientImageId]: id },
        createdAtMs: batch?.createdAtMs || now(), updatedAtMs: now()
      });
      transaction.set(quotaRef, { uid, day: today, count: count + 1 });
      return id;
    });

    const timestamp = Math.floor(now() / 1000);
    const signature = cloudinary.utils.api_sign_request({
      timestamp, public_id: publicId, type: config.deliveryType, overwrite: 'false'
    }, apiSecret);
    return { cloudName, apiKey, timestamp, signature, publicId, deliveryType: config.deliveryType };
  }

  async function cleanup(uid, body) {
    const { purpose, recordId, publicIds } = body;
    const config = imagePurpose(purpose);
    validateRecordId(purpose, recordId);
    validatePublicIds(publicIds, `${config.prefix}/${recordId}`);
    const batch = await batchReference(purpose, recordId).get();
    if (!batch.exists || batch.data().ownerUid !== uid) throw new ApiError(403, 'No upload intent');
    const assigned = Object.values(batch.data().assets || {});
    if (!publicIds.every(id => assigned.includes(id))) throw new ApiError(403, 'Image is not owned by this upload');
    const record = await recordSnapshot(purpose, recordId);
    if (record.exists && publicIds.some(id => (record.data().imagePublicIds || []).includes(id))) {
      throw new ApiError(409, 'Image is attached to a published record');
    }
    for (const id of publicIds) {
      const result = await cloudinary.uploader.destroy(id, { resource_type: 'image', type: config.deliveryType, invalidate: true });
      if (!['ok', 'not found'].includes(result.result)) throw new ApiError(502, 'Cloudinary cleanup failed');
    }
    return {};
  }

  async function canStaffReadDonation(uid, donation) {
    const assignment = await db.collection('staff_assignments').doc(uid).get();
    if (!assignment.exists || assignment.data().active !== true) return false;
    const staff = assignment.data();
    if (staff.role === 'system_admin') return true;
    const warehouseId = donation.hubId || donation.warehouseId;
    return staff.role === 'warehouse_admin' && !!warehouseId &&
      Array.isArray(staff.warehouseIds) && staff.warehouseIds.includes(warehouseId);
  }

  async function readAccess(uid, body) {
    const { donationId, publicId } = body;
    validateRecordId('donation', donationId);
    validatePublicIds([publicId], `donations/${donationId}`);
    const donation = await recordSnapshot('donation', donationId);
    if (!donation.exists) throw new ApiError(404, 'Donation not found');
    const data = donation.data();
    if (data.donorId !== uid && !(await canStaffReadDonation(uid, data))) throw new ApiError(403, 'Access denied');
    if (data.imageProvider !== 'cloudinary' || !(data.imagePublicIds || []).includes(publicId)) {
      throw new ApiError(404, 'Image not attached to donation');
    }
    const batch = await batchReference('donation', donationId).get();
    if (!batch.exists || batch.data().ownerUid !== data.donorId ||
        !Object.values(batch.data().assets || {}).includes(publicId)) {
      throw new ApiError(403, 'Image upload was not authorized');
    }
    const asset = await cloudinary.api.resource(publicId, { resource_type: 'image', type: 'authenticated' });
    if (asset.public_id !== publicId || asset.type !== 'authenticated' || !asset.format) {
      throw new ApiError(502, 'Cloudinary image metadata is invalid');
    }
    const url = cloudinary.utils.private_download_url(publicId, asset.format, {
      resource_type: 'image', type: 'authenticated', expires_at: Math.floor(now() / 1000) + 300
    });
    if (typeof url !== 'string' || !url.startsWith('https://')) throw new ApiError(502, 'Cloudinary access URL is invalid');
    return { url };
  }

  async function handle(method, path, headers, body) {
    if (method === 'GET' && path === '/health') return { status: 200, body: { status: 'ok' } };
    if (method !== 'POST' || !['/v1/images/upload-intents', '/v1/images/cleanup', '/v1/images/read-access'].includes(path)) {
      throw new ApiError(404, 'Not found');
    }
    const authHeader = headers.authorization || '';
    const match = /^Bearer (\S+)$/.exec(authHeader);
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try {
      claims = await verifyToken(match[1]);
    } catch {
      throw new ApiError(401, 'Invalid session');
    }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Invalid JSON body');
    let result;
    if (path === '/v1/images/upload-intents') result = await uploadIntent(claims.uid, body);
    else if (path === '/v1/images/cleanup') result = await cleanup(claims.uid, body);
    else result = await readAccess(claims.uid, body);
    return { status: 200, body: result };
  }

  return { handle };
}

module.exports = { ApiError, createImageApi };
