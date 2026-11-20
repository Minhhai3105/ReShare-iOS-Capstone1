const { ApiError } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');
const { assertCurrentStaffAccess } = require('./staff-access.cjs');

// Xử lý báo cáo vi phạm (App Store Review Guideline 1.2): System Admin xem báo cáo người dùng gửi
// từ app và gỡ bài, gỡ tin nhắn, khoá tài khoản hoặc bỏ qua. Client không đọc được `reports`
// (rules), mọi thao tác đi qua đây bằng Admin SDK.

const VALID_ID = /^[A-Za-z0-9_-]{1,200}$/;
const STATUSES = new Set(['open', 'resolved']);
const ACTIONS = Object.freeze({
  dismiss: { types: ['listing', 'message', 'user'] },
  remove_listing: { types: ['listing'] },
  remove_message: { types: ['message'] },
  suspend_user: { types: ['listing', 'message', 'user'] },
});
const REMOVED_MESSAGE = 'Tin nhắn đã bị gỡ do vi phạm Điều khoản sử dụng.';
const MAX_LIST = 200;
const MAX_SUSPENDED_USERS = 100;
const UNSUSPEND_LEASE_MS = 5 * 60 * 1000;
const UNSUSPEND_INCOMPLETE = 'Account unsuspension is incomplete; retry to finish';

function moderationInProgress() {
  return new ApiError(409, 'Another account moderation action is in progress', 'MODERATION_IN_PROGRESS');
}

function dateString(value) {
  return value?.toDate?.().toISOString() || (value instanceof Date ? value.toISOString() : value || null);
}

