const { FieldValue } = require('firebase-admin/firestore');
const { ApiError } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');
const { COLLECTION: CLEANUP_COLLECTION, createImageCleanupJobs } = require('./image-cleanup-jobs.cjs');

// Xoá tài khoản donor ngay trong app (App Store Review Guideline 5.1.1(v)).
//
// Chính sách đã chốt (Chính sách quyền riêng tư, mục 6):
// - Xoá tài khoản Firebase Auth và hồ sơ users/{uid} (họ tên, email, số điện thoại).
// - Đơn quyên góp GIỮ LẠI vì phiếu thực nhận, tồn kho và phiếu phân phối tham chiếu tới chúng; chỉ
//   bỏ tên và đánh dấu donorAccountDeleted. donorId giữ nguyên: sau khi xoá Auth nó là mã mồ côi,
//   không còn nối tới người nào, và quyền xem ảnh của nhân sự vẫn khớp chủ lô ảnh.
// - Bài Kho đồ 0đ đang mở (available/reserved) bị gỡ hẳn kèm ảnh; bài đã trao xong giữ lại cho người
//   nhận nhưng đổi tên người cho. Món người này đang giữ của người khác được mở lại.
// - Đang bàn giao dở (một bên đã bấm xác nhận) thì TẠM CHƯA CHO XOÁ (409 HANDOVER_IN_PROGRESS): không
//   mở lại món đã trao, không xoá bằng chứng bàn giao.
// - Hội thoại và tin nhắn giữ cho người còn lại, tên hiển thị đổi thành "Người dùng đã xoá".
// Mỗi bài/lượt giữ đồ xử lý bằng transaction đọc lại trạng thái hiện tại: món vừa được bàn giao xong
// giữa lúc quét và lúc ghi không bị ghi đè về "available".
// Ảnh của bài bị gỡ ghi vào image_cleanup_jobs cùng transaction xoá bài; Cloudinary lỗi thì worker
// trong server.cjs (hoặc scripts/retry-image-cleanup.cjs) dọn tiếp.
// Thứ tự: dọn Firestore trước, xoá Auth sau cùng — lỗi giữa chừng thì gọi lại vẫn an toàn (idempotent).

const DELETED_NAME = 'Người dùng đã xoá';
const REAUTH_WINDOW_SECONDS = 5 * 60;
const MAX_DOCS = 2000;
const BATCH_LIMIT = 400;
const VALID_ID = /^[A-Za-z0-9_-]{1,200}$/;

const hasHandoverConfirmation = item => item.donorHandoverConfirmed === true || item.requesterHandoverConfirmed === true;
const handoverInProgress = () => new ApiError(409, 'Finish the handover in progress before deleting the account', 'HANDOVER_IN_PROGRESS');
// Hội thoại của lượt giữ đồ vừa được mở lại.
const RELEASED_CHAT = Object.freeze({
  isReserved: false, appointmentStatus: 'cancelled', reservationDeadline: FieldValue.delete(),
  proposedPickupTime: FieldValue.delete(), donorHandoverConfirmed: false, requesterHandoverConfirmed: false,
});

async function readCapped(query, what) {
  const snapshot = await query.limit(MAX_DOCS + 1).get();
  if (snapshot.size > MAX_DOCS) throw new ApiError(422, `Too many ${what} to delete automatically`, 'VALIDATION');
  return snapshot.docs;
}

