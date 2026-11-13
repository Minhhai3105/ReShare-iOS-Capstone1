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
      throw new ApiError(403, 'System Admin access required');
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
      suspended: doc.exists && doc.data().suspended === true,
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
        const assignment = await tx.get(db.collection('staff_assignments').doc(owner));
        if (assignment.exists && assignment.data().active === true) {
          throw new ApiError(409, 'Staff accounts cannot be suspended here; revoke staff access first');
        }
        // Gỡ luôn các bài đang mở của người bị khoá để không còn ai liên hệ nhầm.
        // Một điều kiện bằng rồi lọc trạng thái trong bộ nhớ: không phụ thuộc composite index.
        const listings = await tx.get(db.collection('catalog_items').where('donorId', '==', owner).limit(200));
        // Cờ suspended do server quản lý: Rules chặn ghi nội dung ngay, kể cả khi ID token cũ còn hạn.
        writes.push(() => tx.set(db.collection('users').doc(owner), { suspended: true, suspendedAt: timestamp }, { merge: true }));
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
    const resolveMatch = /^\/v1\/admin\/moderation\/reports\/([^/]+)\/resolve$/.exec(path);
    if (!listPath && !resolveMatch) throw new ApiError(404, 'Not found');
    const staff = await systemAdminFrom(headers);
    if (listPath && method === 'GET') return list(new URL(requestUrl || path, 'http://localhost'));
    if (resolveMatch && method === 'POST') return resolve(staff, resolveMatch[1], body);
    throw new ApiError(404, 'Not found');
  }

  return { handle };
}

module.exports = { createModerationApi, REMOVED_MESSAGE };
