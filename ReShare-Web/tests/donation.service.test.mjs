import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveQueueAccess,
  fetchDonationQueue,
  fetchQueueWarehouses,
  processAndPaginateDonations,
  enrichDonationSenders,
} from '../src/admin/donations/donation.service.js';
import { donationSender } from '../src/admin/donations/donation-sender.js';
import { DONATION_STATUS, DONATION_PAGE_SIZE, DONATION_SORT } from '../src/admin/donations/donation.constants.js';

test('Sender display prefers real names, handles missing data and keeps UID out of name labels', () => {
  assert.deepEqual(donationSender({ donorId: 'uid', donor: { name: ' Nguyễn An ', email: ' an@example.invalid ' }, donorName: 'Old name' }), { name: 'Nguyễn An', email: 'an@example.invalid' });
  assert.deepEqual(donationSender({ donorId: 'uid', donorName: 'uid' }), { name: 'Chưa cập nhật tên', email: null });
  assert.equal(donationSender({ donorId: 'uid', donor: { name: ' ' }, donorName: 'Tên trên đơn' }).name, 'Tên trên đơn');
  assert.equal(donationSender({ donorId: 'uid', donor: { name: 'uid' } }).name, 'Chưa cập nhật tên');
  assert.deepEqual(donationSender({ donorId: 'uid' }), { name: 'Chưa cập nhật tên', email: null });
});

test('Sender enrichment uses one request for current page and matches records by donation ID', async () => {
  const rows = [{ id: 'a', donorId: 'uid-a', donorName: 'uid-a' }, { id: 'b', donorId: 'uid-b' }];
  let calls = 0;
  const result = await enrichDonationSenders(rows, async ids => {
    calls++; assert.deepEqual(ids, ['a', 'b']);
    return [{ donationId: 'b', donor: { name: 'Chưa cập nhật tên', email: null } }, { donationId: 'a', donor: { name: 'Tên thật', email: 'an@example.invalid' } }];
  });
  assert.equal(calls, 1);
  assert.equal(result[0].donorName, 'Tên thật');
  assert.equal(result[0].donorEmail, 'an@example.invalid');
  assert.equal(result[1].donorName, 'Chưa cập nhật tên');
  assert.equal(rows[0].donorName, 'uid-a', 'Source records are not mutated');
  assert.deepEqual(await enrichDonationSenders([], () => assert.fail('Empty page must not call API')), []);
});

test('Sender lookup errors and malformed responses do not silently fall back to UID', async () => {
  for (const senders of [null, [], [{ donationId: 'other', donor: { name: 'wrong', email: null } }], [{ donationId: 'a', donor: { name: 'x', email: {} } }]]) {
    await assert.rejects(enrichDonationSenders([{ id: 'a' }], async () => senders), { status: 500 });
  }
  await assert.rejects(enrichDonationSenders([{ id: 'a' }], async () => { throw { code: 'FORBIDDEN' }; }), { status: 403 });
  await assert.rejects(enrichDonationSenders([{ id: 'a' }], async () => { throw new Error('offline'); }), { status: 'NETWORK_ERROR' });
  const result = processAndPaginateDonations([{ id: 'a', donorId: 'uid-a', createdAt: '2026-11-05' }], { isAllWarehouses: true }, {});
  assert.equal(result.items[0].donorName, 'Chưa cập nhật tên');
});

test('US09: resolveQueueAccess maps roles and warehouse scope correctly', () => {
  // System Admin
  const sysAdminAccess = resolveQueueAccess({ role: 'system_admin', active: true });
  assert.equal(sysAdminAccess.role, 'system_admin');
  assert.equal(sysAdminAccess.isAllWarehouses, true);

  // Warehouse Admin
  const whAdminAccess = resolveQueueAccess({
    role: 'warehouse_admin',
    active: true,
    warehouseIds: ['wh_dn_01'],
  });
  assert.equal(whAdminAccess.role, 'warehouse_admin');
  assert.equal(whAdminAccess.isAllWarehouses, false);
  assert.deepEqual(whAdminAccess.warehouseIds, ['wh_dn_01']);

  // Inactive or unauthorized role
  assert.equal(resolveQueueAccess({ role: 'warehouse_admin', active: false }), null);
  assert.equal(resolveQueueAccess({ role: 'warehouse_admin' }), null);
  assert.equal(resolveQueueAccess({ role: 'donor', active: true }), null);
});

test('US09: Warehouse Admin is forbidden from requesting another warehouse', async () => {
  const whAdminAccess = {
    role: 'warehouse_admin',
    isAllWarehouses: false,
    warehouseIds: ['wh_dn_01'],
  };

  await assert.rejects(
    fetchDonationQueue(whAdminAccess, { warehouseId: 'wh_dn_02' }),
    (err) => err.status === 403,
    'Phải chặn khi warehouse admin cố tình query kho không được phân công'
  );
});

test('US09: processAndPaginateDonations filters strictly by assigned warehouse and supports stable pagination', () => {
  const testDonations = [
    { id: 'qg-1', warehouseId: 'wh_dn_01', status: 'pending', createdAt: '2026-10-01T10:00:00Z', title: 'Áo khoác', donorId: 'd-1' },
    { id: 'qg-2', warehouseId: 'wh_dn_02', status: 'pending', createdAt: '2026-10-02T10:00:00Z', title: 'Sách', donorId: 'd-2' },
    { id: 'qg-3', warehouseId: 'wh_dn_01', status: 'approved', createdAt: '2026-10-03T10:00:00Z', title: 'Nồi cơm', donorId: 'd-1' },
    { id: 'qg-4', warehouseId: 'wh_dn_03', status: 'pending', createdAt: '2026-10-04T10:00:00Z', title: 'Quạt', donorId: 'd-3' },
    { id: 'qg-5', hubId: 'wh_dn_01', status: 'pending', createdAt: '2026-10-05T10:00:00Z', title: 'Đơn chưa phân kho', donorId: 'd-4' },
  ];

  const whAdminAccess = {
    role: 'warehouse_admin',
    isAllWarehouses: false,
    warehouseIds: ['wh_dn_01'],
  };

  const sysAdminAccess = {
    role: 'system_admin',
    isAllWarehouses: true,
    warehouseIds: [],
  };

  // Warehouse Admin chỉ thấy qg-1 và qg-3 (thuộc wh_dn_01)
  const whResult = processAndPaginateDonations(testDonations, whAdminAccess, { sort: DONATION_SORT.newestFirst });
  assert.equal(whResult.total, 2);
  assert.deepEqual(whResult.items.map((i) => i.id), ['qg-3', 'qg-1']);

  // System Admin thấy cả đơn chưa phân kho.
  const sysResult = processAndPaginateDonations(testDonations, sysAdminAccess, {});
  assert.equal(sysResult.total, 5);

  // Lọc theo trạng thái
  const pendingResult = processAndPaginateDonations(testDonations, sysAdminAccess, { status: 'pending' });
  assert.equal(pendingResult.total, 4);
  assert.ok(pendingResult.items.every((i) => i.status === 'pending'));

  // Kiểm tra chip đếm statusCounts độc lập với bộ lọc trạng thái
  assert.equal(pendingResult.statusCounts.pending, 4);
  assert.equal(pendingResult.statusCounts.approved, 1);
});
