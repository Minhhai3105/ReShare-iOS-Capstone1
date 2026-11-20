const { ApiError } = require('./image-api.cjs');
const { COLLECTION: CLEANUP_COLLECTION } = require('./image-cleanup-jobs.cjs');
const { AUDIT_COLLECTION } = require('./p2p-listing-removal.cjs');
const { normalizeStatus } = require('./p2p-listings-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');

const DELETE_PATH = /^\/v1\/p2p\/listings\/([A-Za-z0-9_-]{1,200})\/delete$/;

function createP2pOwnerDeleteApi({ db, verifyToken, serverTimestamp = () => new Date() }) {
  async function handle(method, path, headers) {
    const match = DELETE_PATH.exec(path);
    if (method !== 'POST' || !match) throw new ApiError(404, 'Not found');
    const token = /^Bearer (\S+)$/.exec(headers?.authorization || '');
    let claims;
    try { if (token) claims = await verifyToken(token[1]); } catch { /* Return only session status. */ }
    if (!claims?.uid) throw new ApiError(401, 'Sign in required');

    const listingId = match[1];
    const uid = claims.uid;
    const ref = db.collection('catalog_items').doc(listingId);
    const userRef = db.collection('users').doc(uid);
    const auditRef = db.collection(AUDIT_COLLECTION).doc(`owner_delete_${listingId}`);
    const jobRef = db.collection(CLEANUP_COLLECTION).doc();

    await runTransaction(db, async tx => {
      const [listing, profile, audit] = await Promise.all([tx.get(ref), tx.get(userRef), tx.get(auditRef)]);
      const user = profile.data();
      if (user?.suspended === true || user?.unsuspendPending === true) {
        throw new ApiError(403, 'Tài khoản đang bị khoá', 'ACCOUNT_SUSPENDED');
      }
      if (!listing.exists) {
        if (audit.data()?.actorUid === uid) return;
        throw new ApiError(404, 'Không tìm thấy bài đăng', 'LISTING_NOT_FOUND');
      }
      const item = listing.data();
      if (item.donorId !== uid) throw new ApiError(403, 'Chỉ người đăng mới được xoá bài', 'NOT_OWNER');
      const status = normalizeStatus(item.status);
      if (item.donorHandoverConfirmed === true || item.requesterHandoverConfirmed === true ||
          status === 'reserved' || item.reservedChatId || item.reservedRequesterId) {
        throw new ApiError(409, 'Món đồ đã có hẹn hoặc xác nhận bàn giao', 'HAS_RESERVATION');
      }
      if (status !== 'available') throw new ApiError(409, 'Chỉ xoá được bài đang sẵn sàng', 'NOT_DELETABLE');

      const timestamp = serverTimestamp();
      const prefix = `catalog_items/${listingId}/`;
      const publicIds = Array.isArray(item.imagePublicIds)
        ? [...new Set(item.imagePublicIds.filter(id => typeof id === 'string' && id.startsWith(prefix)))] : [];
      if (publicIds.length) tx.create(jobRef, { reason: 'owner_delete', publicIds, createdAt: timestamp });
      tx.create(auditRef, { listingId, action: 'owner_delete', previousStatus: status,
        actorUid: uid, actorRole: 'donor', createdAt: timestamp });
      tx.delete(ref.collection('private').doc('pickup'));
      tx.delete(ref);
    });
    return { status: 200, body: { deleted: true } };
  }

  return { handle };
}

module.exports = { DELETE_PATH, createP2pOwnerDeleteApi };
