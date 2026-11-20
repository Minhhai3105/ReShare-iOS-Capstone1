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

async function requireSystemAdmin(db, verifyToken, headers) {
  const match = /^Bearer (\S+)$/.exec(headers?.authorization || '');
  if (!match) throw new ApiError(401, 'Sign in required');
  let claims;
  try { claims = await verifyToken(match[1]); }
  catch { throw new ApiError(401, 'Invalid session'); }
  if (!claims?.uid) throw new ApiError(401, 'Invalid session');
  const assignment = (await db.collection('staff_assignments').doc(claims.uid).get()).data();
  if (assignment?.active !== true || assignment.role !== 'system_admin') {
    throw new ApiError(403, 'System Admin access required', 'SYSTEM_ADMIN_REQUIRED');
  }
  return { uid: claims.uid };
}

module.exports = { assertCurrentStaffAccess, requireSystemAdmin };
