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

  // Ảnh chụp nội dung bị báo cáo để admin quyết định mà không phải mở Firebase Console.
  async function targetSnapshot(report) {
    if (report.targetType === 'listing' && VALID_ID.test(report.targetId || '')) {
      const doc = await db.collection('catalog_items').doc(report.targetId).get();
      if (!doc.exists) return { exists: false };
      const item = doc.data();
      return { exists: true, title: item.title || '', note: String(item.donorNote || '').slice(0, 300),
        status: item.status || '', imageUrl: Array.isArray(item.images) ? item.images[0] || null : null };
    }
    if (report.targetType === 'message' && VALID_ID.test(report.targetId || '') && VALID_ID.test(report.conversationId || '')) {
      const doc = await db.collection('conversations').doc(report.conversationId)
        .collection('messages').doc(report.targetId).get();
      if (!doc.exists) return { exists: false };
      return { exists: true, text: String(doc.data().text || '').slice(0, 500), moderated: doc.data().moderated === true };
    }
    return { exists: true };
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
    const people = await names(docs.flatMap(doc => [doc.data().reporterId, doc.data().targetUserId]));
    const reports = await Promise.all(docs.map(async doc => {
      const data = doc.data();
      return {
        id: doc.id, status: data.status, reason: data.reason, note: data.note || '',
        targetType: data.targetType, targetId: data.targetId, conversationId: data.conversationId || null,
        createdAt: dateString(data.createdAt),
        reporter: { id: data.reporterId, ...(people.get(data.reporterId) || {}) },
        targetUser: { id: data.targetUserId, ...(people.get(data.targetUserId) || {}) },
        target: await targetSnapshot(data),
        resolution: data.resolution || null, resolutionNote: data.resolutionNote || '',
        resolvedAt: dateString(data.resolvedAt),
      };
    }));
    return { status: 200, body: { reports, truncated: snapshot.size > MAX_LIST } };
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
      if (!ACTIONS[action].types.includes(report.targetType)) throw new ApiError(400, 'Action does not match the report', 'VALIDATION');
      const writes = [];
      const timestamp = now();
      const moderation = { reportId, moderatedBy: staff.uid, moderatedAt: timestamp };
      if (action === 'remove_listing') {
        const itemRef = db.collection('catalog_items').doc(report.targetId);
        const item = await tx.get(itemRef);
        if (item.exists) writes.push(() => tx.update(itemRef, { status: 'removed', moderation }));
      }
      if (action === 'remove_message') {
        const messageRef = db.collection('conversations').doc(report.conversationId).collection('messages').doc(report.targetId);
        const message = await tx.get(messageRef);
        if (message.exists) writes.push(() => tx.update(messageRef, { text: REMOVED_MESSAGE, moderated: true, moderation }));
      }
      if (action === 'suspend_user') {
        const uid = report.targetUserId;
        if (typeof uid !== 'string' || !VALID_ID.test(uid)) throw new ApiError(400, 'Invalid target user');
        const assignment = await tx.get(db.collection('staff_assignments').doc(uid));
        if (assignment.exists && assignment.data().active === true) {
          throw new ApiError(409, 'Staff accounts cannot be suspended here; revoke staff access first');
        }
        const userRef = db.collection('users').doc(uid);
        const user = await tx.get(userRef);
        // Gỡ luôn các bài đang mở của người bị khoá để không còn ai liên hệ nhầm.
        // Một điều kiện bằng rồi lọc trạng thái trong bộ nhớ: không phụ thuộc composite index.
        const listings = await tx.get(db.collection('catalog_items').where('donorId', '==', uid).limit(200));
        if (user.exists) writes.push(() => tx.update(userRef, { suspended: true, suspendedAt: timestamp }));
        for (const doc of listings.docs.filter(item => item.data().status === 'available')) {
          writes.push(() => tx.update(doc.ref, { status: 'removed', moderation }));
        }
        suspendUid = uid;
      }
      await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
      for (const write of writes) write();
      tx.update(reportRef, {
        status: 'resolved', resolution: action, resolutionNote: (body.note || '').trim(),
        resolvedBy: staff.uid, resolvedAt: timestamp,
      });
    });
    // Khoá đăng nhập sau khi đã ghi Firestore: lỗi ở đây thì admin bấm lại không bị khoá hai lần vào báo cáo.
    if (suspendUid) {
      try {
        await auth.updateUser(suspendUid, { disabled: true });
        await auth.revokeRefreshTokens(suspendUid);
      } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error;
      }
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
