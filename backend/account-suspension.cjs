const { ApiError } = require('./image-api.cjs');

const ACCOUNT_MODERATION_LEASE_MS = 5 * 60 * 1000;

function moderationInProgress() {
  return new ApiError(409, 'Another account moderation action is in progress', 'MODERATION_IN_PROGRESS');
}

async function readSuspensionTarget(tx, db, uid, { allowDirectRetry = false } = {}) {
  const profile = await tx.get(db.collection('users').doc(uid));
  const assignment = await tx.get(db.collection('staff_assignments').doc(uid));
  if (assignment.data()?.active === true) {
    throw new ApiError(409, 'Staff accounts cannot be suspended here; revoke staff access first', 'STAFF_ACCOUNT');
  }
  const user = profile.data();
  if (user?.unsuspendPending === true || (!allowDirectRetry && user?.suspendPending === true)) throw moderationInProgress();
  return profile;
}

async function prepareSuspensionWrites(tx, db, profile, moderation, extra = {}) {
  // Gỡ luôn các bài đang mở của người bị khoá để không còn ai liên hệ nhầm.
  // Một điều kiện bằng rồi lọc trạng thái trong bộ nhớ: không phụ thuộc composite index.
  const listings = await tx.get(db.collection('catalog_items').where('donorId', '==', profile.id).limit(200));
  return () => {
    // Cờ suspended do server quản lý: Rules chặn ghi nội dung ngay, kể cả khi ID token cũ còn hạn.
    tx.set(profile.ref, { suspended: true, suspendedAt: moderation.moderatedAt, ...extra }, { merge: true });
    for (const doc of listings.docs) {
      if (doc.data().status === 'available') tx.update(doc.ref, { status: 'removed', moderation });
    }
  };
}

async function disableAccountSignIn(auth, uid) {
  // Khoá đăng nhập + thu hồi phiên. Gọi lại an toàn: tài khoản đã khoá/đã xoá thì coi như xong bước đó.
  // Gọi Auth ngoài transaction vì callback của transaction có thể chạy lại.
  for (const step of [() => auth.updateUser(uid, { disabled: true }), () => auth.revokeRefreshTokens(uid)]) {
    try { await step(); }
    catch (error) {
      if (error?.code === 'auth/user-not-found') return;
      throw new ApiError(502, 'Account suspension is incomplete; retry to finish', 'SUSPEND_INCOMPLETE');
    }
  }
}

module.exports = {
  ACCOUNT_MODERATION_LEASE_MS, disableAccountSignIn, moderationInProgress, prepareSuspensionWrites, readSuspensionTarget,
};
