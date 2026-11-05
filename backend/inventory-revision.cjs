const { createHash } = require('node:crypto');

// A fingerprint of persisted state survives listener/backend restarts and document recreation.
function inventoryRevision(scope, snapshot) {
  const docs = Array.isArray(snapshot.docs) ? snapshot.docs : snapshot.exists ? [snapshot] : [];
  const values = docs.map(doc => [doc.id || '', doc.data().revision || 0,
    doc.updateTime ? [doc.updateTime.seconds, doc.updateTime.nanoseconds] : null])
    .sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
  return createHash('sha256').update(JSON.stringify([scope, values])).digest('hex');
}

async function readInventoryRevision(db, warehouseId, assignedWarehouseIds) {
  const updates = db.collection('warehouse_inventory_updates');
  if (!warehouseId && Array.isArray(assignedWarehouseIds)) {
    const ids = [...new Set(assignedWarehouseIds)].sort();
    const docs = await Promise.all(ids.map(id => updates.doc(`wh_${id}`).get()));
    return inventoryRevision(`assigned:${ids.join(',')}`, { docs: docs.filter(doc => doc.exists) });
  }
  const scope = warehouseId ? `wh_${warehouseId}` : 'all_warehouses';
  const snapshot = await (warehouseId ? updates.doc(scope) : updates).get();
  return inventoryRevision(scope, snapshot);
}

module.exports = { inventoryRevision, readInventoryRevision };
