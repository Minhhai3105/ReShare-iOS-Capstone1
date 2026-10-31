import test from 'node:test';
import assert from 'node:assert/strict';
import {
  errorFromResponse,
  STOCK_IN_ERROR,
  toDonation,
  toReceipt,
  toStockEntry,
  toStockInBody,
  toStockInResult,
} from '../src/admin/stockin/stockin.mapper.js';

test('US13 AC1: stock-in body carries only the receipt reference, never a client quantity or warehouse', () => {
  const body = toStockInBody({
    donationId: 'DON-1',
    receiptId: 'rcp_DON-1',
    warehouseId: 'wh-1',
    quantity: 99,
    unitId: 'piece',
    location: 'Kệ A1-02',
    note: '',
    idempotencyKey: 'stk_rcp_DON-1',
  });
  assert.deepEqual(body, { receiptId: 'rcp_DON-1', location: 'Kệ A1-02', note: '', idempotencyKey: 'stk_rcp_DON-1' });
});

test('US13 AC1: declared quantity and received quantity are kept apart', () => {
  const donation = toDonation({ id: 'DON-1', status: 'received', quantity: 5, unitName: 'chiếc' });
  const receipt = toReceipt({ id: 'rcp_DON-1', quantity: 3, unitId: 'piece' });
  assert.equal(donation.declaredQuantity, 5);
  assert.equal(receipt.quantity, 3);
});

test('US13 AC2: an idempotent replay is reported as replayed, a new entry is not', () => {
  assert.deepEqual(toStockInResult({ stockEntry: { id: 'PNK-1' }, idempotentReplay: true }), { id: 'PNK-1', replayed: true });
  assert.deepEqual(toStockInResult({ stockEntry: { id: 'PNK-1' } }), { id: 'PNK-1', replayed: false });
});

test('US13 AC2: a receipt that already has a stock entry exposes its id', () => {
  assert.equal(toReceipt({ id: 'rcp_DON-1', stockEntryId: 'PNK-1' }).stockEntryId, 'PNK-1');
  assert.equal(toReceipt({ id: 'rcp_DON-1' }).stockEntryId, '');
});

test('US13 AC3: a 409 with the existing entry is a conflict that carries that entry', () => {
  const error = errorFromResponse(409, {
    message: 'Receipt already stocked in',
    stockEntryId: 'PNK-1',
    processedByEmail: 'staff@example.test',
    processedAt: '2026-10-28T03:00:00.000Z',
  });
  assert.equal(error.kind, STOCK_IN_ERROR.conflict);
  assert.equal(error.status, 409);
  assert.deepEqual(error.existingEntry, { id: 'PNK-1', processedBy: 'staff@example.test', processedAt: '2026-10-28T03:00:00.000Z' });
  assert.equal(errorFromResponse(409, { message: 'stale' }).existingEntry, null);
});

test('US13: error statuses are sorted into the kinds the screen handles', () => {
  assert.equal(errorFromResponse(400, {}).kind, STOCK_IN_ERROR.validation);
  assert.equal(errorFromResponse(401, {}).kind, STOCK_IN_ERROR.auth);
  assert.equal(errorFromResponse(403, {}).kind, STOCK_IN_ERROR.forbidden);
  assert.equal(errorFromResponse(404, {}).kind, STOCK_IN_ERROR.notFound);
  for (const status of [408, 429, 500, 503]) assert.equal(errorFromResponse(status, {}).kind, STOCK_IN_ERROR.retryable);
  assert.equal(errorFromResponse(422, {}).kind, STOCK_IN_ERROR.other);
});

test('US13 AC4: the stock entry maps its movement back to the receipt and donation', () => {
  const entry = toStockEntry({
    id: 'PNK-1',
    donationId: 'DON-1',
    receiptId: 'rcp_DON-1',
    warehouseId: 'wh-1',
    movement: {
      id: 'MV-1', type: 'stock_in', quantity: 3, unitId: 'piece', warehouseName: 'Kho A',
      receiptId: 'rcp_DON-1', actorEmail: 'staff@example.test', createdAt: '2026-10-28T03:00:00.000Z',
    },
  });
  assert.equal(entry.donationId, 'DON-1');
  assert.equal(entry.receiptId, 'rcp_DON-1');
  assert.deepEqual(entry.movement, {
    id: 'MV-1', typeName: 'Nhập kho', quantity: 3, unitName: 'chiếc', warehouseName: 'Kho A',
    receiptId: 'rcp_DON-1', actor: 'staff@example.test', createdAt: '2026-10-28T03:00:00.000Z',
  });
  assert.equal(toStockEntry({ id: 'PNK-2' }).movement, null);
});