function createModerationApi({ db, auth, verifyToken, serverTimestamp }) {
  if (!db || !auth || !verifyToken) throw new Error('Moderation API configuration is incomplete');
  const now = serverTimestamp || (() => new Date());

  async function systemAdminFrom(headers) {
    const match = /^Bearer (\S+)$/.exec(headers?.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try { claims = await verifyToken(match[1]); }
    catch { throw new ApiError(401, 'Invalid session'); }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');
    const assignment = await db.collection('staff_assignments').doc(claims.uid).get();
    if (!assignment.exists || assignment.data().active !== true || assignment.data().role !== 'system_admin') {
      throw new ApiError(403, 'System Admin access required', 'SYSTEM_ADMIN_REQUIRED');
    }
    return { uid: claims.uid };
  }

  function messageRef(report) {
    return db.collection('conversations').doc(report.conversationId).collection('messages').doc(report.targetId);
  }

  // Đọc nội dung bị báo cáo và xác định người chịu trách nhiệm TỪ CHÍNH NỘI DUNG (chủ bài, người gửi tin),
  // không tin UID người báo cáo khai. `read` là db hoặc transaction để dùng chung cho list và resolve.
  async function inspectTarget(report, read = ref => ref.get()) {
    let doc = null;
    if (report.targetType === 'listing' && VALID_ID.test(report.targetId || '')) {
      doc = await read(db.collection('catalog_items').doc(report.targetId));
      if (doc.exists) {
        const item = doc.data();
        return { owner: item.donorId, snapshot: { exists: true, title: item.title || '',
          note: String(item.donorNote || '').slice(0, 300), status: item.status || '',
          imageUrl: Array.isArray(item.images) ? item.images[0] || null : null } };
      }
    } else if (report.targetType === 'message' && VALID_ID.test(report.targetId || '') && VALID_ID.test(report.conversationId || '')) {
      doc = await read(messageRef(report));
      if (doc.exists) {
        const message = doc.data();
        return { owner: message.senderId, snapshot: { exists: true, text: String(message.text || '').slice(0, 500),
          moderated: message.moderated === true } };
      }
    } else if (report.targetType === 'user') {
      return { owner: report.targetId, snapshot: { exists: true } };
    }
    // Nội dung gốc đã bị xoá: chỉ còn UID ghi lúc báo cáo, mà Rules đã đối chiếu với chủ nội dung khi tạo.
    return { owner: report.targetUserId, snapshot: { exists: false } };
  }

  async function names(uids) {
    const unique = [...new Set(uids.filter(uid => typeof uid === 'string' && VALID_ID.test(uid)))];
    const docs = unique.length ? await db.getAll(...unique.map(uid => db.collection('users').doc(uid))) : [];
    return new Map(docs.map(doc => [doc.id, {
      name: doc.exists ? (doc.data().displayName || 'Chưa có tên') : 'Người dùng đã xoá',
      suspended: doc.exists && (doc.data().suspended === true || doc.data().unsuspendPending === true),
    }]));
  }

  async function list(url) {
    const status = url.searchParams.get('status') || 'open';
    if (!STATUSES.has(status)) throw new ApiError(400, 'Invalid status', 'VALIDATION');
    // Một điều kiện bằng, sắp xếp trong bộ nhớ: không cần composite index.
    const snapshot = await db.collection('reports').where('status', '==', status).limit(MAX_LIST + 1).get();
    const docs = snapshot.docs.slice(0, MAX_LIST)
      .sort((a, b) => String(dateString(b.data().createdAt)).localeCompare(String(dateString(a.data().createdAt))));
    const inspected = await Promise.all(docs.map(doc => inspectTarget(doc.data())));
    const people = await names(docs.flatMap((doc, index) => [doc.data().reporterId, inspected[index].owner]));
    const reports = docs.map((doc, index) => {
      const data = doc.data();
      const { owner, snapshot } = inspected[index];
      return {
        id: doc.id, status: data.status, reason: data.reason, note: data.note || '',
        targetType: data.targetType, targetId: data.targetId, conversationId: data.conversationId || null,
        createdAt: dateString(data.createdAt),
        reporter: { id: data.reporterId, ...(people.get(data.reporterId) || {}) },
        // Người bị báo cáo hiển thị theo chủ nội dung thật; lệch với UID trong báo cáo thì đánh dấu.
        targetUser: { id: owner, ...(people.get(owner) || {}) },
        attributionMismatch: owner !== data.targetUserId,
        target: snapshot,
        pendingAction: data.pendingAction || null,
        resolution: data.resolution || null, resolutionNote: data.resolutionNote || '',
        resolvedAt: dateString(data.resolvedAt),
      };
    });
    return { status: 200, body: { reports, truncated: snapshot.size > MAX_LIST } };
  }

  async function listSuspendedUsers() {
    const users = db.collection('users');
    const [suspended, pending] = await Promise.all([
      users.where('suspended', '==', true).limit(MAX_SUSPENDED_USERS).get(),
      users.where('unsuspendPending', '==', true).limit(MAX_SUSPENDED_USERS).get(),
    ]);
    // Ưu tiên các ca mở khoá dở để quản trị viên vẫn tìm được sau khi tải lại trang.
    const docs = [...new Map([...pending.docs, ...suspended.docs].map(doc => [doc.id, doc])).values()]
      .slice(0, MAX_SUSPENDED_USERS);
    const accounts = docs.length ? await auth.getUsers(docs.map(doc => ({ uid: doc.id }))) : { users: [] };
    const byUid = new Map(accounts.users.map(account => [account.uid, account]));
    return { status: 200, body: { users: docs.map(doc => {
      const data = doc.data();
      const account = byUid.get(doc.id);
      return {
        uid: doc.id,
        displayName: data.displayName || account?.displayName || '',
        email: account?.email || null,
        suspendedAt: dateString(data.suspendedAt),
        unsuspendPending: data.unsuspendPending === true,
      };
    }) } };
  }

  async function finishUnsuspend(ref, leaseUntil, success) {
    return runTransaction(db, async tx => {
      const doc = await tx.get(ref);
      if (doc.data()?.unsuspendLeaseUntil !== leaseUntil) return false;
      tx.update(ref, { unsuspendPending: !success, unsuspendLeaseUntil: null });
      return true;
    });
  }

  async function unsuspend(staff, uid, body) {
    if (!VALID_ID.test(uid)) throw new ApiError(400, 'Invalid target user', 'VALIDATION');
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length > 500 || Object.keys(body).some(key => key !== 'reason')) {
      throw new ApiError(400, 'A reason between 1 and 500 characters is required', 'VALIDATION');
    }
    const ref = db.collection('users').doc(uid);
    const auditRef = db.collection('moderation_audit').doc();
    const leaseUntil = await runTransaction(db, async tx => {
      await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
      const profile = doc.data();
      const retry = profile.unsuspendPending === true;
      if (profile.suspended !== true && !retry) throw new ApiError(409, 'Account is not suspended', 'NOT_SUSPENDED');
      const startedAt = Date.now();
      if (profile.unsuspendLeaseUntil > startedAt) throw moderationInProgress();
      const until = startedAt + UNSUSPEND_LEASE_MS;
      const update = { unsuspendPending: true, unsuspendLeaseUntil: until };
      if (!retry) {
        // Chờ hoàn tất khoá (kể cả thu hồi phiên lỗi) trước khi cho thao tác ngược lại.
        const reports = await tx.get(db.collection('reports').where('actionTargetUid', '==', uid));
        if (reports.docs.some(report => report.data().pendingAction === 'suspend_user')) throw moderationInProgress();
        const timestamp = now();
        Object.assign(update, { suspended: false, unsuspendedAt: timestamp, unsuspendedBy: staff.uid, unsuspendReason: reason });
        tx.create(auditRef, { action: 'unsuspend_user', targetUid: uid, actorUid: staff.uid, reason, createdAt: timestamp });
      }
      // Giữ chặn ghi đến khi Auth xong. Lease hết hạn cho phép phục hồi nếu tiến trình bị dừng.
      tx.update(ref, update);
      return until;
    });

    try {
      await auth.updateUser(uid, { disabled: false });
    } catch {
      await finishUnsuspend(ref, leaseUntil, false).catch(() => {});
      throw new ApiError(502, UNSUSPEND_INCOMPLETE, 'UNSUSPEND_INCOMPLETE');
    }
    if (!(await finishUnsuspend(ref, leaseUntil, true).catch(() => false))) {
      throw new ApiError(502, UNSUSPEND_INCOMPLETE, 'UNSUSPEND_INCOMPLETE');
    }
    return { status: 200, body: { uid, suspended: false } };
  }

  // Khoá đăng nhập + thu hồi phiên. Gọi lại an toàn: tài khoản đã khoá/đã xoá thì coi như xong bước đó.
  async function disableSignIn(uid) {
    for (const step of [() => auth.updateUser(uid, { disabled: true }), () => auth.revokeRefreshTokens(uid)]) {
      try { await step(); }
      catch (error) {
        if (error?.code === 'auth/user-not-found') return;
        throw new ApiError(502, 'Account suspension is incomplete; retry to finish', 'SUSPEND_INCOMPLETE');
      }
    }
  }

  async function resolve(staff, reportId, body) {
    if (!VALID_ID.test(reportId)) throw new ApiError(400, 'Invalid report ID');
    if (!body || typeof body !== 'object' || Object.keys(body).some(key => !['action', 'note'].includes(key)) ||
        !Object.hasOwn(ACTIONS, body.action) ||
        (body.note !== undefined && (typeof body.note !== 'string' || body.note.trim().length > 500))) {
      throw new ApiError(400, 'Invalid moderation action', 'VALIDATION');
    }
    const action = body.action;
    const reportRef = db.collection('reports').doc(reportId);
    let suspendUid = null;
    await runTransaction(db, async tx => {
      const reportDoc = await tx.get(reportRef);
      if (!reportDoc.exists) throw new ApiError(404, 'Report not found');
      const report = reportDoc.data();
      if (report.status !== 'open') throw new ApiError(409, 'Report already resolved');
      // Lần khoá trước đã ghi Firestore nhưng chưa khoá xong Auth: chỉ cho bấm lại đúng thao tác đó.
      if (report.pendingAction) {
        if (action !== report.pendingAction) throw new ApiError(409, 'Another action is in progress for this report');
        await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
        suspendUid = report.actionTargetUid;
        return;
      }
      if (!ACTIONS[action].types.includes(report.targetType)) throw new ApiError(400, 'Action does not match the report', 'VALIDATION');
      const writes = [];
      const timestamp = now();
      const moderation = { reportId, moderatedBy: staff.uid, moderatedAt: timestamp };
      const resolution = { resolution: action, resolutionNote: (body.note || '').trim() };
      if (action === 'remove_listing') {
        const itemRef = db.collection('catalog_items').doc(report.targetId);
        const item = await tx.get(itemRef);
        if (item.exists) writes.push(() => tx.update(itemRef, { status: 'removed', moderation }));
      }
      if (action === 'remove_message') {
        const ref = messageRef(report);
        const message = await tx.get(ref);
        if (message.exists) {
          writes.push(() => tx.update(ref, { text: REMOVED_MESSAGE, moderated: true, moderation }));
          // Tin bị gỡ là tin mới nhất thì bản xem trước ở danh sách chat cũng đang chứa nó: thay luôn.
          // Không đụng tới bản xem trước của tin mới hơn.
          const conversationRef = db.collection('conversations').doc(report.conversationId);
          const latest = await tx.get(conversationRef.collection('messages').orderBy('createdAt', 'desc').limit(1));
          if (latest.docs[0]?.id === report.targetId) {
            writes.push(() => tx.update(conversationRef, { lastMessage: REMOVED_MESSAGE }));
          }
        }
      }
      if (action === 'suspend_user') {
        const { owner } = await inspectTarget(report, ref => tx.get(ref));
        if (owner !== report.targetUserId) throw new ApiError(409, 'Reported user does not own the content', 'ATTRIBUTION_MISMATCH');
        if (typeof owner !== 'string' || !VALID_ID.test(owner)) throw new ApiError(400, 'Invalid target user');
        const userRef = db.collection('users').doc(owner);
        const userDoc = await tx.get(userRef);
        if (userDoc.data()?.unsuspendPending === true) throw moderationInProgress();
        const assignment = await tx.get(db.collection('staff_assignments').doc(owner));
        if (assignment.exists && assignment.data().active === true) {
          throw new ApiError(409, 'Staff accounts cannot be suspended here; revoke staff access first');
        }
        // Gỡ luôn các bài đang mở của người bị khoá để không còn ai liên hệ nhầm.
        // Một điều kiện bằng rồi lọc trạng thái trong bộ nhớ: không phụ thuộc composite index.
        const listings = await tx.get(db.collection('catalog_items').where('donorId', '==', owner).limit(200));
        // Cờ suspended do server quản lý: Rules chặn ghi nội dung ngay, kể cả khi ID token cũ còn hạn.
        writes.push(() => tx.set(userRef, { suspended: true, suspendedAt: timestamp }, { merge: true }));
        for (const doc of listings.docs.filter(item => item.data().status === 'available')) {
          writes.push(() => tx.update(doc.ref, { status: 'removed', moderation }));
        }
        suspendUid = owner;
      }
      await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
      for (const write of writes) write();
      if (action === 'suspend_user') {
        // Chưa đóng báo cáo: chỉ đóng sau khi khoá Auth xong, để lỗi Auth không tạo kết quả "đã xử lý" giả.
        tx.update(reportRef, { ...resolution, pendingAction: action, actionTargetUid: suspendUid,
          pendingBy: staff.uid, pendingAt: timestamp });
      } else {
        tx.update(reportRef, { status: 'resolved', ...resolution, resolvedBy: staff.uid, resolvedAt: timestamp });
      }
    });
    if (suspendUid) {
      // Gọi Auth ngoài transaction (callback transaction có thể chạy lại). Lỗi ở đây thì báo cáo vẫn
      // "Chờ xử lý" kèm pendingAction, admin bấm lại là chạy tiếp từ bước này.
      await disableSignIn(suspendUid);
      await runTransaction(db, async tx => {
        const reportDoc = await tx.get(reportRef);
        const report = reportDoc.exists ? reportDoc.data() : null;
        if (report?.status !== 'open' || report.pendingAction !== 'suspend_user') return;
        await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
        tx.update(reportRef, { status: 'resolved', pendingAction: null, resolvedBy: staff.uid, resolvedAt: now() });
      });
    }
    return { status: 200, body: { reportId, resolution: action } };
  }

  async function handle(method, path, headers, body, requestUrl = '') {
    const listPath = path === '/v1/admin/moderation/reports';
    const suspendedPath = path === '/v1/admin/moderation/suspended-users';
    const resolveMatch = /^\/v1\/admin\/moderation\/reports\/([^/]+)\/resolve$/.exec(path);
    const unsuspendMatch = /^\/v1\/admin\/moderation\/users\/([^/]+)\/unsuspend$/.exec(path);
    if (!listPath && !suspendedPath && !resolveMatch && !unsuspendMatch) throw new ApiError(404, 'Not found');
    const staff = await systemAdminFrom(headers);
    if (listPath && method === 'GET') return list(new URL(requestUrl || path, 'http://localhost'));
    if (suspendedPath && method === 'GET') return listSuspendedUsers();
    if (resolveMatch && method === 'POST') return resolve(staff, resolveMatch[1], body);
    if (unsuspendMatch && method === 'POST') return unsuspend(staff, unsuspendMatch[1], body);
    throw new ApiError(404, 'Not found');
  }

  return { handle };
}

module.exports = { createModerationApi, REMOVED_MESSAGE };