function createAccountApi({ db, auth, verifyToken, deleteCatalogImage, clock }) {
  if (!db || !auth || !verifyToken) throw new Error('Account API configuration is incomplete');
  const nowSeconds = () => Math.floor((clock ? clock() : Date.now()) / 1000);
  const cleanupJobs = createImageCleanupJobs({ db, deleteCatalogImage });

  async function commitAll(operations) {
    for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const op of operations.slice(i, i + BATCH_LIMIT)) op(batch);
      await batch.commit();
    }
  }

  async function authenticate(headers) {
    const match = /^Bearer (\S+)$/.exec(headers?.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try { claims = await verifyToken(match[1]); }
    catch { throw new ApiError(401, 'Invalid session'); }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');
    // Xoá tài khoản là thao tác không hoàn tác: bắt đăng nhập lại gần đây, không chỉ có token còn hạn.
    if (!Number.isFinite(claims.auth_time) || nowSeconds() - claims.auth_time > REAUTH_WINDOW_SECONDS) {
      throw new ApiError(401, 'Recent sign-in required', 'REAUTH_REQUIRED');
    }
    return claims.uid;
  }

  async function deleteAccount(uid) {
    const assignment = await db.collection('staff_assignments').doc(uid).get();
    if (assignment.exists && assignment.data().active === true) {
      throw new ApiError(409, 'Staff accounts must be revoked by a System Admin first', 'STAFF_ACCOUNT');
    }
    const timestamp = FieldValue.serverTimestamp();
    const ops = [];
    const summary = { donationsAnonymized: 0, itemsRemoved: 0, itemsAnonymized: 0,
      reservationsReleased: 0, conversationsUpdated: 0, messagesUpdated: 0 };

    const own = await readCapped(db.collection('catalog_items').where('donorId', '==', uid), 'listings');
    const held = await readCapped(db.collection('catalog_items').where('reservedRequesterId', '==', uid), 'reservations');
    // Kiểm trước khi dọn bất cứ gì; transaction bên dưới kiểm lại vì trạng thái có thể đổi giữa chừng.
    if ([...own, ...held].some(doc => doc.data().status === 'reserved' && hasHandoverConfirmation(doc.data()))) {
      throw handoverInProgress();
    }

    // 1. Bài Kho đồ 0đ của chính người này — mỗi bài một transaction đọc lại trạng thái.
    const jobRef = db.collection(CLEANUP_COLLECTION).doc();
    for (const doc of own) {
      const outcome = await runTransaction(db, async tx => {
        const snapshot = await tx.get(doc.ref);
        if (!snapshot.exists || snapshot.data().donorId !== uid) return 'skipped';
        const item = snapshot.data();
        const pickupRef = doc.ref.collection('private').doc('pickup');
        if (item.status === 'completed') {
          tx.update(doc.ref, { donorName: DELETED_NAME });
          tx.delete(pickupRef);
          return 'anonymized';
        }
        if (item.status === 'reserved' && hasHandoverConfirmation(item)) throw handoverInProgress();
        const chatRef = typeof item.reservedChatId === 'string' && VALID_ID.test(item.reservedChatId)
          ? db.collection('conversations').doc(item.reservedChatId) : null;
        const chat = chatRef ? await tx.get(chatRef) : null;
        const publicIds = Array.isArray(item.imagePublicIds) ? item.imagePublicIds.filter(id => typeof id === 'string') : [];
        // Ghi việc dọn ảnh cùng lúc xoá bài: không bao giờ có bài đã xoá mà mất dấu ảnh.
        if (publicIds.length) {
          tx.set(jobRef, { reason: 'account_deletion', publicIds: FieldValue.arrayUnion(...publicIds), createdAt: timestamp },
            { merge: true });
        }
        if (chat?.exists && chat.data().itemId === doc.id && chat.data().isReserved === true) tx.update(chatRef, RELEASED_CHAT);
        tx.delete(pickupRef);
        tx.delete(doc.ref);
        return 'removed';
      });
      if (outcome === 'anonymized') summary.itemsAnonymized += 1;
      if (outcome === 'removed') summary.itemsRemoved += 1;
    }

    // 2. Món của người khác mà người này đang giữ: mở lại, nhưng chỉ khi vẫn đúng là lượt giữ của họ.
    for (const doc of held) {
      const released = await runTransaction(db, async tx => {
        const snapshot = await tx.get(doc.ref);
        if (!snapshot.exists) return false;
        const item = snapshot.data();
        // Đã hoàn tất, đã đổi người giữ, hoặc là bài của chính họ (đã xử lý ở bước 1): không đụng tới.
        if (item.status !== 'reserved' || item.reservedRequesterId !== uid || item.donorId === uid) return false;
        if (hasHandoverConfirmation(item)) throw handoverInProgress();
        const chatRef = typeof item.reservedChatId === 'string' && VALID_ID.test(item.reservedChatId)
          ? db.collection('conversations').doc(item.reservedChatId) : null;
        const chat = chatRef ? await tx.get(chatRef) : null;
        tx.update(doc.ref, {
          status: 'available', reservedChatId: FieldValue.delete(), reservedRequesterId: FieldValue.delete(),
          reservationDeadline: FieldValue.delete(), pickupTime: FieldValue.delete(),
          donorHandoverConfirmed: false, requesterHandoverConfirmed: false,
        });
        if (chat?.exists && chat.data().itemId === doc.id && chat.data().requesterId === uid) tx.update(chatRef, RELEASED_CHAT);
        return true;
      });
      if (released) summary.reservationsReleased += 1;
    }

    // 3. Đơn quyên góp: giữ chứng từ, bỏ dữ liệu nhận dạng.
    for (const doc of await readCapped(db.collection('donations').where('donorId', '==', uid), 'donations')) {
      ops.push(batch => batch.update(doc.ref, {
        donorAccountDeleted: true, donorDeletedAt: timestamp, donorName: FieldValue.delete(),
      }));
      summary.donationsAnonymized += 1;
    }

    // 4. Hội thoại và tin nhắn: giữ cho người còn lại, đổi tên hiển thị.
    const conversations = await readCapped(
      db.collection('conversations').where('participantIds', 'array-contains', uid), 'conversations');
    for (const doc of conversations) {
      const chat = doc.data();
      const update = {};
      if (chat.donorId === uid) update.donorName = DELETED_NAME;
      if (chat.requesterId === uid) update.requesterName = DELETED_NAME;
      if (Object.keys(update).length) {
        ops.push(batch => batch.update(doc.ref, update));
        summary.conversationsUpdated += 1;
      }
      for (const message of await readCapped(doc.ref.collection('messages').where('senderId', '==', uid), 'messages')) {
        ops.push(batch => batch.update(message.ref, { senderName: DELETED_NAME }));
        summary.messagesUpdated += 1;
      }
    }

    // 5. Hồ sơ cá nhân và bản ghi kiểm toán (chỉ số đếm, không lưu dữ liệu nhận dạng).
    ops.push(batch => batch.delete(db.collection('users').doc(uid)));
    ops.push(batch => batch.set(db.collection('account_deletions').doc(), { ...summary, deletedAt: timestamp }));
    await commitAll(ops);

    // 6. Ảnh của bài đã gỡ. Lỗi Cloudinary không chặn việc xoá tài khoản: phần còn sót nằm lại trong
    // image_cleanup_jobs để worker dọn tiếp, và app báo cho người dùng biết.
    const imagesPending = await cleanupJobs.processJob(jobRef);

    // 7. Tài khoản đăng nhập — sau cùng. Đã xoá rồi (lần gọi trước lỗi sau bước này) thì coi như xong.
    try { await auth.deleteUser(uid); }
    catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    return { status: 200, body: { deleted: true, summary: { ...summary, imagesPending } } };
  }

  async function handle(method, path, headers) {
    if (method !== 'POST' || path !== '/v1/account/delete') throw new ApiError(404, 'Not found');
    const uid = await authenticate(headers);
    return deleteAccount(uid);
  }

  return { handle };
}

module.exports = { createAccountApi, DELETED_NAME };
