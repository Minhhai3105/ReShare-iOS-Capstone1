const { ApiError } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');
const { AUTO_REMOVE_DEFAULT_THRESHOLD, normalizeConfidence } = require('./ai-moderation.cjs');
const { AUDIT_COLLECTION, readRemovalReports, applyListingRemoval } = require('./p2p-listing-removal.cjs');

// Trang "Kho đồ 0đ" trên Web Admin (17/11/2026): nhân sự xem bài đăng P2P, chủ động gỡ bài vi phạm
// (không cần chờ báo cáo) và khôi phục bài gỡ nhầm. App ghi bài vào `catalog_items` theo rules;
// trạng thái `removed` chỉ backend ghi được (rules không có nhánh nào cho client đặt `removed`).
//
// Phạm vi theo khu vực:
// - System Admin: mọi bài.
// - Warehouse Admin: chỉ bài có `district` thuộc các quận mà kho được giao phụ trách
//   (`warehouses/{id}.districts`, do script backend/scripts/set-warehouse-districts.cjs ghi).
//   Bài ở quận chưa kho nào phụ trách thì chỉ System Admin thấy.
// - Khoá tài khoản vẫn chỉ làm ở trang Báo cáo vi phạm (System Admin), vì ảnh hưởng mọi khu vực.
//
// Gỡ bài tự đóng các báo cáo đang mở về bài đó (trừ báo cáo đang khoá tài khoản dở). Mỗi lần gỡ /
// khôi phục ghi một dòng vào `p2p_listing_audit` (không có match block trong rules ⇒ client không
// đọc/ghi được). Quyền và phạm vi được đọc lại TRONG transaction, nên nhân sự vừa bị thu hồi quyền
// hoặc đổi kho không ghi được bằng quyền cũ.
// Mọi truy vấn chỉ dùng một điều kiện (bằng / in) để không cần composite index.

const VALID_ID = /^[A-Za-z0-9_-]{1,200}$/;
const KNOWN_STATUSES = Object.freeze(['available', 'reserved', 'completed', 'removed']);
// Bài cũ lưu trạng thái bằng chữ tiếng Việt (app iOS vẫn đọc được các giá trị này).
const LEGACY_STATUS = Object.freeze({ 'sẵn sàng nhận đồ': 'available', 'đã có người hẹn': 'reserved', 'đã trao tặng': 'completed' });
const REMOVABLE_FROM = Object.freeze(['available', 'reserved', 'completed']);
const MAX_LISTINGS = 500;
const MAX_REPORTS = 1000;
const MAX_DETAIL_ROWS = 100;
const MAX_WAREHOUSES = 20;
const REASON_MAX = 300;

function dateString(value) {
  return value?.toDate?.().toISOString() || (value instanceof Date ? value.toISOString() : value || null);
}

