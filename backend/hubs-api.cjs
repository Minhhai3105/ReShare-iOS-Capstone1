const { ApiError } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');
const { assertCurrentStaffAccess } = require('./staff-access.cjs');

// Điểm tiếp nhận (Hub) do System Admin quản lý trên Web Admin (15/11/2026). Client chỉ ĐỌC Hub
// (rules: write false); mọi thao tác tạo/sửa/tạm ẩn/mở lại đi qua API này bằng Admin SDK.
// Warehouse Admin chỉ được xem danh sách. Không có xoá: đơn cũ và chiến dịch vẫn trỏ tới Hub.
//
// Ràng buộc với phần còn lại của hệ thống:
// - App iOS chỉ hiện Hub `status == 'active'` và lưu kèm tên Hub vào đơn; rules đối chiếu tên đó
//   với tên Hub hiện tại, nên đổi tên chỉ ảnh hưởng đơn mới — lịch sử giữ tên lúc gửi.
// - Chiến dịch lưu bản sao `hubs: [{ id, name }]`. Đổi tên Hub thì cập nhật bản sao trong chiến
//   dịch nháp/đang mở cùng transaction; chiến dịch đã đóng giữ nguyên như hồ sơ lịch sử.
// - Không cho tạm ẩn Hub đang được chiến dịch ĐANG MỞ dùng: donor sẽ không còn điểm để chọn.
// Truy vấn chiến dịch chỉ dùng một điều kiện (array-contains / bằng) để không cần composite index.

const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;
const TEXT_LIMITS = Object.freeze({ name: 120, address: 200, openHours: 200 });
const EDITABLE_FIELDS = Object.freeze(['name', 'address', 'openHours', 'latitude', 'longitude', 'isDemo']);
const REQUIRED_ON_CREATE = Object.freeze(['name', 'address', 'openHours', 'latitude', 'longitude']);
const MAX_HUBS = 200;
const MAX_CAMPAIGNS = 100;
const TRANSITIONS = Object.freeze({ active: ['inactive'], inactive: ['active'] });

function dateString(value) {
  return value?.toDate?.().toISOString() || (value instanceof Date ? value.toISOString() : value || null);
}

// Tên dùng để so trùng: không phân biệt hoa thường, khoảng trắng thừa, dạng Unicode.
function nameKey(name) {
  return String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

function validateHubFields(body, { required }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Invalid hub fields', 'VALIDATION');
  }
  const allowed = required ? EDITABLE_FIELDS : [...EDITABLE_FIELDS, 'expectedVersion'];
  if (Object.keys(body).some(key => !allowed.includes(key))) {
    throw new ApiError(400, 'Invalid hub fields', 'VALIDATION');
  }
  if (required) {
    for (const key of REQUIRED_ON_CREATE) {
      if (!Object.hasOwn(body, key)) throw new ApiError(400, `${key} is required`, 'VALIDATION');
    }
  }
  const fields = {};
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (!Object.hasOwn(body, key)) continue;
    if (typeof body[key] !== 'string') throw new ApiError(400, `Invalid ${key}`, 'VALIDATION');
    const text = body[key].normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!text || text.length > max) throw new ApiError(400, `Invalid ${key}`, 'VALIDATION');
    fields[key] = text;
  }
  for (const [key, limit] of [['latitude', 90], ['longitude', 180]]) {
    if (!Object.hasOwn(body, key)) continue;
    const value = body[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < -limit || value > limit) {
      throw new ApiError(400, `Invalid ${key}`, 'VALIDATION');
    }
    fields[key] = value;
  }
  if (Object.hasOwn(body, 'isDemo')) {
    if (typeof body.isDemo !== 'boolean') throw new ApiError(400, 'Invalid isDemo flag', 'VALIDATION');
    fields.isDemo = body.isDemo;
  }
  return fields;
}

