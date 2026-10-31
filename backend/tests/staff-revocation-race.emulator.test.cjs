const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createStockIntakeApi } = require('../stock-intake-api.cjs');
const { createDistributionApi } = require('../distribution-api.cjs');
const { createReceiptApi } = require('../receipt-api.cjs');
const { createDonationReviewApi } = require('../donation-review-api.cjs');

const skip = !process.env.FIRESTORE_EMULATOR_HOST;
// Bắt kết quả thay vì assert.rejects ngay, để luôn kiểm được dữ liệu sau đó. Bản cũ của API thẩm
// định trả 403 *sau khi* đã commit (lần đọc quyền thứ hai nằm trong get() chạy sau transaction),
// nên chỉ nhìn mã lỗi sẽ bỏ sót đúng trường hợp nguy hiểm nhất: báo lỗi nhưng dữ liệu đã bị ghi.
const settle = promise => promise.then(() => null, error => error);
function assertBlockedByRecheck(error) {
  assert.ok(error, 'request phải bị từ chối');
  assert.equal(error.status, 403);
  assert.equal(error.code, 'STAFF_ACCESS_CHANGED', 'phải do lần kiểm lại trong transaction chặn, không phải kiểm sớm');
}

// Tái hiện race một cách tất định: API đọc quyền nhân sự trước transaction (kiểm sớm), và ngay
// sau lần đọc đó quyền bị thu hồi. Kiểm sớm thấy còn quyền; tới lúc transaction chạy thì đã mất.
// Chỉ lần kiểm lại trong transaction mới trả được STAFF_ACCESS_CHANGED, nên mã lỗi này chứng minh
// chính lần kiểm đó đã chặn — không phải kiểm sớm.
function revokeRightAfterPrecheck(db, uid) {
  let armed = true;
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'collection') {
        return name => {
          const collection = target.collection(name);
          if (name !== 'staff_assignments') return collection;
          const originalDoc = collection.doc.bind(collection);
          collection.doc = id => {
            const ref = originalDoc(id);
            if (armed && id === uid) {
              const realGet = ref.get.bind(ref);
              // Chỉ đè get() đọc thẳng (kiểm sớm); transaction.get(ref) không đi qua hàm này.
              ref.get = async (...args) => {
                const snapshot = await realGet(...args);
                if (armed) {
                  armed = false;
                  await target.collection('staff_assignments').doc(uid).update({ active: false });
                }
                return snapshot;
              };
            }
            return ref;
          };
          return collection;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function withRace(role, run) {
  const suffix = randomUUID().slice(0, 8);
  const app = initializeApp({ projectId: 'demo-reshare' }, `race-${suffix}`);
  const db = getFirestore(app);
  const uid = `race-staff-${suffix}`;
  const warehouseId = `kho-race-${suffix}`;
  const paths = [];
  const seed = async (path, data) => { paths.push(path); await db.doc(path).set(data); };
  const track = path => paths.push(path);
  const exists = async path => (await db.doc(path).get()).exists;
  const read = async path => (await db.doc(path).get()).data();
  try {
    await seed(`warehouses/${warehouseId}`, { name: 'Kho race', status: 'active' });
    await seed(`staff_assignments/${uid}`, {
      active: true, role, warehouseIds: role === 'system_admin' ? [] : [warehouseId],
    });
    const deps = {
      db: revokeRightAfterPrecheck(db, uid),
      verifyToken: async token => ({ uid: token, email: `${token}@reshare.test` }),
      serverTimestamp: () => FieldValue.serverTimestamp(),
    };
    await run({ suffix, uid, warehouseId, deps, seed, track, exists, read,
      auth: { authorization: `Bearer ${uid}` } });
  } finally {
    const cleanup = await Promise.allSettled(paths.map(path => db.doc(path).delete()));
    await deleteApp(app);
    assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Emulator cleanup must succeed');
  }
}

test('nhập kho: bị thu hồi quyền sau lần kiểm sớm thì không nhập được', { skip }, () =>
  withRace('warehouse_admin', async fx => {
    const donationId = `don-race-in-${fx.suffix}`;
    const receiptId = `rcp_${donationId}`;
    await fx.seed(`donations/${donationId}`, {
      id: donationId, status: 'received', warehouseId: fx.warehouseId, actualReceiptId: receiptId, version: 2,
    });
    await fx.seed(`receipts/${receiptId}`, {
      id: receiptId, donationId, warehouseId: fx.warehouseId, quantity: 2, unitId: 'piece', conditionId: 'good',
    });
    fx.track(`inventory/inv_${receiptId}`);
    const api = createStockIntakeApi(fx.deps);
    const error = await settle(api.handle('POST', `/v1/admin/donations/${donationId}/stock-in`, fx.auth,
      { receiptId, location: 'Kệ A1', note: '', idempotencyKey: `stk_${receiptId}` }));
    assert.equal(await fx.exists(`inventory/inv_${receiptId}`), false, 'không được tạo mục tồn');
    assert.equal((await fx.read(`donations/${donationId}`)).status, 'received');
    assertBlockedByRecheck(error);
  }));

test('xuất kho: bị thu hồi quyền sau lần kiểm sớm thì không xuất được', { skip }, () =>
  withRace('warehouse_admin', async fx => {
    const itemId = `inv-race-${fx.suffix}`;
    const beneficiaryId = `ben-race-${fx.suffix}`;
    await fx.seed(`inventory/${itemId}`, {
      id: itemId, itemName: 'Áo', warehouseId: fx.warehouseId, quantityAvailable: 1, unitId: 'piece', version: 1,
    });
    await fx.seed(`beneficiaries/${beneficiaryId}`, { name: 'Người nhận', warehouseId: fx.warehouseId, status: 'approved' });
    const api = createDistributionApi(fx.deps);
    const error = await settle(api.handle('POST', '/v1/admin/distribution', fx.auth, {
      warehouseId: fx.warehouseId, itemId, beneficiaryId, quantity: 1, handedOver: true,
      expectedVersion: 1, idempotencyKey: `race-out-${fx.suffix}`,
    }));
    const item = await fx.read(`inventory/${itemId}`);
    assert.equal(item.quantityAvailable, 1, 'tồn không được giảm');
    assert.equal(item.version, 1);
    assertBlockedByRecheck(error);
  }));

test('thực nhận: bị thu hồi quyền sau lần kiểm sớm thì không ghi phiếu', { skip }, () =>
  withRace('warehouse_admin', async fx => {
    const donationId = `don-race-rcp-${fx.suffix}`;
    await fx.seed(`donations/${donationId}`, {
      id: donationId, status: 'approved', warehouseId: fx.warehouseId, quantity: 2, version: 2,
    });
    fx.track(`receipts/rcp_${donationId}`);
    const api = createReceiptApi(fx.deps);
    const error = await settle(api.handle('POST', `/v1/admin/donations/${donationId}/receipt`, fx.auth, {
      warehouseId: fx.warehouseId, quantity: 2, unitId: 'piece', conditionId: 'good', note: '',
    }));
    assert.equal(await fx.exists(`receipts/rcp_${donationId}`), false, 'không được tạo phiếu thực nhận');
    assert.equal((await fx.read(`donations/${donationId}`)).status, 'approved');
    assertBlockedByRecheck(error);
  }));

test('thẩm định: bị thu hồi quyền sau lần kiểm sớm thì không ra quyết định', { skip }, () =>
  withRace('warehouse_admin', async fx => {
    const donationId = `don-race-dec-${fx.suffix}`;
    await fx.seed(`donations/${donationId}`, {
      id: donationId, donorId: 'donor', status: 'pending', warehouseId: fx.warehouseId, version: 1,
    });
    fx.track(`donation_reviews/${donationId}`);
    const api = createDonationReviewApi(fx.deps);
    const error = await settle(api.handle('POST', `/v1/admin/donations/${donationId}/decide`, fx.auth,
      { action: 'approve', internalNote: '' }));
    const donation = await fx.read(`donations/${donationId}`);
    assert.equal(donation.status, 'pending', 'không được ghi quyết định — kể cả khi API báo lỗi');
    assert.equal(donation.version, 1);
    assertBlockedByRecheck(error);
  }));

test('xác nhận danh mục: bị thu hồi quyền sau lần kiểm sớm thì không ghi', { skip }, () =>
  withRace('warehouse_admin', async fx => {
    const donationId = `don-race-cat-${fx.suffix}`;
    await fx.seed(`donations/${donationId}`, {
      id: donationId, donorId: 'donor', status: 'pending', warehouseId: fx.warehouseId, version: 1,
    });
    fx.track(`donation_reviews/${donationId}`);
    const api = createDonationReviewApi(fx.deps);
    const error = await settle(api.handle('POST', `/v1/admin/donations/${donationId}/confirm-category`, fx.auth,
      { category: 'books', expectedVersion: 0 }));
    assert.equal(await fx.exists(`donation_reviews/${donationId}`), false,
      'không được ghi danh mục — kể cả khi API báo lỗi');
    assertBlockedByRecheck(error);
  }));

test('phân kho: System Admin bị thu hồi quyền sau lần kiểm sớm thì không phân được', { skip }, () =>
  withRace('system_admin', async fx => {
    const donationId = `don-race-asg-${fx.suffix}`;
    await fx.seed(`donations/${donationId}`, { id: donationId, donorId: 'donor', status: 'pending', version: 1 });
    fx.track(`donation_reviews/${donationId}`);
    const api = createDonationReviewApi(fx.deps);
    const error = await settle(api.handle('POST', `/v1/admin/donations/${donationId}/assign-warehouse`, fx.auth,
      { warehouseId: fx.warehouseId, expectedVersion: 1 }));
    assert.equal(Object.hasOwn(await fx.read(`donations/${donationId}`), 'warehouseId'), false,
      'không được phân kho — kể cả khi API báo lỗi');
    assertBlockedByRecheck(error);
  }));
