const { createHash } = require('node:crypto');
const { ApiError, validateRecordId, validatePublicIds } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');
const { canonicalUnit, quantityBase, quantityFromBase } = require('./quantity.cjs');
const { publicHistory, mergeDonationHistory } = require('./donation-history.cjs');

function createDonationResubmitApi({ db, verifyToken, serverTimestamp = () => new Date() }) {
  const editable = ['title', 'description', 'category', 'condition', 'quantity', 'unitId', 'imagePublicIds'];
  async function handle(method, path, headers, body) {
    const match = /^\/v1\/donations\/([A-Za-z0-9_-]{1,120})\/resubmit$/.exec(path);
    if (method !== 'POST' || !match) throw new ApiError(404, 'Not found');
    const token = /^Bearer (\S+)$/.exec(headers?.authorization || '');
    let claims;
    try { if (token) claims = await verifyToken(token[1]); } catch { /* Return only session status. */ }
    if (!claims?.uid) throw new ApiError(401, 'Sign in required');
    const allowed = [...editable, 'expectedVersion', 'idempotencyKey', 'imageUploadRecordId'];
    if (!body || Object.keys(body).some(key => !allowed.includes(key)) ||
        !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1 ||
        typeof body.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(body.idempotencyKey)) {
      throw new ApiError(400, 'Invalid revision fields, version or retry key');
    }
    const fields = Object.fromEntries(editable.filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
    for (const key of ['title', 'description']) if (typeof fields[key] === 'string') fields[key] = fields[key].trim();
    if (typeof fields.title !== 'string' || !fields.title || fields.title.length > 120 ||
        typeof fields.description !== 'string' || fields.description.length > 3000 ||
        !['clothing', 'books', 'household'].includes(fields.category) ||
        !['new', 'like_new', 'good', 'fair'].includes(fields.condition) ||
        ((Object.hasOwn(fields, 'quantity') || Object.hasOwn(fields, 'unitId')) && quantityBase(fields.quantity, fields.unitId) === null)) {
      throw new ApiError(400, 'Nội dung hoặc số lượng bổ sung không hợp lệ');
    }
    const donationId = match[1];
    validateRecordId('donation', donationId);
    const hash = value => createHash('sha256').update(value).digest('hex');
    const auditRef = db.collection('donation_resubmissions').doc(`rs_${hash(`${claims.uid}:${donationId}:${body.idempotencyKey}`).slice(0, 40)}`);
    const fingerprint = hash(JSON.stringify({ fields, version: body.expectedVersion, upload: body.imageUploadRecordId || null }));
    const donationRef = db.collection('donations').doc(donationId);
    const reviewRef = db.collection('donation_reviews').doc(donationId);
    const result = await runTransaction(db, async tx => {
      const [donationDoc, prior, reviewDoc] = await Promise.all([tx.get(donationRef), tx.get(auditRef), tx.get(reviewRef)]);
      if (!donationDoc.exists) throw new ApiError(404, 'Donation not found');
      const donation = donationDoc.data();
      if (donation.donorId !== claims.uid) throw new ApiError(403, 'Only the donor can resubmit this donation');
      if (prior.exists) {
        if (prior.data().requestFingerprint !== fingerprint) throw new ApiError(409, 'Retry key was used for different content');
        return { ...prior.data().response, idempotentReplay: true };
      }
      if (donation.status !== 'pending' || donation.reviewState !== 'needs_information') throw new ApiError(409, 'Đơn không còn chờ bổ sung thông tin');
      if ((donation.version || 1) !== body.expectedVersion) throw new ApiError(409, 'Đơn đã thay đổi; tải lại trước khi gửi');
      const unitId = canonicalUnit(Object.hasOwn(fields, 'unitId') ? fields.unitId : donation.unitId);
      const baseQuantity = quantityBase(Object.hasOwn(fields, 'quantity') ? fields.quantity : donation.quantity, unitId);
      if (baseQuantity === null) throw new ApiError(400, 'Cần bổ sung số lượng hợp lệ: đơn vị đếm là số nguyên, kg tối đa 3 số lẻ');
      const quantity = quantityFromBase(baseQuantity, unitId);
      const replacingImages = Object.hasOwn(fields, 'imagePublicIds');
      const images = replacingImages ? fields.imagePublicIds : donation.imagePublicIds;
      const uploadId = body.imageUploadRecordId || donation.imageUploadRecordId || donationId;
      const replacementRequired = () => new ApiError(400,
        'Bộ ảnh hiện tại không đủ điều kiện gửi lại. Vui lòng chọn 3–6 ảnh mới để thay thế.', 'REPLACEMENT_IMAGES_REQUIRED');
      try {
        validateRecordId('donation', uploadId);
        validatePublicIds(images, `donations/${uploadId}`);
        if (images.length < 3) throw new ApiError(400, 'Cần 3–6 ảnh thuộc cùng lần tải được cấp quyền');
      } catch (error) {
        if (!replacingImages && error instanceof ApiError) throw replacementRequired();
        throw error;
      }
      const batchRef = db.collection('image_upload_batches').doc(`donation_${uploadId}`);
      const batch = await tx.get(batchRef);
      if (!batch.exists || batch.data().ownerUid !== claims.uid ||
          (batch.data().attachedDonationId && batch.data().attachedDonationId !== donationId) ||
          !images.every(id => Object.values(batch.data().assets || {}).includes(id))) {
        if (!replacingImages) throw replacementRequired();
        throw new ApiError(403, 'Ảnh chưa được cấp quyền cho donor');
      }
      const version = body.expectedVersion + 1;
      const at = serverTimestamp();
      const response = { donation: { id: donationId, status: 'pending', reviewState: null, version }, idempotentReplay: false };
      const publicEvent = { action: 'resubmit', fromStatus: 'pending', toStatus: 'pending', reviewState: null,
        publicMessage: 'Donor đã bổ sung thông tin và gửi duyệt lại.', timestamp: new Date().toISOString(), version };
      const review = reviewDoc.exists ? reviewDoc.data() : {};
      const history = [...mergeDonationHistory(donation.history, review.history), { ...publicEvent, actorUid: claims.uid }];
      tx.update(donationRef, { ...fields, quantity, unitId, imagePublicIds: images, imageProvider: 'cloudinary', imageUploadRecordId: uploadId,
        donorConfirmedCategory: fields.category, reviewState: null, statusNote: publicEvent.publicMessage,
        version, resubmittedAt: at, history: publicHistory(history) });
      tx.set(reviewRef, { ...review, donationId, history });
      tx.set(auditRef, { donationId, donorId: claims.uid, requestFingerprint: fingerprint, version, createdAt: at,
        before: Object.fromEntries(editable.map(key => [key, donation[key] ?? null])),
        after: { ...fields, quantity, unitId, imagePublicIds: images }, response });
      tx.update(batchRef, { attachedDonationId: donationId });
      return response;
    });
    return { status: 200, body: { success: true, ...result } };
  }
  return { handle };
}

module.exports = { createDonationResubmitApi };
