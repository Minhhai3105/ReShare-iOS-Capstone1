const test = require('node:test');
const assert = require('node:assert/strict');
const { createCampaignsApi, validateCampaignFields, endOfLocalDay } = require('../campaigns-api.cjs');

const validBody = {
  title: 'Áo ấm mùa lũ', organizer: 'Trường TH Hòa Bắc', category: 'clothing', unitId: 'piece',
  targetQuantity: 200, endDate: '2026-12-20', hubIds: ['hub-haichau'],
};

test('chiến dịch mới phải đủ field bắt buộc và đúng kiểu', () => {
  const fields = validateCampaignFields({ ...validBody, title: '  Áo ấm  ', guidelines: [' Đồ đã giặt sạch '] }, { required: true });
  assert.equal(fields.title, 'Áo ấm');
  assert.deepEqual(fields.guidelines, ['Đồ đã giặt sạch']);
  assert.ok(fields.endDate instanceof Date);
  for (const key of ['title', 'organizer', 'category', 'unitId', 'targetQuantity', 'endDate', 'hubIds']) {
    const { [key]: _omitted, ...rest } = validBody;
    assert.throws(() => validateCampaignFields(rest, { required: true }), { status: 400 }, `thiếu ${key}`);
  }
  const invalid = [
    { title: '' }, { title: 'x'.repeat(121) }, { category: 'electronics' }, { unitId: 'litre' },
    { targetQuantity: 0 }, { targetQuantity: '5' }, { urgent: 'yes' }, { endDate: '20-12-2026' },
    { endDate: '2026-02-30' }, { hubIds: [] }, { hubIds: ['a', 'a'] }, { hubIds: ['bad id'] },
    { guidelines: [''] }, { guidelines: Array(9).fill('ok') }, { warehouseId: 'kho-a' },
    { receivedQuantity: 999 }, { status: 'active' },
  ];
  for (const patch of invalid) {
    assert.throws(() => validateCampaignFields({ ...validBody, ...patch }, { required: true }), { status: 400 },
      JSON.stringify(patch));
  }
});

test('sửa chiến dịch chỉ nhận field cho phép kèm expectedVersion', () => {
  assert.deepEqual(validateCampaignFields({ urgent: true, expectedVersion: 2 }, { required: false }), { urgent: true });
  assert.throws(() => validateCampaignFields({ receivedDonationCount: 1, expectedVersion: 1 }, { required: false }),
    { status: 400 });
});

test('ngày kết thúc là cuối ngày theo giờ Việt Nam', () => {
  assert.equal(endOfLocalDay('2026-12-20').toISOString(), '2026-12-20T16:59:59.999Z');
  assert.equal(endOfLocalDay('2026-13-01'), null);
  assert.equal(endOfLocalDay(20261220), null);
});

test('chỉ System Admin đang hoạt động mới gọi được API chiến dịch', async () => {
  const assignments = {
    sa: { active: true, role: 'system_admin' },
    wa: { active: true, role: 'warehouse_admin', warehouseIds: ['kho-a'] },
    revoked: { active: false, role: 'system_admin' },
  };
  const db = {
    collection: name => ({
      doc: id => ({ get: async () => ({ exists: Boolean(assignments[id]), data: () => assignments[id] }) }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
      _name: name,
    }),
  };
  const api = createCampaignsApi({ db, verifyToken: async token => ({ uid: token }) });
  await assert.rejects(api.handle('GET', '/v1/admin/campaigns', {}), { status: 401 });
  await assert.rejects(api.handle('GET', '/v1/admin/campaigns', { authorization: 'Bearer wa' }), { status: 403 });
  await assert.rejects(api.handle('GET', '/v1/admin/campaigns', { authorization: 'Bearer revoked' }), { status: 403 });
  await assert.rejects(api.handle('GET', '/v1/admin/campaigns/x/delete', { authorization: 'Bearer sa' }), { status: 404 });
  const result = await api.handle('GET', '/v1/admin/campaigns', { authorization: 'Bearer sa' });
  assert.deepEqual(result, { status: 200, body: { campaigns: [] } });
});
