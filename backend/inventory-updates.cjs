const { FieldValue } = require('firebase-admin/firestore');

function recordInventoryUpdate(tx, db, warehouseId, timestamp) {
  const update = { revision: FieldValue.increment(1), updatedAt: timestamp };
  tx.set(db.collection('warehouse_inventory_updates').doc(`wh_${warehouseId}`), update, { merge: true });
}

module.exports = { recordInventoryUpdate };
