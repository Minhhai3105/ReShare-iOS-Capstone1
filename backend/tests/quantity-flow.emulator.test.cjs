const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createReceiptApi } = require('../receipt-api.cjs');
const { createStockIntakeApi } = require('../stock-intake-api.cjs');
const { createDistributionApi } = require('../distribution-api.cjs');

test('BR01/BR02: receive, stock and fully distribute kg exactly; damaged goods never create available stock',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
    const app = initializeApp({ projectId: 'demo-reshare' }, `quantity-${Date.now()}`);
    const db = getFirestore(app);
    const id = `q${Date.now()}`;
    const uid = `${id}-staff`, warehouseId = `${id}-warehouse`, beneficiaryId = `${id}-beneficiary`;
    const donationId = `${id}-donation`, damagedId = `${id}-damaged`;
    const paths = [`staff_assignments/${uid}`, `warehouses/${warehouseId}`, `beneficiaries/${beneficiaryId}`,
      `donations/${donationId}`, `donations/${damagedId}`];
    const cfg = { db, verifyToken: async token => { if (token !== 'test') throw new Error('bad token'); return { uid }; }, serverTimestamp: () => FieldValue.serverTimestamp() };
    const headers = { authorization: 'Bearer test' };
    try {
      await Promise.all([
        db.doc(paths[0]).set({ uid, role: 'system_admin', active: true, warehouseIds: [] }),
        db.doc(paths[1]).set({ status: 'active', name: 'Test warehouse' }),
        db.doc(paths[2]).set({ warehouseId, status: 'approved', name: 'Test beneficiary' }),
        ...[donationId, damagedId].map(id => db.doc(`donations/${id}`).set({ id, donorId: 'test-donor', status: 'approved', warehouseId, title: 'Test lot', category: 'household' })),
      ]);
      const receipts = createReceiptApi(cfg), stock = createStockIntakeApi(cfg), distribution = createDistributionApi(cfg);
      await assert.rejects(receipts.handle('POST', `/v1/admin/donations/${donationId}/receipt`, headers,
        { warehouseId, quantity: 1.125, unitId: 'piece', conditionId: 'good' }), { status: 400 });
      await assert.rejects(receipts.handle('POST', `/v1/admin/donations/${donationId}/receipt`, headers,
        { warehouseId, quantity: 1.0001, unitId: 'kg', conditionId: 'good' }), { status: 400 });
      await receipts.handle('POST', `/v1/admin/donations/${donationId}/receipt`, headers,
        { warehouseId, quantity: 1.125, unitId: 'kg', conditionId: 'good' });
      const receiptId = `rcp_${donationId}`, itemId = `inv_${receiptId}`;
      await stock.handle('POST', `/v1/admin/donations/${donationId}/stock-in`, headers, { receiptId, idempotencyKey: `stk_${receiptId}`, location: 'A1', note: '' });
      for (const [quantity, expectedVersion] of [[0.125, 1], [1, 2]]) {
        const result = await distribution.handle('POST', '/v1/admin/distribution', headers,
          { warehouseId, itemId, beneficiaryId, quantity, handedOver: true, expectedVersion, idempotencyKey: `${id}-export-${expectedVersion}` });
        paths.push(`distribution_vouchers/${result.body.voucher.id}`, `inventory_movements/${result.body.voucher.movementId}`);
      }
      const lot = (await db.doc(`inventory/${itemId}`).get()).data();
      assert.equal(lot.quantityAvailable, 0);
      assert.equal(lot.quantityDistributed, 1.125);
      assert.equal((await db.doc(`warehouse_inventory_updates/wh_${warehouseId}`).get()).data().revision, 3);
      assert.equal((await db.doc(`donations/${donationId}`).get()).data().status, 'distributed');
      assert.equal((await db.doc(`donations/${donationId}`).get()).data().beneficiaryId, undefined);
      await receipts.handle('POST', `/v1/admin/donations/${damagedId}/receipt`, headers,
        { warehouseId, quantity: 1, unitId: 'piece', conditionId: 'damaged' });
      await assert.rejects(stock.handle('POST', `/v1/admin/donations/${damagedId}/stock-in`, headers,
        { receiptId: `rcp_${damagedId}`, idempotencyKey: `stk_rcp_${damagedId}`, location: 'A2', note: '' }), { status: 409 });
      assert.equal((await db.doc(`inventory/inv_rcp_${damagedId}`).get()).exists, false);
      assert.equal((await db.doc(`donations/${damagedId}`).get()).data().status, 'received');
    } finally {
      for (const id of [donationId, damagedId]) paths.push(`receipts/rcp_${id}`, `stock_entries/ste_rcp_${id}`, `inventory/inv_rcp_${id}`, `inventory_movements/mov_in_rcp_${id}`);
      paths.push(`warehouse_inventory_updates/wh_${warehouseId}`);
      await Promise.allSettled(paths.map(path => db.doc(path).delete()));
      await deleteApp(app);
    }
  });