// So quận không phân biệt hoa thường, khoảng trắng thừa, dạng Unicode.
function districtKey(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

function normalizeStatus(raw) {
  const value = String(raw || '').normalize('NFC').trim();
  if (KNOWN_STATUSES.includes(value)) return value;
  return LEGACY_STATUS[value.toLocaleLowerCase('vi')] || 'unknown';
}

function inScope(scope, district) {
  if (scope.all) return true;
  const key = districtKey(district);
  return Boolean(key) && scope.districts.some(item => districtKey(item) === key);
}

function httpsImages(data) {
  const list = Array.isArray(data.images) ? data.images : [];
  const urls = list.filter(url => typeof url === 'string' && url.startsWith('https://'));
  if (!urls.length && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('https://')) urls.push(data.imageUrl);
  return urls;
}

function aiModerationBody(data) {
  if (!data || !['safe', 'flagged', 'error'].includes(data.status)) return null;
  return {
    status: data.status, categories: Array.isArray(data.categories) ? data.categories : [],
    reason: typeof data.reason === 'string' ? data.reason : '', model: data.model || null,
    confidence: normalizeConfidence(data.confidence),
    checkedAt: dateString(data.checkedAt),
  };
}

function moderationSource(moderation) {
  return moderation?.source || (moderation?.reportId ? 'report' : 'unknown');
}

function moderationBody(moderation) {
  if (!moderation || typeof moderation !== 'object') return null;
  return {
    action: moderation.action || 'remove',
    // Bài gỡ từ trang Báo cáo vi phạm (hoặc khi khoá tài khoản) chỉ có reportId.
    source: moderationSource(moderation),
    reason: moderation.reason || '',
    previousStatus: moderation.previousStatus || null,
    reportId: moderation.reportId || null,
    by: moderation.moderatedBy || null,
    at: dateString(moderation.moderatedAt),
  };
}

// Lý do không khôi phục được (null = khôi phục được). Chỉ khôi phục bài đang mở trước khi gỡ và
// chưa vướng hẹn/bàn giao, để không tạo lại một cuộc hẹn đã bị bỏ dở. Bài gỡ từ trang Báo cáo vi
// phạm (hoặc khi khoá tài khoản) là quyết định của System Admin: Warehouse Admin không đảo lại được.
function restoreBlocker(data, owner, role) {
  if (normalizeStatus(data.status) !== 'removed') return 'NOT_REMOVED';
  const source = moderationSource(data.moderation);
  if (role !== 'system_admin') {
    if (source === 'report') return 'SYSTEM_ADMIN_ONLY';
    if (!['admin_p2p', 'ai'].includes(source)) return 'UNKNOWN_REMOVAL_SOURCE';
  }
  if (!owner?.exists) return 'OWNER_MISSING';
  if (owner.suspended) return 'OWNER_SUSPENDED';
  const previous = data.moderation?.previousStatus;
  if (previous && previous !== 'available') return 'NOT_OPEN_BEFORE';
  if (data.reservedChatId || data.reservedRequesterId ||
      data.donorHandoverConfirmed === true || data.requesterHandoverConfirmed === true) return 'HAS_RESERVATION';
  return null;
}

function validateRemoveBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['expectedStatus', 'reason'].includes(key)) ||
      !REMOVABLE_FROM.includes(body.expectedStatus) ||
      (body.reason !== undefined && typeof body.reason !== 'string')) {
    throw new ApiError(400, 'Invalid remove request', 'VALIDATION');
  }
  const reason = (body.reason || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (reason.length > REASON_MAX) throw new ApiError(400, 'Reason is too long', 'VALIDATION');
  return { expectedStatus: body.expectedStatus, reason };
}

function validateRestoreBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'expectedStatus') || body.expectedStatus !== 'removed') {
    throw new ApiError(400, 'Invalid restore request', 'VALIDATION');
  }
}

