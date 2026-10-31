const { ApiError } = require('./image-api.cjs');
const dateString = value => value?.toDate?.().toISOString() ||
  (value instanceof Date ? value.toISOString() : value || null);

function createStockIntakeApi({ db, verifyToken, serverTimestamp }) {
  if (!db || !verifyToken) throw new Error('Stock intake API configuration is incomplete');
  const now = serverTimestamp || (() => new Date());

  async function staffFrom(headers) {
    const match = /^Bearer (\S+)$/.exec(headers.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try { claims = await verifyToken(match[1]); }
    catch { throw new ApiError(401, 'Invalid session'); }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');
    const doc = await db.collection('staff_assignments').doc(claims.uid).get();
    if (!doc.exists || doc.data().active !== true) throw new ApiError(403, 'Active staff assignment required');
    const { role, warehouseIds } = doc.data();
    if (!['system_admin', 'warehouse_admin'].includes(role)) throw new ApiError(403, 'Staff role required');
    return { uid: claims.uid, email: claims.email || '', role, warehouseIds: Array.isArray(warehouseIds) ? warehouseIds : [] };
  }

  function assertWarehouse(staff, warehouseId) {
    if (!warehouseId || (staff.role === 'warehouse_admin' && !staff.warehouseIds.includes(warehouseId))) {
      throw new ApiError(403, 'Warehouse access denied');
    }
  }

  async function readEntry(entryId, staff) {
    const doc = await db.collection('stock_entries').doc(entryId).get();
    if (!doc.exists) throw new ApiError(404, 'Stock entry not found');
    const entry = doc.data();
    assertWarehouse(staff, entry.warehouseId);
    const movementDoc = await db.collection('inventory_movements').doc(entry.movementId).get();
    if (!movementDoc.exists) throw new ApiError(409, 'Stock entry movement is missing');
    const movement = movementDoc.data();
    return {
      ...entry, createdAt: dateString(entry.createdAt), confirmedAt: dateString(entry.confirmedAt),
      movement: { ...movement, createdAt: dateString(movement.createdAt) },
    };
  }

  async function handle(method, path, headers, body) {
    const match = /^\/v1\/admin\/donations\/([^/]+)\/stock-in$/.exec(path);
    const readMatch = /^\/v1\/admin\/stock-entries\/([^/]+)$/.exec(path);
    if (!((method === 'POST' && match) || (method === 'GET' && readMatch))) throw new ApiError(404, 'Not found');
    const staff = await staffFrom(headers);
    if (readMatch) {
      if (!/^ste_rcp_[A-Za-z0-9_-]{1,120}$/.test(readMatch[1])) throw new ApiError(400, 'Invalid stock entry ID');
      return { status: 200, body: { stockEntry: await readEntry(readMatch[1], staff) } };
    }
    const donationId = match[1];
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(donationId)) throw new ApiError(400, 'Invalid donation ID');
    const receiptId = `rcp_${donationId}`;
    const location = typeof body?.location === 'string' ? body.location.trim() : '';
    const note = typeof body?.note === 'string' ? body.note.trim() : '';
    if (body?.receiptId !== receiptId || body?.idempotencyKey !== `stk_${receiptId}` ||
        !location || location.length > 120 || note.length > 300) {
      throw new ApiError(400, 'Invalid receipt reference, location, note or idempotency key');
    }
    const receiptRef = db.collection('receipts').doc(receiptId);
    const entryRef = db.collection('stock_entries').doc(`ste_${receiptId}`);
    const inventoryRef = db.collection('inventory').doc(`inv_${receiptId}`);
    const movementRef = db.collection('inventory_movements').doc(`mov_in_${receiptId}`);
    const replayed = await db.runTransaction(async tx => {
      const [receiptDoc, donationDoc, entryDoc, inventoryDoc, movementDoc] = await Promise.all([
        tx.get(receiptRef), tx.get(db.collection('donations').doc(donationId)),
        tx.get(entryRef), tx.get(inventoryRef), tx.get(movementRef),
      ]);
      if (!receiptDoc.exists || !donationDoc.exists) throw new ApiError(404, 'Receipt or donation not found');
      const receipt = receiptDoc.data();
      const warehouseId = receipt.warehouseId;
      assertWarehouse(staff, warehouseId);
      const donation = donationDoc.data();
      if (receipt.id !== receiptId || receipt.donationId !== donationId ||
          donation.actualReceiptId !== receiptId || donation.warehouseId !== warehouseId ||
          typeof receipt.quantity !== 'number' || !Number.isFinite(receipt.quantity) || receipt.quantity <= 0 ||
          !receipt.unitId) {
        throw new ApiError(409, 'Receipt is not eligible for stock intake');
      }
      if (receipt.stockEntryId || entryDoc.exists || inventoryDoc.exists || movementDoc.exists) {
        if (receipt.stockEntryId === entryRef.id && donation.stockEntryId === entryRef.id &&
            entryDoc.exists && inventoryDoc.exists && movementDoc.exists) {
          const existing = entryDoc.data();
          if (existing.location !== location || existing.note !== note) {
            throw new ApiError(409, 'Receipt was stocked with different details');
          }
          return true;
        }
        throw new ApiError(409, 'Stock intake data is inconsistent');
      }
      if (donation.status !== 'received') throw new ApiError(409, 'Donation is not ready for stock intake');
      const timestamp = now();
      tx.set(inventoryRef, {
        id: inventoryRef.id, receiptId, donationId: receipt.donationId, warehouseId,
        itemName: donation.title || '', category: donation.category || '',
        conditionId: receipt.conditionId || '', unitId: receipt.unitId,
        quantityReceived: receipt.quantity, quantityAvailable: receipt.quantity,
        location, stockEntryId: entryRef.id, createdAt: timestamp, updatedAt: timestamp,
      });
      tx.set(movementRef, {
        id: movementRef.id, type: 'stock_in', quantity: receipt.quantity, unitId: receipt.unitId,
        inventoryItemId: inventoryRef.id, stockEntryId: entryRef.id, receiptId, donationId,
        warehouseId, actorUid: staff.uid, actorEmail: staff.email, createdAt: timestamp,
      });
      tx.set(entryRef, {
        id: entryRef.id, status: 'confirmed', receiptId, donationId, warehouseId,
        location, note, movementId: movementRef.id,
        createdByUid: staff.uid, createdByEmail: staff.email,
        confirmedByUid: staff.uid, confirmedByEmail: staff.email,
        createdAt: timestamp, confirmedAt: timestamp,
        items: [{ id: inventoryRef.id, itemName: donation.title || '', quantity: receipt.quantity,
          unitId: receipt.unitId, conditionId: receipt.conditionId || '', location }],
      });
      tx.update(receiptRef, {
        stockEntryId: entryRef.id, stockedAt: timestamp, stockedByUid: staff.uid,
      });
      tx.update(db.collection('donations').doc(donationId), {
        status: 'in_stock', stockEntryId: entryRef.id, version: (donation.version || 1) + 1,
      });
      return false;
    });
    return { status: replayed ? 200 : 201, body: {
      stockEntry: await readEntry(entryRef.id, staff), idempotentReplay: replayed,
    } };
  }

  return { handle };
}

module.exports = { createStockIntakeApi };
