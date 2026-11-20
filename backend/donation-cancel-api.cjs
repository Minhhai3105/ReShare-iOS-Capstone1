const { ApiError } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');

const CANCEL_PATH = /^\/v1\/donations\/([A-Za-z0-9_-]{1,120})\/cancel$/;

function createDonationCancelApi({ db, verifyToken, serverTimestamp = () => new Date() }) {
  async function handle(method, path, headers, body) {
    const match = CANCEL_PATH.exec(path);
    if (method !== 'POST' || !match) throw new ApiError(404, 'Not found');
    const token = /^Bearer (\S+)$/.exec(headers?.authorization || '');
    let claims;
    try { if (token) claims = await verifyToken(token[1]); } catch { /* Return only session status. */ }
    if (!claims?.uid) throw new ApiError(401, 'Sign in required');
    if (!body || Object.keys(body).some(key => !['expectedVersion', 'reason'].includes(key)) ||
        !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1 ||
        (Object.hasOwn(body, 'reason') && (typeof body.reason !== 'string' || body.reason.trim().length > 300))) {
      throw new ApiError(400, 'Phiên bản hoặc lý do huỷ không hợp lệ');
    }

    const donationRef = db.collection('donations').doc(match[1]);
    const version = await runTransaction(db, async transaction => {
      const doc = await transaction.get(donationRef);
      if (!doc.exists) throw new ApiError(404, 'Không tìm thấy đơn quyên góp');
      const donation = doc.data();
      if (donation.donorId !== claims.uid) throw new ApiError(403, 'Chỉ người gửi mới được huỷ đơn');
      if (donation.status !== 'pending' || donation.reviewState === 'needs_information') {
        throw new ApiError(409, 'Đơn không còn ở trạng thái có thể huỷ', 'NOT_CANCELLABLE');
      }
      if ((donation.version || 1) !== body.expectedVersion) {
        throw new ApiError(409, 'Đơn đã thay đổi. Vui lòng tải lại.', 'VERSION_CONFLICT');
      }
      const at = serverTimestamp();
      const nextVersion = body.expectedVersion + 1;
      transaction.update(donationRef, {
        status: 'cancelled', cancelledAt: at, cancelledBy: 'donor', cancelReason: body.reason?.trim() || null,
        version: nextVersion, updatedAt: at,
      });
      return nextVersion;
    });
    return { status: 200, body: { success: true, version } };
  }
  return { handle };
}

module.exports = { CANCEL_PATH, createDonationCancelApi };
