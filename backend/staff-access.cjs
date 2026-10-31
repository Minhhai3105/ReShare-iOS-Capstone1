const { ApiError } = require('./image-api.cjs');

// Lần đọc staff_assignments trước transaction chỉ là kiểm sớm để trả lỗi nhanh. Thứ quyết định
// là lần đọc lại ngay trong transaction: document phân quyền vào read set, nên nếu nó bị thu hồi
// trước lúc commit thì transaction phải chạy lại và thấy quyền mới. Không còn khe để một nhân sự
// vừa bị thu hồi quyền vẫn ghi xong bằng quyền cũ.
//
// Gọi sau khi đã biết kho của bản ghi và trước mọi write của transaction.
async function assertCurrentStaffAccess(transaction, db, uid, { warehouseId, systemOnly = false } = {}) {
  const doc = await transaction.get(db.collection('staff_assignments').doc(uid));
  const data = doc.exists ? doc.data() : null;
  const role = data?.role;
  const inScope = role === 'system_admin' ||
    (typeof warehouseId === 'string' && Array.isArray(data?.warehouseIds) && data.warehouseIds.includes(warehouseId));
  if (data?.active !== true || !['system_admin', 'warehouse_admin'].includes(role) ||
      (systemOnly && role !== 'system_admin') || !inScope) {
    throw new ApiError(403, 'Staff access changed; reload session', 'STAFF_ACCESS_CHANGED');
  }
}

module.exports = { assertCurrentStaffAccess };