function createP2pListingsApi({ db, verifyToken, serverTimestamp, aiChecks = null }) {
  if (!db || !verifyToken) throw new Error('P2P listings API configuration is incomplete');
  const now = serverTimestamp || (() => new Date());
  const aiAutoRemove = aiChecks?.autoRemove ?? { enabled: false, threshold: AUTO_REMOVE_DEFAULT_THRESHOLD };

  // Đọc vai trò và các quận được phụ trách. `read` là ref => ref.get() hoặc ref => tx.get(ref).
  async function scopeFor(read, uid) {
    const assignment = await read(db.collection('staff_assignments').doc(uid));
    const data = assignment.exists ? assignment.data() : null;
    if (data?.active !== true || !['system_admin', 'warehouse_admin'].includes(data.role)) return null;
    if (data.role === 'system_admin') return { role: data.role, all: true, districts: [] };
    const ids = (Array.isArray(data.warehouseIds) ? data.warehouseIds : [])
      .filter(id => typeof id === 'string' && VALID_ID.test(id)).slice(0, MAX_WAREHOUSES);
    const warehouses = await Promise.all(ids.map(id => read(db.collection('warehouses').doc(id))));
    const districts = new Map();
    for (const doc of warehouses) {
      if (!doc.exists || doc.data().status === 'inactive') continue;
      for (const district of Array.isArray(doc.data().districts) ? doc.data().districts : []) {
        if (typeof district === 'string' && districtKey(district)) {
          districts.set(districtKey(district), district.normalize('NFC').trim());
        }
      }
    }
    return { role: data.role, all: false, districts: [...districts.values()] };
  }

  async function staffFrom(headers) {
    const match = /^Bearer (\S+)$/.exec(headers?.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try { claims = await verifyToken(match[1]); }
    catch { throw new ApiError(401, 'Invalid session'); }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');
    const scope = await scopeFor(ref => ref.get(), claims.uid);
    if (!scope) throw new ApiError(403, 'Staff access required');
    return { uid: claims.uid, email: typeof claims.email === 'string' ? claims.email : null, scope };
  }

  async function people(uids) {
    const unique = [...new Set(uids.filter(uid => typeof uid === 'string' && VALID_ID.test(uid)))];
    const docs = unique.length ? await db.getAll(...unique.map(uid => db.collection('users').doc(uid))) : [];
    return new Map(docs.map(doc => [doc.id, {
      exists: doc.exists,
      name: doc.exists ? (doc.data().displayName || 'Chưa có tên') : 'Người dùng đã xoá',
      suspended: doc.exists && (doc.data().suspended === true || doc.data().unsuspendPending === true),
    }]));
  }

  function summary(doc, owners, reportCounts, role) {
    const data = doc.data();
    const owner = owners.get(data.donorId) || null;
    const images = httpsImages(data);
    return {
      id: doc.id,
      title: data.title || '',
      category: data.category || '',
      condition: data.condition || '',
      district: data.district || '',
      status: normalizeStatus(data.status),
      createdAt: dateString(data.createdAt),
      imageUrl: images[0] || null,
      imageCount: images.length,
      donor: { id: data.donorId || null, name: owner?.name || '', suspended: owner?.suspended === true },
      reports: reportCounts.get(doc.id) || { open: 0, total: 0 },
      moderation: moderationBody(data.moderation),
      aiModeration: aiModerationBody(data.aiModeration),
      restoreBlocker: restoreBlocker(data, owner, role),
    };
  }

  function scopeBody(scope) {
    return { role: scope.role, all: scope.all, districts: scope.districts };
  }

  async function list(staff) {
    const { scope } = staff;
    if (!scope.all && !scope.districts.length) {
      return { status: 200, body: { listings: [], truncated: false, aiEnabled: aiChecks?.enabled === true, aiAutoRemove, scope: scopeBody(scope) } };
    }
    // `in` nhận tối đa 30 giá trị; một kho chỉ phụ trách vài quận nên dư.
    const query = scope.all
      ? db.collection('catalog_items').limit(MAX_LISTINGS + 1)
      : db.collection('catalog_items').where('district', 'in', scope.districts.slice(0, 30)).limit(MAX_LISTINGS + 1);
    const [snapshot, reports] = await Promise.all([
      query.get(),
      db.collection('reports').where('targetType', '==', 'listing').limit(MAX_REPORTS).get(),
    ]);
    const docs = snapshot.docs.slice(0, MAX_LISTINGS).filter(doc => inScope(scope, doc.data().district));
    const reportCounts = new Map();
    for (const report of reports.docs) {
      const { targetId, status } = report.data();
      const counts = reportCounts.get(targetId) || { open: 0, total: 0 };
      counts.total += 1;
      if (status === 'open') counts.open += 1;
      reportCounts.set(targetId, counts);
    }
    const owners = await people(docs.map(doc => doc.data().donorId));
    const listings = docs.map(doc => summary(doc, owners, reportCounts, scope.role))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return { status: 200, body: { listings, truncated: snapshot.size > MAX_LISTINGS, aiEnabled: aiChecks?.enabled === true, aiAutoRemove, scope: scopeBody(scope) } };
  }

  async function detail(staff, id) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid listing ID');
    const doc = await db.collection('catalog_items').doc(id).get();
    if (!doc.exists) throw new ApiError(404, 'Listing not found');
    const data = doc.data();
    if (!inScope(staff.scope, data.district)) throw new ApiError(403, 'Listing is outside your area', 'OUT_OF_SCOPE');
    const [reportSnapshot, auditSnapshot] = await Promise.all([
      db.collection('reports').where('targetId', '==', id).limit(MAX_DETAIL_ROWS).get(),
      db.collection(AUDIT_COLLECTION).where('listingId', '==', id).limit(MAX_DETAIL_ROWS).get(),
    ]);
    const reports = reportSnapshot.docs.filter(report => report.data().targetType === 'listing');
    const owners = await people([data.donorId, ...reports.map(report => report.data().reporterId)]);
    const counts = new Map([[id, {
      open: reports.filter(report => report.data().status === 'open').length, total: reports.length,
    }]]);
    const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    return {
      status: 200,
      body: {
        aiEnabled: aiChecks?.enabled === true,
        aiAutoRemove,
        listing: { ...summary(doc, owners, counts, staff.scope.role), donorNote: String(data.donorNote || ''), images: httpsImages(data) },
        reports: reports.map(report => {
          const item = report.data();
          return {
            id: report.id, status: item.status, reason: item.reason, note: item.note || '',
            createdAt: dateString(item.createdAt),
            reporter: { id: item.reporterId || null, name: owners.get(item.reporterId)?.name || '' },
            resolution: item.resolution || null, resolutionNote: item.resolutionNote || '',
            resolvedAt: dateString(item.resolvedAt),
          };
        }).sort(byNewest),
        history: auditSnapshot.docs.map(entry => {
          const item = entry.data();
          return {
            id: entry.id, action: item.action, reason: item.reason || '', previousStatus: item.previousStatus || null,
            actorEmail: item.actorEmail || null, actorRole: item.actorRole || null,
            resolvedReports: Array.isArray(item.resolvedReportIds) ? item.resolvedReportIds.length : 0,
            createdAt: dateString(item.createdAt),
          };
        }).sort(byNewest),
      },
    };
  }

  // Quyền và phạm vi đọc lại trong transaction (vào read set): thu hồi quyền trước lúc commit thì
  // transaction chạy lại và bị từ chối.
  async function assertScopeInTransaction(tx, staff, district) {
    const scope = await scopeFor(ref => tx.get(ref), staff.uid);
    if (!scope) throw new ApiError(403, 'Staff access changed; reload session', 'STAFF_ACCESS_CHANGED');
    if (!inScope(scope, district)) throw new ApiError(403, 'Listing is outside your area', 'OUT_OF_SCOPE');
    return scope;
  }

  async function remove(staff, id, body) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid listing ID');
    const { expectedStatus, reason } = validateRemoveBody(body);
    const ref = db.collection('catalog_items').doc(id);
    const auditRef = db.collection(AUDIT_COLLECTION).doc();
    let resolvedReports = 0;
    await runTransaction(db, async tx => {
      // Mọi lần đọc trước mọi lần ghi (yêu cầu của transaction Firestore).
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ApiError(404, 'Listing not found');
      const data = doc.data();
      const reports = await readRemovalReports(tx, db, id);
      const scope = await assertScopeInTransaction(tx, staff, data.district);
      const current = normalizeStatus(data.status);
      if (current === 'removed') throw new ApiError(409, 'Listing already removed');
      if (current !== expectedStatus) throw new ApiError(409, 'Listing changed; reload first');
      resolvedReports = applyListingRemoval(tx, {
        ref, data, reports, auditRef, reason, timestamp: now(), previousStatus: current,
        actor: { source: 'admin_p2p', uid: staff.uid, email: staff.email, role: scope.role },
      });
    });
    return { status: 200, body: { id, status: 'removed', resolvedReports } };
  }

  async function restore(staff, id, body) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid listing ID');
    validateRestoreBody(body);
    const ref = db.collection('catalog_items').doc(id);
    const auditRef = db.collection(AUDIT_COLLECTION).doc();
    await runTransaction(db, async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ApiError(404, 'Listing not found');
      const data = doc.data();
      const ownerDoc = typeof data.donorId === 'string' && VALID_ID.test(data.donorId)
        ? await tx.get(db.collection('users').doc(data.donorId)) : null;
      const scope = await assertScopeInTransaction(tx, staff, data.district);
      if (normalizeStatus(data.status) !== 'removed') throw new ApiError(409, 'Listing changed; reload first');
      const ownerData = ownerDoc?.data();
      const owner = ownerData ? {
        exists: true, suspended: ownerData.suspended === true || ownerData.unsuspendPending === true,
      } : { exists: false };
      const blocker = restoreBlocker(data, owner, scope.role);
      if (blocker) throw new ApiError(409, 'Listing cannot be restored', 'RESTORE_BLOCKED', { reason: blocker });
      const timestamp = now();
      tx.update(ref, {
        status: 'available',
        moderation: { source: 'admin_p2p', action: 'restore', moderatedBy: staff.uid, moderatedAt: timestamp },
        ...(data.moderation?.source === 'ai'
          ? { 'aiModeration.staffOverride': { by: staff.uid, at: timestamp } } : {}),
      });
      tx.create(auditRef, {
        action: 'restore', listingId: id, title: data.title || '', district: data.district || '',
        donorId: data.donorId || null, previousStatus: 'removed', reason: '',
        resolvedReportIds: [], actorUid: staff.uid, actorEmail: staff.email, actorRole: scope.role, createdAt: timestamp,
      });
    });
    return { status: 200, body: { id, status: 'available' } };
  }

  async function aiCheck(staff, id, body) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid listing ID');
    if (body != null && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
      throw new ApiError(400, 'Invalid AI check request', 'VALIDATION');
    }
    // Kiểm tra quyền cả khi tính năng tắt để endpoint không trở thành đường lách phạm vi.
    await runTransaction(db, async tx => {
      const doc = await tx.get(db.collection('catalog_items').doc(id));
      if (!doc.exists) throw new ApiError(404, 'Listing not found');
      await assertScopeInTransaction(tx, staff, doc.data().district);
    });
    if (!aiChecks?.enabled) return { status: 200, body: { enabled: false, aiEnabled: false, aiModeration: null } };
    const result = await aiChecks.checkListing(id, {
      authorize: (tx, data) => assertScopeInTransaction(tx, staff, data.district),
    });
    return { status: 200, body: result };
  }

  async function handle(method, path, headers, body) {
    const listPath = path === '/v1/admin/p2p/listings';
    const detailMatch = /^\/v1\/admin\/p2p\/listings\/([^/]+)$/.exec(path);
    const actionMatch = /^\/v1\/admin\/p2p\/listings\/([^/]+)\/(remove|restore|ai-check)$/.exec(path);
    if (!listPath && !detailMatch && !actionMatch) throw new ApiError(404, 'Not found');
    if ((listPath || detailMatch) && method !== 'GET') throw new ApiError(404, 'Not found');
    if (actionMatch && method !== 'POST') throw new ApiError(404, 'Not found');
    const staff = await staffFrom(headers);
    if (listPath) return list(staff);
    if (detailMatch) return detail(staff, detailMatch[1]);
    if (actionMatch[2] === 'ai-check') return aiCheck(staff, actionMatch[1], body);
    return actionMatch[2] === 'remove' ? remove(staff, actionMatch[1], body) : restore(staff, actionMatch[1], body);
  }

  return { handle };
}

module.exports = {
  createP2pListingsApi, districtKey, normalizeStatus, restoreBlocker, validateRemoveBody, validateRestoreBody,
};
