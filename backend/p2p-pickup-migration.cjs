const { FieldValue } = require('firebase-admin/firestore');

// Chuyển địa chỉ nhận đồ P2P khỏi dữ liệu ai cũng đọc được:
// - catalog_items.pickupAddress → catalog_items/{id}/private/pickup (chỉ người đăng + người đang giữ đồ đọc);
// - catalog_items.pickupTime bị bỏ (giờ hẹn đã nằm trong hội thoại, chỉ 2 bên đọc);
// - conversations.itemPickupAddress bị bỏ (người nhắn tin chưa được giữ đồ không giữ bản sao địa chỉ).
const PUBLIC_FIELDS = ['pickupAddress', 'pickupTime'];
const MAX_ADDRESS = 200;
// Mỗi món đồ tối đa 2 thao tác; dừng ở 400 để không bao giờ vượt giới hạn 500 của một batch.
const BATCH_LIMIT = 400;

/** Kế hoạch cho một món đồ, không đụng Firestore để test được. */
function planItem(data, privateExists) {
  const address = typeof data.pickupAddress === 'string' ? data.pickupAddress.trim().slice(0, MAX_ADDRESS) : '';
  return {
    // Đã có document riêng (người đăng có thể đã sửa sau này) thì giữ nguyên, chỉ xoá bản công khai.
    createPrivate: address && !privateExists ? { pickupAddress: address } : null,
    removePublic: PUBLIC_FIELDS.filter(field => Object.hasOwn(data, field)),
  };
}

/**
 * Mặc định chỉ chạy thử và trả số lượng (không in địa chỉ). `apply: true` bắt buộc có `backup`
 * — hàm nhận bản gốc trước khi ghi, để khôi phục được nếu cần.
 */
async function migrateP2pPickup(db, { apply = false, backup } = {}) {
  const [items, conversations] = await Promise.all([
    db.collection('catalog_items').get(), db.collection('conversations').get(),
  ]);
  const itemPlans = [];
  for (const doc of items.docs) {
    const data = doc.data();
    if (!PUBLIC_FIELDS.some(field => Object.hasOwn(data, field))) continue;
    const privateRef = doc.ref.collection('private').doc('pickup');
    const plan = planItem(data, (await privateRef.get()).exists);
    itemPlans.push({ ...plan, ref: doc.ref, privateRef, itemId: doc.id,
      original: Object.fromEntries(plan.removePublic.map(field => [field, data[field]])) });
  }
  const conversationPlans = conversations.docs
    .filter(doc => Object.hasOwn(doc.data(), 'itemPickupAddress'))
    .map(doc => ({ ref: doc.ref, id: doc.id, original: doc.data().itemPickupAddress }));
  const summary = {
    itemsWithPublicFields: itemPlans.length,
    privateDocsToCreate: itemPlans.filter(plan => plan.createPrivate).length,
    conversationsToClean: conversationPlans.length,
  };
  if (!apply) return { ...summary, applied: false };
  if (typeof backup !== 'function') throw new Error('backup is required when applying the migration');

  await backup({
    items: itemPlans.map(({ itemId, original }) => ({ itemId, ...original })),
    conversations: conversationPlans.map(({ id, original }) => ({ id, itemPickupAddress: original })),
  });
  let batch = db.batch();
  let operations = 0;
  const flush = async () => {
    if (!operations) return;
    await batch.commit();
    batch = db.batch();
    operations = 0;
  };
  // Ghi document riêng và xoá bản công khai của cùng món đồ trong cùng batch, nên không có lúc mất địa chỉ.
  for (const plan of itemPlans) {
    if (plan.createPrivate) {
      batch.set(plan.privateRef, plan.createPrivate);
      operations += 1;
    }
    batch.update(plan.ref, Object.fromEntries(plan.removePublic.map(field => [field, FieldValue.delete()])));
    operations += 1;
    if (operations >= BATCH_LIMIT) await flush();
  }
  for (const plan of conversationPlans) {
    batch.update(plan.ref, { itemPickupAddress: FieldValue.delete() });
    operations += 1;
    if (operations >= BATCH_LIMIT) await flush();
  }
  await flush();
  return { ...summary, applied: true };
}

module.exports = { planItem, migrateP2pPickup };
