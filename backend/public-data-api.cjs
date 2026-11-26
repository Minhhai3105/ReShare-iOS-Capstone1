const { ApiError } = require('./image-api.cjs');

// Dữ liệu công khai: chiến dịch đang mở và điểm tiếp nhận đang hoạt động. Endpoint này:
// - chỉ trả field trong allowlist (không lộ createdByUid/updatedByUid/version...);
// - cache trong bộ nhớ (TTL + single-flight) để mở app hàng loạt không dồn đọc lên Firestore;
// - bị xoá cache ngay khi campaigns-api/hubs-api ghi thành công (invalidate).
// Cache có thể cũ tối đa TTL (vd. nhập kho cộng tiến độ không xoá cache). Đúng/sai nghiệp vụ
// vẫn do rules quyết định lúc tạo đơn (đọc trạng thái thật), cache chỉ phục vụ hiển thị.

const DEFAULT_TTL_MS = 60 * 1000;
const MAX_ITEMS = 50;
const PATHS = Object.freeze({ '/v1/public/campaigns': 'campaigns', '/v1/public/hubs': 'hubs' });

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Viết allowlist riêng thay vì dùng lại campaignFrom của admin: field admin thêm sau này
// sẽ không tự lọt ra ngoài.
function publicCampaignFrom(doc) {
  const data = doc.data();
  const endDate = toDate(data.endDate);
  if (!endDate || data.status !== 'active') return null;
  return {
    id: doc.id,
    title: typeof data.title === 'string' ? data.title : '',
    summary: typeof data.summary === 'string' ? data.summary : '',
    description: typeof data.description === 'string' ? data.description : '',
    organizer: typeof data.organizer === 'string' ? data.organizer : '',
    category: typeof data.category === 'string' ? data.category : '',
    unitId: typeof data.unitId === 'string' ? data.unitId : '',
    targetQuantity: finiteNumber(data.targetQuantity) ?? 0,
    receivedQuantity: finiteNumber(data.receivedQuantity) ?? 0,
    receivedDonationCount: Number.isSafeInteger(data.receivedDonationCount) ? data.receivedDonationCount : 0,
    urgent: data.urgent === true,
    endDate,
    hubs: Array.isArray(data.hubs)
      ? data.hubs.filter(hub => typeof hub?.id === 'string')
        .map(hub => ({ id: hub.id, name: typeof hub.name === 'string' ? hub.name : hub.id }))
      : [],
    guidelines: Array.isArray(data.guidelines) ? data.guidelines.filter(line => typeof line === 'string') : [],
    status: 'active',
  };
}

function publicHubFrom(doc) {
  const data = doc.data();
  const latitude = finiteNumber(data.latitude);
  const longitude = finiteNumber(data.longitude);
  if (data.status !== 'active' || typeof data.name !== 'string' || latitude === null || longitude === null) return null;
  return {
    id: doc.id,
    name: data.name,
    address: typeof data.address === 'string' ? data.address : '',
    openHours: typeof data.openHours === 'string' ? data.openHours : '',
    latitude,
    longitude,
    // Thiếu cờ thì coi như minh hoạ: thà nói thiếu còn hơn báo nhầm điểm đã nhận đồ thật.
    isDemo: data.isDemo !== false,
    status: 'active',
  };
}

function createPublicDataApi({ db, clock, ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!db) throw new Error('Public data API configuration is incomplete');
  const currentTime = clock || (() => new Date());
  const loaders = {
    async campaigns() {
      const snapshot = await db.collection('campaigns').where('status', '==', 'active').limit(MAX_ITEMS).get();
      return snapshot.docs.map(publicCampaignFrom).filter(Boolean);
    },
    async hubs() {
      const snapshot = await db.collection('hubs').where('status', '==', 'active').limit(MAX_ITEMS).get();
      return snapshot.docs.map(publicHubFrom).filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    },
  };
  // generation tăng mỗi lần invalidate: lượt nạp bắt đầu TRƯỚC khi chiến dịch bị đóng mà xong
  // SAU đó sẽ không được ghi vào cache, tránh hồi sinh dữ liệu cũ ngay sau khi vừa xoá.
  const entries = {
    campaigns: { value: null, loadedAt: 0, inflight: null, generation: 0 },
    hubs: { value: null, loadedAt: 0, inflight: null, generation: 0 },
  };

  async function read(kind) {
    const entry = entries[kind];
    const nowMs = currentTime().getTime();
    if (entry.value && nowMs - entry.loadedAt < ttlMs) return { items: entry.value, loadedAt: entry.loadedAt };
    if (!entry.inflight) {
      const generation = entry.generation;
      const promise = loaders[kind]().then(items => {
        const loadedAt = currentTime().getTime();
        if (entry.generation === generation) {
          entry.value = items;
          entry.loadedAt = loadedAt;
        }
        return { items, loadedAt };
      }).finally(() => {
        if (entry.inflight === promise) entry.inflight = null;
      });
      entry.inflight = promise;
    }
    return entry.inflight;
  }

  function invalidate(...kinds) {
    for (const kind of kinds.length ? kinds : Object.keys(entries)) {
      const entry = entries[kind];
      if (!entry) continue;
      entry.value = null;
      entry.loadedAt = 0;
      entry.inflight = null;
      entry.generation += 1;
    }
  }

  async function handle(method, path) {
    const kind = PATHS[path];
    if (!kind) throw new ApiError(404, 'Not found');
    if (method !== 'GET') throw new ApiError(405, 'Method not allowed');
    const { items, loadedAt } = await read(kind);
    const now = currentTime();
    // Lọc hạn chót lúc TRẢ response, không phải lúc nạp cache: chiến dịch vừa quá hạn biến mất
    // ngay cả khi cache còn trong TTL.
    const visible = kind === 'campaigns'
      ? items.filter(item => item.endDate.getTime() > now.getTime())
        .map(item => ({ ...item, endDate: item.endDate.toISOString() }))
      : items;
    return { status: 200, body: { [kind]: visible, generatedAt: new Date(loadedAt).toISOString() } };
  }

  return { handle, invalidate };
}

const PUBLIC_DATA_PATH = /^\/v1\/public\/(campaigns|hubs)$/;

module.exports = { createPublicDataApi, publicCampaignFrom, publicHubFrom, PUBLIC_DATA_PATH };
