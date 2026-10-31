const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createStockIntakeApi } = require('../stock-intake-api.cjs');
const { createDistributionApi } = require('../distribution-api.cjs');

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

// Mỗi test dựng kho, nhân sự, người thụ hưởng riêng và đi qua API nhập kho thật, để liên kết
// donation ↔ phiếu thực nhận ↔ mục tồn là liên kết hệ thống sinh ra chứ không dựng tay.
async function withFixture(run) {
  const suffix = randomUUID().slice(0, 8);
  const app = initializeApp({ projectId: 'demo-reshare' }, `donor-loop-${suffix}`);
  const db = getFirestore(app);
  const warehouseId = `kho-trao-${suffix}`;
  const worker = `worker-trao-${suffix}`;
  const beneficiaryId = `ben-trao-${suffix}`;
  const paths = [];
  const seed = async (path, data) => { paths.push(path); await db.doc(path).set(data); };
  const verifyToken = async token => ({ uid: token, email: `${token}@reshare.test` });
  const now = () => FieldValue.serverTimestamp();
  const intake = createStockIntakeApi({ db, verifyToken, serverTimestamp: now });
  const distribution = createDistributionApi({ db, verifyToken, serverTimestamp: now });
  const auth = { authorization: `Bearer ${worker}` };

  const fx = {
    db, suffix, warehouseId, seed,
    async stock(donationId, quantity) {
      const receiptId = `rcp_${donationId}`;
      await seed(`donations/${donationId}`, {
        id: donationId, donorId: `donor-${suffix}`, title: 'Sách giáo khoa', category: 'books',
        quantity: quantity + 2, status: 'received', warehouseId, actualReceiptId: receiptId, version: 3,
      });
      await seed(`receipts/${receiptId}`, {
        id: receiptId, donationId, warehouseId, quantity, unitId: 'piece', conditionId: 'good',
      });
      const res = await intake.handle('POST', `/v1/admin/donations/${donationId}/stock-in`, auth,
        { receiptId, location: 'Kệ A1', note: '', idempotencyKey: `stk_${receiptId}` });
      assert.equal(res.status, 201);
      paths.push(`inventory/inv_${receiptId}`, `stock_entries/ste_${receiptId}`,
        `inventory_movements/mov_in_${receiptId}`);
      return `inv_${receiptId}`;
    },
    async distribute(itemId, quantity, expectedVersion, key) {
      const res = await distribution.handle('POST', '/v1/admin/distribution', auth, {
        warehouseId, itemId, beneficiaryId, quantity, handedOver: true, expectedVersion,
        idempotencyKey: `${key}-${suffix}`,
      });
      paths.push(`distribution_vouchers/${res.body.voucher.id}`, `inventory_movements/${res.body.movement.id}`);
      return res;
    },
    donation: async id => (await db.doc(`donations/${id}`).get()).data(),
    inventory: async id => (await db.doc(`inventory/${id}`).get()).data(),
  };

  try {
    await seed(`warehouses/${warehouseId}`, { name: 'Kho trao tặng', status: 'active' });
    await seed(`staff_assignments/${worker}`, { active: true, role: 'warehouse_admin', warehouseIds: [warehouseId] });
    await seed(`beneficiaries/${beneficiaryId}`, { name: 'Người nhận', warehouseId, status: 'approved', phone: '0900000000' });
    await run(fx);
  } finally {
    const cleanup = await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
    assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Emulator cleanup must succeed');
  }
}

test('US17: trao hết lượng thực nhận thì donor thấy "đã trao tặng", không lộ người nhận', { skip }, () =>
  withFixture(async fx => {
    const id = `don-full-${fx.suffix}`;
    const item = await fx.stock(id, 2);
    const stockedVersion = (await fx.donation(id)).version;

    const res = await fx.distribute(item, 2, 1, 'full');
    assert.equal(res.status, 201);
    assert.equal(res.body.donationClosed, true);
    assert.deepEqual(res.body.warnings, []);
    assert.equal((await fx.inventory(item)).quantityDistributed, 2);

    const done = await fx.donation(id);
    assert.equal(done.status, 'distributed');
    assert.ok(done.distributedAt, 'phải ghi thời điểm trao tặng');
    assert.equal(done.version, stockedVersion + 1);
    // Donor đọc được document này: không được có dấu vết người nhận hay phiếu xuất.
    for (const field of ['beneficiaryId', 'beneficiary', 'voucherId', 'phone', 'quantityDistributed']) {
      assert.equal(Object.hasOwn(done, field), false, `donation không được chứa ${field}`);
    }
  }));

test('US17: gửi lại cùng request không cộng bộ đếm lần hai, không tăng version donation', { skip }, () =>
  withFixture(async fx => {
    const id = `don-replay-${fx.suffix}`;
    const item = await fx.stock(id, 2);
    await fx.distribute(item, 2, 1, 'once');
    const versionAfter = (await fx.donation(id)).version;

    const replay = await fx.distribute(item, 2, 1, 'once');
    assert.equal(replay.status, 200);
    assert.equal(replay.body.idempotentReplay, true);
    assert.equal((await fx.inventory(item)).quantityDistributed, 2, 'không cộng thêm');
    assert.equal((await fx.donation(id)).version, versionAfter);
  }));

test('US17: xuất một phần chỉ cộng bộ đếm, đủ lượng thực nhận mới chốt donation', { skip }, () =>
  withFixture(async fx => {
    const id = `don-partial-${fx.suffix}`;
    const item = await fx.stock(id, 3);
    const stockedVersion = (await fx.donation(id)).version;

    const first = await fx.distribute(item, 1, 1, 'part1');
    assert.equal(first.body.donationClosed, false);
    assert.equal((await fx.inventory(item)).quantityDistributed, 1);
    assert.equal((await fx.donation(id)).status, 'in_stock');
    assert.equal((await fx.donation(id)).version, stockedVersion, 'xuất một phần không đụng donation');

    const last = await fx.distribute(item, 2, 2, 'part2');
    assert.equal(last.body.donationClosed, true);
    assert.equal((await fx.inventory(item)).quantityDistributed, 3);
    assert.equal((await fx.donation(id)).status, 'distributed');
  }));