function hubFrom(doc, openCampaigns = []) {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name || '',
    address: data.address || '',
    openHours: data.openHours || '',
    latitude: typeof data.latitude === 'number' ? data.latitude : null,
    longitude: typeof data.longitude === 'number' ? data.longitude : null,
    // Hub cũ (nạp bằng script) thiếu cờ thì coi là minh hoạ, giống app iOS.
    isDemo: data.isDemo !== false,
    status: data.status === 'inactive' ? 'inactive' : 'active',
    version: data.version || 1,
    openCampaigns,
    createdAt: dateString(data.createdAt),
    updatedAt: dateString(data.updatedAt),
  };
}

function createHubsApi({ db, verifyToken, serverTimestamp }) {
  if (!db || !verifyToken) throw new Error('Hubs API configuration is incomplete');
  const now = serverTimestamp || (() => new Date());

  // Đọc: System Admin và Warehouse Admin đang hoạt động. Ghi: chỉ System Admin.
  async function staffFrom(headers, { systemOnly }) {
    const match = /^Bearer (\S+)$/.exec(headers?.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try { claims = await verifyToken(match[1]); }
    catch { throw new ApiError(401, 'Invalid session'); }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');
    const assignment = await db.collection('staff_assignments').doc(claims.uid).get();
    const data = assignment.exists ? assignment.data() : null;
    const roles = systemOnly ? ['system_admin'] : ['system_admin', 'warehouse_admin'];
    if (data?.active !== true || !roles.includes(data.role)) {
      throw new ApiError(403, systemOnly ? 'System Admin access required' : 'Staff access required');
    }
    return { uid: claims.uid };
  }

  function expectedVersionFrom(body) {
    const expectedVersion = body?.expectedVersion;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new ApiError(400, 'expectedVersion is required', 'VALIDATION');
    }
    return expectedVersion;
  }

  function assertUniqueName(hubDocs, name, selfId) {
    const key = nameKey(name);
    if (hubDocs.some(doc => doc.id !== selfId && nameKey(doc.data().name) === key)) {
      throw new ApiError(409, 'Hub name already exists', 'VALIDATION');
    }
  }

  async function campaignsUsing(read, hubId) {
    const snapshot = await read(db.collection('campaigns').where('hubIds', 'array-contains', hubId).limit(MAX_CAMPAIGNS));
    return snapshot.docs;
  }

  async function list() {
    const [hubs, openCampaigns] = await Promise.all([
      db.collection('hubs').limit(MAX_HUBS).get(),
      db.collection('campaigns').where('status', '==', 'active').limit(MAX_CAMPAIGNS).get(),
    ]);
    const usage = new Map();
    for (const campaign of openCampaigns.docs) {
      const data = campaign.data();
      for (const hubId of Array.isArray(data.hubIds) ? data.hubIds : []) {
        if (!usage.has(hubId)) usage.set(hubId, []);
        usage.get(hubId).push({ id: campaign.id, title: data.title || campaign.id });
      }
    }
    const items = hubs.docs.map(doc => hubFrom(doc, usage.get(doc.id) || []))
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name, 'vi') : a.status === 'active' ? -1 : 1));
    return { status: 200, body: { hubs: items } };
  }

  async function create(staff, body) {
    const fields = validateHubFields(body, { required: true });
    const ref = db.collection('hubs').doc();
    await runTransaction(db, async tx => {
      const all = await tx.get(db.collection('hubs').limit(MAX_HUBS));
      assertUniqueName(all.docs, fields.name, ref.id);
      await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
      const timestamp = now();
      tx.create(ref, {
        id: ref.id, isDemo: true, ...fields, status: 'active', version: 1,
        createdByUid: staff.uid, updatedByUid: staff.uid, createdAt: timestamp, updatedAt: timestamp,
      });
    });
    return { status: 201, body: { hub: hubFrom(await ref.get()) } };
  }

  async function update(staff, id, body) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid hub ID');
    const expectedVersion = expectedVersionFrom(body);
    const fields = validateHubFields(body, { required: false });
    if (!Object.keys(fields).length) throw new ApiError(400, 'No hub fields to update', 'VALIDATION');
    const ref = db.collection('hubs').doc(id);
    await runTransaction(db, async tx => {
      // Mọi lần đọc trước mọi lần ghi (yêu cầu của transaction Firestore).
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ApiError(404, 'Hub not found');
      const current = doc.data();
      const changed = Object.keys(fields).filter(key => current[key] !== fields[key]);
      const renamed = changed.includes('name');
      const all = renamed ? await tx.get(db.collection('hubs').limit(MAX_HUBS)) : null;
      const campaigns = renamed ? await campaignsUsing(query => tx.get(query), id) : [];
      await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
      if ((current.version || 1) !== expectedVersion) throw new ApiError(409, 'Hub changed; reload first');
      if (!changed.length) throw new ApiError(409, 'Hub is unchanged');
      if (renamed) assertUniqueName(all.docs, fields.name, id);
      tx.update(ref, { ...fields, version: expectedVersion + 1, updatedByUid: staff.uid, updatedAt: now() });
      for (const campaign of campaigns) {
        const data = campaign.data();
        if (!['draft', 'active'].includes(data.status) || !Array.isArray(data.hubs)) continue;
        tx.update(campaign.ref, {
          hubs: data.hubs.map(hub => (hub.id === id ? { ...hub, name: fields.name } : hub)),
        });
      }
    });
    return { status: 200, body: { hub: hubFrom(await ref.get()) } };
  }

  async function changeStatus(staff, id, body) {
    if (!VALID_ID.test(id)) throw new ApiError(400, 'Invalid hub ID');
    if (!body || Object.keys(body).some(key => !['expectedVersion', 'status'].includes(key)) ||
        !['active', 'inactive'].includes(body.status)) {
      throw new ApiError(400, 'Invalid hub status', 'VALIDATION');
    }
    const expectedVersion = expectedVersionFrom(body);
    const ref = db.collection('hubs').doc(id);
    await runTransaction(db, async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ApiError(404, 'Hub not found');
      const current = doc.data();
      const campaigns = body.status === 'inactive' ? await campaignsUsing(query => tx.get(query), id) : [];
      await assertCurrentStaffAccess(tx, db, staff.uid, { systemOnly: true });
      if ((current.version || 1) !== expectedVersion) throw new ApiError(409, 'Hub changed; reload first');
      const from = current.status === 'inactive' ? 'inactive' : 'active';
      if (!(TRANSITIONS[from] || []).includes(body.status)) throw new ApiError(409, 'Invalid status transition');
      const open = campaigns.filter(campaign => campaign.data().status === 'active')
        .map(campaign => ({ id: campaign.id, title: campaign.data().title || campaign.id }));
      if (open.length) {
        throw new ApiError(409, 'Hub is used by open campaigns', 'HUB_IN_USE', { campaigns: open });
      }
      tx.update(ref, { status: body.status, version: expectedVersion + 1, updatedByUid: staff.uid, updatedAt: now() });
    });
    return { status: 200, body: { hub: hubFrom(await ref.get()) } };
  }

  async function handle(method, path, headers, body) {
    const listPath = path === '/v1/admin/hubs';
    const actionMatch = /^\/v1\/admin\/hubs\/([^/]+)\/(update|status)$/.exec(path);
    if (!listPath && !actionMatch) throw new ApiError(404, 'Not found');
    if (listPath && method === 'GET') {
      await staffFrom(headers, { systemOnly: false });
      return list();
    }
    if (!(listPath || actionMatch) || method !== 'POST') throw new ApiError(404, 'Not found');
    const staff = await staffFrom(headers, { systemOnly: true });
    if (listPath) return create(staff, body);
    return actionMatch[2] === 'update' ? update(staff, actionMatch[1], body) : changeStatus(staff, actionMatch[1], body);
  }

  return { handle };
}

module.exports = { createHubsApi, validateHubFields, nameKey };
