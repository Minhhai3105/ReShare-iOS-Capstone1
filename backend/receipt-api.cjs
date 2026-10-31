const { ApiError } = require('./image-api.cjs');
const { runTransaction } = require('./firestore-transaction.cjs');

function createReceiptApi({ db, verifyToken, serverTimestamp }) {
  if (!db || !verifyToken) throw new Error('Receipt API configuration is incomplete');
  const now = serverTimestamp || (() => new Date());

  async function getStaffAssignment(headers) {
    const match = /^Bearer (\S+)$/.exec(headers.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required');
    let claims;
    try {
      claims = await verifyToken(match[1]);
    } catch {
      throw new ApiError(401, 'Invalid session');
    }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session');

    const assignmentDoc = await db.collection('staff_assignments').doc(claims.uid).get();
    if (!assignmentDoc.exists) throw new ApiError(403, 'Staff account not found');
    const data = assignmentDoc.data();
    if (data.active !== true) throw new ApiError(403, 'Staff account is inactive');
    if (!['system_admin', 'warehouse_admin'].includes(data.role)) {
      throw new ApiError(403, 'Permission denied: staff role required');
    }

    return {
      uid: claims.uid,
      email: claims.email || '',
      role: data.role,
      warehouseIds: Array.isArray(data.warehouseIds) ? data.warehouseIds : [],
    };
  }

  function assertWarehouseAccess(staff, targetWarehouseId) {
    if (staff.role === 'system_admin') return;
    if (!targetWarehouseId || !staff.warehouseIds.includes(targetWarehouseId)) {
      throw new ApiError(403, 'Nhân sự không có quyền thao tác tại kho này');
    }
  }

  async function handle(method, path, headers, body) {
    const receiptMatch = /^\/v1\/admin\/donations\/([^/]+)\/receipt$/.exec(path);
    const isPostReceipt = (method === 'POST' && receiptMatch);
    const isGetReceipt = (method === 'GET' && receiptMatch);

    if (isPostReceipt) {
      const donationId = receiptMatch[1];
      if (!donationId || typeof donationId !== 'string') {
        throw new ApiError(400, 'donationId is required');
      }

      const staff = await getStaffAssignment(headers);

      const warehouseId = typeof body?.warehouseId === 'string' ? body.warehouseId.trim() : '';
      if (!warehouseId) {
        throw new ApiError(400, 'warehouseId is required');
      }

      assertWarehouseAccess(staff, warehouseId);

      const quantity = Number(body?.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new ApiError(400, 'Số lượng thực nhận phải lớn hơn 0');
      }

      const unitId = typeof body?.unitId === 'string' ? body.unitId.trim() : '';
      if (!['piece', 'kg', 'bag', 'box', 'set'].includes(unitId)) {
        throw new ApiError(400, 'unitId is required');
      }

      const conditionId = typeof body?.conditionId === 'string' ? body.conditionId.trim() : '';
      if (!['good', 'minor-wear', 'damaged'].includes(conditionId)) {
        throw new ApiError(400, 'conditionId is required');
      }

      const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : '';

      // Deterministic receipt ID prevents duplicate generation upon retries
      const receiptId = `rcp_${donationId}`;
      const receiptRef = db.collection('receipts').doc(receiptId);
      const donationRef = db.collection('donations').doc(donationId);

      const receiptData = await runTransaction(db, async (transaction) => {
        const donationDoc = await transaction.get(donationRef);
        if (!donationDoc.exists) {
          throw new ApiError(404, 'Không tìm thấy đơn quyên góp');
        }

        const donationData = donationDoc.data();
        if (!donationData.warehouseId || donationData.warehouseId !== warehouseId) {
          throw new ApiError(409, 'Đơn quyên góp chưa được phân đúng kho thực nhận');
        }
        assertWarehouseAccess(staff, donationData.warehouseId);

        // Idempotency check: if receipt document already exists
        const existingReceipt = await transaction.get(receiptRef);
        if (existingReceipt.exists) {
          const existingData = existingReceipt.data();
          if (existingData.warehouseId !== warehouseId || existingData.quantity !== quantity ||
              existingData.unitId !== unitId || existingData.conditionId !== conditionId ||
              existingData.note !== note) {
            throw new ApiError(409, 'Phiếu thực nhận đã tồn tại với nội dung khác');
          }
          return {
            ...existingData,
            createdAt: existingData.createdAt?.toDate?.().toISOString() || existingData.createdAt,
            idempotentReplay: true,
          };
        }

        if (donationData.status === 'received' && donationData.actualReceiptId) {
          throw new ApiError(409, 'Đơn quyên góp này đã được tạo phiếu thực nhận trước đó');
        }

        if (donationData.status !== 'approved') {
          throw new ApiError(409, `Chỉ có thể ghi nhận thực nhận cho đơn quyên góp đã được duyệt (approved). Trạng thái hiện tại: ${donationData.status}`);
        }

        const newReceipt = {
          id: receiptId,
          donationId,
          warehouseId,
          quantity,
          unitId,
          conditionId,
          note,
          actorUid: staff.uid,
          actorEmail: staff.email,
          createdAt: now(),
        };

        transaction.set(receiptRef, newReceipt);

        transaction.update(donationRef, {
          status: 'received',
          actualReceiptId: receiptId,
          receivedAt: now(),
          receivedWarehouseId: warehouseId,
          actualQuantity: quantity,
          actualUnitId: unitId,
          actualConditionId: conditionId,
        });

        // INVARIANT (AC5): Inventory count is NOT modified at this intake step.

        return {
          id: receiptId,
          donationId,
          warehouseId,
          quantity,
          unitId,
          conditionId,
          note,
          actorUid: staff.uid,
          actorEmail: staff.email,
          createdAt: new Date().toISOString(),
        };
      });

      return {
        status: 201,
        body: {
          success: true,
          receipt: receiptData,
        },
      };
    }

    if (isGetReceipt) {
      const donationId = receiptMatch[1];
      const staff = await getStaffAssignment(headers);
      const receiptDoc = await db.collection('receipts').doc(`rcp_${donationId}`).get();
      if (!receiptDoc.exists) throw new ApiError(404, 'Phiếu thực nhận không tồn tại');
      const data = receiptDoc.data();
      assertWarehouseAccess(staff, data.warehouseId);
      return {
        status: 200,
        body: {
          receipt: {
            ...data,
            createdAt: data.createdAt?.toDate?.().toISOString() || data.createdAt,
          },
        },
      };
    }

    throw new ApiError(404, 'Not found');
  }

  return { handle };
}

module.exports = { createReceiptApi };