test('US17: mục tồn cũ chưa có bộ đếm được đối soát từ movement xuất rồi mới chốt', { skip }, () =>
  withFixture(async fx => {
    const id = `don-legacy-${fx.suffix}`;
    const item = await fx.stock(id, 3);
    await fx.distribute(item, 1, 1, 'legacy1');
    // Mô phỏng dữ liệu trước bản sửa: chưa từng có trường quantityDistributed.
    await fx.db.doc(`inventory/${item}`).update({ quantityDistributed: FieldValue.delete() });

    const res = await fx.distribute(item, 2, 2, 'legacy2');
    assert.deepEqual(res.body.warnings, []);
    assert.equal(res.body.donationClosed, true);
    assert.equal((await fx.inventory(item)).quantityDistributed, 3, 'cộng 1 từ movement cũ + 2 lần này');
    assert.equal((await fx.donation(id)).status, 'distributed');
  }));

test('US17: hàng bị trừ tồn mà không ghi sổ thì không báo "đã trao", gắn cờ kiểm tra', { skip }, () =>
  withFixture(async fx => {
    // Đúng kịch bản phép trừ quantityReceived − quantityAvailable sẽ báo sai: nhận 3, trao 1,
    // 1 cái hỏng bị trừ tồn ngoài sổ, rồi trao nốt 1 → tồn về 0 nhưng mới trao 2/3.
    const id = `don-writeoff-${fx.suffix}`;
    const item = await fx.stock(id, 3);
    await fx.distribute(item, 1, 1, 'wo1');
    await fx.db.doc(`inventory/${item}`).update({
      quantityDistributed: FieldValue.delete(), quantityAvailable: 1, available: 1,
    });

    const res = await fx.distribute(item, 1, 2, 'wo2');
    assert.equal(res.status, 201, 'trao hàng cho người nhận không bị chặn vì sổ lệch');
    assert.deepEqual(res.body.warnings, ['LEGACY_DISTRIBUTION_UNRECONCILED']);
    assert.equal(res.body.donationClosed, false);
    const inventory = await fx.inventory(item);
    assert.equal(inventory.needsReconciliation, true);
    assert.equal(inventory.reconciliationIssue, 'LEGACY_DISTRIBUTION_UNRECONCILED');
    assert.equal(Object.hasOwn(inventory, 'quantityDistributed'), false, 'không ghi một con số đoán');
    assert.equal((await fx.donation(id)).status, 'in_stock');
  }));

test('US17: chuỗi nguồn lệch thì không cập nhật nhầm donation', { skip }, () =>
  withFixture(async fx => {
    const cases = [
      ['receipt-khac', id => ({ path: `donations/${id}`, patch: { actualReceiptId: 'rcp_khac' } })],
      ['kho-khac', id => ({ path: `donations/${id}`, patch: { warehouseId: 'kho-khac' } })],
      ['so-luong-lech', id => ({ path: `receipts/rcp_${id}`, patch: { quantity: 9 } })],
      ['phieu-nhap-lech', id => ({ path: `donations/${id}`, patch: { stockEntryId: 'ste_khac' } })],
    ];
    for (const [label, tamper] of cases) {
      const id = `don-link-${label}-${fx.suffix}`;
      const item = await fx.stock(id, 1);
      const { path, patch } = tamper(id);
      await fx.db.doc(path).update(patch);

      const res = await fx.distribute(item, 1, 1, `link-${label}`);
      assert.equal(res.status, 201, `${label}: xuất kho vẫn thành công`);
      assert.deepEqual(res.body.warnings, ['DONATION_LINK_MISMATCH'], label);
      assert.equal(res.body.donationClosed, false, label);
      assert.notEqual((await fx.donation(id)).status, 'distributed', label);
    }
  }));

test('US17: hàng nhập ngoài luồng quyên góp không bị đếm, đối soát hay gắn cờ', { skip }, () =>
  withFixture(async fx => {
    // Mục tồn không có donationId (dữ liệu kiểu cũ): không có donor nào để báo.
    const item = `inv-ngoai-luong-${fx.suffix}`;
    await fx.seed(`inventory/${item}`, {
      id: item, itemName: 'Chăn ấm', warehouseId: fx.warehouseId, quantityAvailable: 2,
      unitId: 'piece', version: 1,
    });
    const res = await fx.distribute(item, 2, 1, 'ngoai-luong');
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.warnings, []);
    assert.equal(res.body.donationClosed, false);
    const inventory = await fx.inventory(item);
    assert.equal(inventory.quantityAvailable, 0);
    for (const field of ['needsReconciliation', 'reconciliationIssue', 'quantityDistributed']) {
      assert.equal(Object.hasOwn(inventory, field), false, `hàng ngoài luồng không được có ${field}`);
    }
  }));

test('US17: donation không ở in_stock thì không ghi đè để che dữ liệu lệch', { skip }, () =>
  withFixture(async fx => {
    const id = `don-odd-${fx.suffix}`;
    const item = await fx.stock(id, 1);
    await fx.db.doc(`donations/${id}`).update({ status: 'received' });

    const res = await fx.distribute(item, 1, 1, 'odd');
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.warnings, ['DONATION_STATUS_UNEXPECTED']);
    assert.equal((await fx.donation(id)).status, 'received');
  }));
