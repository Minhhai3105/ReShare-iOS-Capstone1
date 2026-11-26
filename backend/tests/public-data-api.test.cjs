const test = require('node:test');
const assert = require('node:assert/strict');
const { createPublicDataApi, PUBLIC_DATA_PATH } = require('../public-data-api.cjs');
const { createCampaignsApi } = require('../campaigns-api.cjs');
const { createHubsApi } = require('../hubs-api.cjs');

// Fake Firestore tối thiểu trong bộ nhớ: doc get/update/create, truy vấn ==/array-contains + limit,
// runTransaction. `reads` đếm số lần truy vấn collection để chứng minh cache chặn đọc lặp.
function createDb(seed) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  const reads = [];
  const snapshot = (key, id) => ({
    id, exists: store.has(key), ref: { key }, data: () => (store.has(key) ? structuredClone(store.get(key)) : undefined),
  });
  function query(name, filters = [], max = Infinity) {
    return {
      where: (field, op, value) => query(name, [...filters, [field, op, value]], max),
      limit: count => query(name, filters, count),
      async get() {
        reads.push(name);
        const docs = [];
        for (const key of store.keys()) {
          const id = key.slice(name.length + 1);
          if (!key.startsWith(`${name}/`) || id.includes('/')) continue;
          const data = store.get(key);
          const ok = filters.every(([field, op, value]) => op === '=='
            ? data[field] === value
            : op === 'array-contains' ? Array.isArray(data[field]) && data[field].includes(value) : false);
          if (ok) docs.push(snapshot(key, id));
        }
        return { docs: docs.slice(0, max) };
      },
    };
  }
  let autoId = 0;
  const db = {
    collection: name => ({
      ...query(name),
      doc: (id = `auto-${++autoId}`) => ({ id, key: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`, id) }),
    }),
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: ref => (ref.key ? ref.get() : ref.get()),
        update: (ref, fields) => writes.push(() => store.set(ref.key, { ...store.get(ref.key), ...fields })),
        create: (ref, data) => writes.push(() => store.set(ref.key, data)),
      };
      const result = await fn(tx);
      for (const write of writes) write();
      return result;
    },
  };
  return { db, reads, store };
}

const NOW = new Date('2026-11-26T03:00:00Z');
const campaign = (overrides = {}) => ({
  title: 'Áo ấm', summary: 'Gom áo', description: 'Chi tiết', organizer: 'ReShare', category: 'clothing', unitId: 'piece',
  targetQuantity: 100, receivedQuantity: 10, receivedDonationCount: 2, urgent: false,
  endDate: new Date('2026-12-31T16:59:59Z'), hubIds: ['hub-a'], hubs: [{ id: 'hub-a', name: 'Hải Châu' }], guidelines: ['Giặt sạch'],
  status: 'active', version: 3, createdByUid: 'sa-uid', updatedByUid: 'sa-uid', createdAt: NOW, updatedAt: NOW,
  ...overrides,
});
const hub = (overrides = {}) => ({
  name: 'Hải Châu', address: '12 Lê Duẩn', openHours: '8:00–17:00', latitude: 16.07, longitude: 108.22, isDemo: true,
  status: 'active', version: 2, createdByUid: 'sa-uid', updatedByUid: 'sa-uid', ...overrides,
});

test('Dữ liệu công khai: chỉ nhận GET đúng 2 đường dẫn', async () => {
  const { db } = createDb({});
  const api = createPublicDataApi({ db, clock: () => NOW });
  assert.ok(PUBLIC_DATA_PATH.test('/v1/public/campaigns'));
  assert.ok(PUBLIC_DATA_PATH.test('/v1/public/hubs'));
  assert.ok(!PUBLIC_DATA_PATH.test('/v1/public/campaigns/x'));
  await assert.rejects(api.handle('GET', '/v1/public/users'), { status: 404 });
  await assert.rejects(api.handle('POST', '/v1/public/campaigns'), { status: 405 });
});

test('Dữ liệu công khai: chỉ trả field trong allowlist, không lộ UID nhân sự, bản nháp, chiến dịch đóng hay Hub đã ẩn', async () => {
  const { db } = createDb({
    'campaigns/open': campaign(),
    'campaigns/draft': campaign({ status: 'draft' }),
    'campaigns/closed': campaign({ status: 'closed' }),
    'hubs/hub-a': hub(),
    'hubs/hub-b': hub({ name: 'Ẩn', status: 'inactive' }),
    'hubs/hub-c': hub({ name: 'An Hải', isDemo: false }),
  });
  const api = createPublicDataApi({ db, clock: () => NOW });
  const campaigns = (await api.handle('GET', '/v1/public/campaigns')).body.campaigns;
  assert.deepEqual(campaigns, [{
    id: 'open', title: 'Áo ấm', summary: 'Gom áo', description: 'Chi tiết', organizer: 'ReShare', category: 'clothing',
    unitId: 'piece', targetQuantity: 100, receivedQuantity: 10, receivedDonationCount: 2, urgent: false,
    endDate: '2026-12-31T16:59:59.000Z', hubs: [{ id: 'hub-a', name: 'Hải Châu' }], guidelines: ['Giặt sạch'], status: 'active',
  }]);
  const hubs = (await api.handle('GET', '/v1/public/hubs')).body.hubs;
  assert.deepEqual(hubs.map(item => item.id), ['hub-c', 'hub-a'], 'sắp theo tên tiếng Việt, bỏ Hub đã ẩn');
  assert.deepEqual(Object.keys(hubs[0]).sort(),
    ['address', 'id', 'isDemo', 'latitude', 'longitude', 'name', 'openHours', 'status']);
  assert.equal(hubs[0].isDemo, false);
  assert.equal(hubs[1].isDemo, true);
});

test('Dữ liệu công khai: cache trong TTL, nhiều request cùng lúc chỉ đọc Firestore một lần', async () => {
  const { db, reads } = createDb({ 'campaigns/open': campaign(), 'hubs/hub-a': hub() });
  let now = NOW;
  const api = createPublicDataApi({ db, clock: () => now, ttlMs: 60_000 });
  await Promise.all(Array.from({ length: 10 }, () => api.handle('GET', '/v1/public/campaigns')));
  assert.deepEqual(reads, ['campaigns']);
  now = new Date(NOW.getTime() + 59_000);
  await api.handle('GET', '/v1/public/campaigns');
  assert.deepEqual(reads, ['campaigns'], 'còn trong TTL thì không đọc lại');
  now = new Date(NOW.getTime() + 61_000);
  await api.handle('GET', '/v1/public/campaigns');
  assert.deepEqual(reads, ['campaigns', 'campaigns'], 'hết TTL thì đọc lại');
  await api.handle('GET', '/v1/public/hubs');
  assert.deepEqual(reads, ['campaigns', 'campaigns', 'hubs'], 'cache của Hub tách riêng');
});

test('Dữ liệu công khai: hạn chót lọc lúc trả response, chiến dịch vừa quá hạn biến mất dù cache còn hạn', async () => {
  const endDate = new Date(NOW.getTime() + 30_000);
  const { db, reads } = createDb({ 'campaigns/soon': campaign({ endDate }) });
  let now = NOW;
  const api = createPublicDataApi({ db, clock: () => now, ttlMs: 60_000 });
  assert.equal((await api.handle('GET', '/v1/public/campaigns')).body.campaigns.length, 1);
  now = new Date(endDate.getTime() + 1);
  assert.deepEqual((await api.handle('GET', '/v1/public/campaigns')).body.campaigns, []);
  assert.equal(reads.length, 1, 'không cần đọc lại Firestore');
});

test('Dữ liệu công khai: lỗi đọc Firestore không bị cache, lần sau thử lại', async () => {
  const { db } = createDb({ 'campaigns/open': campaign() });
  let failing = true;
  const flaky = { collection: name => (failing ? { where: () => ({ limit: () => ({ get: async () => { throw new Error('mất mạng'); } }) }) } : db.collection(name)) };
  const api = createPublicDataApi({ db: flaky, clock: () => NOW });
  await assert.rejects(api.handle('GET', '/v1/public/campaigns'), /mất mạng/);
  failing = false;
  assert.equal((await api.handle('GET', '/v1/public/campaigns')).body.campaigns.length, 1);
});

test('Dữ liệu công khai: lượt nạp bắt đầu trước khi invalidate không được ghi dữ liệu cũ vào cache', async () => {
  const { db, reads, store } = createDb({ 'campaigns/open': campaign() });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const slow = {
    collection: name => ({
      where: (...args) => ({ limit: count => ({ get: async () => {
        // Chụp dữ liệu ngay lúc đọc như Firestore thật, rồi mới chờ.
        const result = await db.collection(name).where(...args).limit(count).get();
        const docs = result.docs.map(doc => { const data = doc.data(); return { ...doc, data: () => data }; });
        await gate;
        return { docs };
      } }) }),
    }),
  };
  const api = createPublicDataApi({ db: slow, clock: () => NOW });
  const stale = api.handle('GET', '/v1/public/campaigns');
  await new Promise(resolve => setImmediate(resolve));
  // Chiến dịch bị đóng trong lúc lượt nạp cũ đang chờ.
  store.set('campaigns/open', { ...store.get('campaigns/open'), status: 'closed' });
  api.invalidate('campaigns');
  release();
  assert.equal((await stale).body.campaigns.length, 1, 'request cũ vẫn nhận kết quả của nó');
  assert.deepEqual((await api.handle('GET', '/v1/public/campaigns')).body.campaigns, [], 'nhưng không được cache lại');
  assert.equal(reads.length, 2);
});

test('Chiến dịch vừa đóng: campaigns-api xoá cache ngay sau khi ghi thành công, lỗi 409 thì không xoá', async () => {
  const { db, reads } = createDb({
    'campaigns/open': campaign(),
    'hubs/hub-a': hub(),
    'staff_assignments/sa': { active: true, role: 'system_admin' },
  });
  const publicApi = createPublicDataApi({ db, clock: () => NOW, ttlMs: 60 * 60_000 });
  const invalidated = [];
  const campaignsApi = createCampaignsApi({
    db, verifyToken: async token => ({ uid: token }), clock: () => NOW,
    onChanged: (...kinds) => { invalidated.push(kinds); publicApi.invalidate(...kinds); },
  });
  const SA = { authorization: 'Bearer sa' };
  assert.equal((await publicApi.handle('GET', '/v1/public/campaigns')).body.campaigns.length, 1);

  await assert.rejects(campaignsApi.handle('POST', '/v1/admin/campaigns/open/status', SA, { status: 'closed', expectedVersion: 1 }),
    { status: 409 });
  assert.deepEqual(invalidated, [], 'ghi thất bại thì không xoá cache');
  await assert.rejects(campaignsApi.handle('POST', '/v1/admin/campaigns/open/status', {}, { status: 'closed', expectedVersion: 3 }),
    { status: 401 });
  assert.deepEqual(invalidated, []);

  await campaignsApi.handle('POST', '/v1/admin/campaigns/open/status', SA, { status: 'closed', expectedVersion: 3 });
  assert.deepEqual(invalidated, [['campaigns']]);
  assert.deepEqual((await publicApi.handle('GET', '/v1/public/campaigns')).body.campaigns, [],
    'không phải chờ hết TTL mới thấy chiến dịch đóng');
  assert.equal(reads.filter(name => name === 'campaigns').length, 2);
});

test('Hub vừa ẩn: hubs-api xoá cache cả Hub lẫn chiến dịch sau khi ghi thành công', async () => {
  const { db } = createDb({
    'hubs/hub-a': hub(),
    'staff_assignments/sa': { active: true, role: 'system_admin' },
    'staff_assignments/wa': { active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] },
  });
  const publicApi = createPublicDataApi({ db, clock: () => NOW, ttlMs: 60 * 60_000 });
  const invalidated = [];
  const hubsApi = createHubsApi({
    db, verifyToken: async token => ({ uid: token }),
    onChanged: (...kinds) => { invalidated.push(kinds); publicApi.invalidate(...kinds); },
  });
  assert.equal((await publicApi.handle('GET', '/v1/public/hubs')).body.hubs.length, 1);
  await assert.rejects(hubsApi.handle('POST', '/v1/admin/hubs/hub-a/status', { authorization: 'Bearer wa' },
    { status: 'inactive', expectedVersion: 2 }), { status: 403 });
  assert.deepEqual(invalidated, []);
  await hubsApi.handle('POST', '/v1/admin/hubs/hub-a/status', { authorization: 'Bearer sa' }, { status: 'inactive', expectedVersion: 2 });
  assert.deepEqual(invalidated, [['hubs', 'campaigns']]);
  assert.deepEqual((await publicApi.handle('GET', '/v1/public/hubs')).body.hubs, []);
});
