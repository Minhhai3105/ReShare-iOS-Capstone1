const { ApiError } = require('./image-api.cjs');
const { createHash } = require('node:crypto');
const { runTransaction } = require('./firestore-transaction.cjs');
const { assertCurrentStaffAccess } = require('./staff-access.cjs');
const { DEFAULT_MAX_DOCS, readUnion, readInStock } = require('./bounded-reads.cjs');

function createDistributionApi({ db, verifyToken, serverTimestamp, maxDocs = DEFAULT_MAX_DOCS }) {
  if (!db || !verifyToken) throw new Error('Distribution API configuration is incomplete');
  const now = serverTimestamp || (() => new Date());

  async function getStaffAssignment(headers) {
    const match = /^Bearer (\S+)$/.exec(headers?.authorization || '');
    if (!match) throw new ApiError(401, 'Sign in required', 'UNAUTHENTICATED');
    let claims;
    try {
      claims = await verifyToken(match[1]);
    } catch {
      throw new ApiError(401, 'Invalid session', 'UNAUTHENTICATED');
    }
    if (!claims?.uid) throw new ApiError(401, 'Invalid session', 'UNAUTHENTICATED');

    const assignmentDoc = await db.collection('staff_assignments').doc(claims.uid).get();
    if (!assignmentDoc.exists) throw new ApiError(403, 'Staff account not found', 'FORBIDDEN');
    const data = assignmentDoc.data();
    if (data.active !== true) throw new ApiError(403, 'Staff account is inactive', 'FORBIDDEN');
    if (!['system_admin', 'warehouse_admin'].includes(data.role)) {
      throw new ApiError(403, 'Permission denied: staff role required', 'FORBIDDEN');
    }

    return {
      uid: claims.uid,
      email: claims.email || '',
      displayName: claims.name || claims.displayName || data.displayName || claims.email || '',
      role: data.role,
      warehouseIds: Array.isArray(data.warehouseIds) ? data.warehouseIds : [],
    };
  }

  function assertWarehouseAccess(staff, targetWarehouseId) {
    if (staff.role === 'system_admin') return;
    if (!targetWarehouseId || !staff.warehouseIds.includes(targetWarehouseId)) {
      throw new ApiError(403, 'Bạn không có quyền phân phối tại kho này.', 'FORBIDDEN');
    }
  }

  function isAllowedWarehouse(staff, warehouseId) {
    if (staff.role === 'system_admin') return true;
    return staff.warehouseIds.includes(warehouseId);
  }

  // Đếm số đã thực sự trao của một mục tồn và quyết định donation nguồn đã trao xong chưa.
  // Chỉ gồm read, nên phải gọi trước mọi write của transaction xuất kho.
  async function readDonationProgress(transaction, { itemId, itemData, warehouseId, unit, currentAvailable, quantity }) {
    const donationId = typeof itemData.donationId === 'string' &&
      /^[A-Za-z0-9_-]{1,120}$/.test(itemData.donationId) ? itemData.donationId : null;
    // Mục tồn không gắn donation (hàng nhập ngoài luồng quyên góp, dữ liệu kiểu cũ) thì không có
    // donor nào để báo: không đếm, không đối soát, không gắn cờ — giữ nguyên hành vi cũ, tránh
    // gắn nhãn "cần kiểm tra" lên mọi mục tồn không phải từ quyên góp.
    if (!donationId) return { quantityDistributed: null, issue: null };

    const received = itemData.quantityReceived;
    let distributedBefore = null;
    let issue = null;

    if (Number.isSafeInteger(itemData.quantityDistributed) && itemData.quantityDistributed >= 0) {
      distributedBefore = itemData.quantityDistributed;
    } else {
      // Mục tồn cũ chưa có bộ đếm: cộng lại từ movement xuất phân phối. Không suy từ
      // quantityReceived − quantityAvailable, vì phép trừ đó tính cả hàng hỏng/điều chỉnh
      // thành hàng đã trao.
      const movements = await transaction.get(db.collection('inventory_movements')
        .where('inventoryItemId', '==', itemId).where('type', '==', 'distribution'));
      let sum = 0;
      const valid = movements.docs.every(doc => {
        const movement = doc.data();
        if (movement.warehouseId !== warehouseId || movement.unitId !== unit ||
            !Number.isSafeInteger(movement.quantity) || movement.quantity >= 0) return false;
        sum -= movement.quantity;
        return true;
      });
      // Đối soát chéo với tồn: hiện chỉ nhập kho đặt và xuất kho giảm tồn, nên nhận − đã xuất
      // phải đúng bằng tồn còn lại. Lệch nghĩa là có biến động không ghi sổ — không đoán.
      if (valid && Number.isSafeInteger(received) && received - sum === currentAvailable) {
        distributedBefore = sum;
      } else {
        issue = 'LEGACY_DISTRIBUTION_UNRECONCILED';
      }
    }

    const quantityDistributed = distributedBefore === null ? null : distributedBefore + quantity;
    if (quantityDistributed !== null && Number.isSafeInteger(received) && quantityDistributed > received) {
      return { quantityDistributed: null, issue: 'DISTRIBUTED_EXCEEDS_RECEIVED' };
    }
    const fullyDistributed = quantityDistributed !== null && Number.isSafeInteger(received) &&
      received > 0 && quantityDistributed === received;
    if (!fullyDistributed) return { quantityDistributed, issue };

    // Trước khi báo donor "đã trao tặng", đối chiếu chuỗi nguồn: donation ↔ phiếu thực nhận
    // ↔ phiếu nhập kho ↔ mục tồn phải trỏ về nhau, cùng kho, cùng số lượng. Lệch thì không đụng
    // donation, vì ghi nhầm trạng thái cho đơn khác còn tệ hơn chưa ghi.
    const receiptId = typeof itemData.receiptId === 'string' &&
      /^[A-Za-z0-9_-]{1,128}$/.test(itemData.receiptId) ? itemData.receiptId : null;
    const donationRef = db.collection('donations').doc(donationId);
    const [donationDoc, receiptDoc] = await Promise.all([
      transaction.get(donationRef),
      receiptId ? transaction.get(db.collection('receipts').doc(receiptId)) : Promise.resolve(null),
    ]);
    const donation = donationDoc.exists ? donationDoc.data() : null;
    const receipt = receiptDoc?.exists ? receiptDoc.data() : null;
    const linked = Boolean(donation && receipt && itemData.stockEntryId &&
      donation.warehouseId === warehouseId && receipt.warehouseId === warehouseId &&
      donation.actualReceiptId === receiptId && receipt.donationId === donationId &&
      donation.stockEntryId === itemData.stockEntryId && receipt.stockEntryId === itemData.stockEntryId &&
      receipt.quantity === received);
    if (!linked) return { quantityDistributed, issue: 'DONATION_LINK_MISMATCH' };
    if (donation.status !== 'in_stock') return { quantityDistributed, issue: 'DONATION_STATUS_UNEXPECTED' };
    return { quantityDistributed, issue, donationRef, donationVersion: donation.version || 1 };
  }

  // Contract dùng chung cho mọi module: path là pathname, query ở tham số thứ 5.
  // new URL(requestUrl || path) chịu được cả hai dạng nên không vỡ nếu ai gọi kiểu cũ.
  async function handle(method, path, headers, body, requestUrl = '') {
    const url = new URL(requestUrl || path, 'http://localhost');
    const pathname = url.pathname;
    const isOptions = method === 'GET' && (pathname === '/v1/admin/distribution/options' || pathname === '/v1/admin/distribution');
    const isPostDistribution = method === 'POST' && pathname === '/v1/admin/distribution';

    if (isOptions) {
      const staff = await getStaffAssignment(headers);
      const queryWarehouseId = url.searchParams.get('warehouseId');
      if (queryWarehouseId) {
        assertWarehouseAccess(staff, queryWarehouseId);
      }

      // 1. Fetch Warehouses
      const warehousesSnap = await db.collection('warehouses').get();
      const allWarehouses = warehousesSnap.docs.map(doc => {
        const d = doc.data();
        return { id: doc.id, name: d.name || doc.id, status: d.status || 'active' };
      }).filter(w => w.status === 'active' && isAllowedWarehouse(staff, w.id));

      const allowedIds = new Set(queryWarehouseId ? [queryWarehouseId] : allWarehouses.map(w => w.id));

      // 2. Fetch Inventory — chỉ mục còn tồn: mục đã xuất hết không chọn để xuất được nữa,
      // nên không cần quét cả lịch sử nhập kho mỗi lần mở biểu mẫu.
      const inventoryDocs = await readInStock(db, maxDocs, 'Có quá nhiều mục tồn để hiển thị trong một biểu mẫu xuất kho.');
      const inventory = inventoryDocs
        .map(doc => {
          const d = doc.data();
          const currentAvailable = typeof d.quantityAvailable === 'number'
            ? d.quantityAvailable
            : typeof d.available === 'number'
              ? d.available
              : 0;
          const unit = d.unitId || d.unit || 'chiếc';
          return {
            id: doc.id,
            name: d.itemName || d.name || '',
            warehouseId: d.warehouseId || '',
            categoryId: d.category || d.categoryId || 'other',
            available: currentAvailable,
            quantityAvailable: currentAvailable,
            unit,
            unitId: unit,
            location: d.location || '',
            sourceReceipt: d.sourceReceipt || d.receiptId || '',
            version: typeof d.version === 'number' ? d.version : 1,
          };
        })
        .filter(item => allowedIds.has(item.warehouseId));

      // 3. Fetch Beneficiaries — chỉ hồ sơ đã duyệt (dữ liệu cũ đánh dấu bằng approved: true).
      const beneficiaries = (await readUnion([
        db.collection('beneficiaries').where('status', '==', 'approved'),
        db.collection('beneficiaries').where('approved', '==', true),
      ], maxDocs, 'Có quá nhiều người thụ hưởng đã duyệt để hiển thị trong một biểu mẫu xuất kho.'))
        .map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name || '',
            warehouseId: d.warehouseId || '',
            area: d.area || '',
            approved: d.approved === true || d.status === 'approved',
          };
        })
        .filter(b => allowedIds.has(b.warehouseId) && b.approved);

      return {
        status: 200,
        body: {
          warehouses: allWarehouses.filter(w => allowedIds.has(w.id)),
          inventory,
          beneficiaries,
        },
      };
    }

    if (isPostDistribution) {
      const staff = await getStaffAssignment(headers);
      const warehouseId = typeof body?.warehouseId === 'string' ? body.warehouseId.trim() : '';
      if (!warehouseId) {
        throw new ApiError(400, 'warehouseId is required', 'VALIDATION', { errors: { warehouseId: 'Chọn kho thao tác.' } });
      }
      assertWarehouseAccess(staff, warehouseId);

      const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : '';
      if (!itemId) {
        throw new ApiError(400, 'itemId is required', 'VALIDATION', { errors: { item: 'Chọn vật phẩm trong kho được phân công.' } });
      }

      const beneficiaryId = typeof body?.beneficiaryId === 'string' ? body.beneficiaryId.trim() : '';
      if (!beneficiaryId) {
        throw new ApiError(400, 'beneficiaryId is required', 'VALIDATION', { errors: { beneficiaryId: 'Chọn người thụ hưởng đã duyệt thuộc phạm vi kho.' } });
      }

      const rawQuantity = body?.quantity;
      const quantity = Number(rawQuantity);
      if (!/^\d+$/.test(String(rawQuantity || '')) || !Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new ApiError(400, 'Số lượng phải là số nguyên dương.', 'VALIDATION', { errors: { quantity: 'Số lượng phải là số nguyên dương.' } });
      }

      if (body?.handedOver !== true) {
        throw new ApiError(400, 'Cần xác nhận đã bàn giao thực tế.', 'VALIDATION', { errors: { handedOver: 'Cần xác nhận đã bàn giao thực tế.' } });
      }

      const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : '';
      const expectedVersion = body?.expectedVersion;
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
        throw new ApiError(400, 'expectedVersion is required', 'VALIDATION');
      }
      const idempotencyKey = body?.idempotencyKey;
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
        throw new ApiError(400, 'idempotencyKey is required', 'VALIDATION');
      }
      const suffix = createHash('sha256').update(`${staff.uid}:${idempotencyKey}`).digest('hex').slice(0, 32).toUpperCase();
      const voucherId = `PX-${suffix}`;
      const movementId = `MOV-${suffix}`;
      const requestFingerprint = createHash('sha256').update(JSON.stringify({
        actorUid: staff.uid, warehouseId, itemId, beneficiaryId, quantity, note, expectedVersion,
      })).digest('hex');

      const warehouseRef = db.collection('warehouses').doc(warehouseId);
      const inventoryRef = db.collection('inventory').doc(itemId);
      const beneficiaryRef = db.collection('beneficiaries').doc(beneficiaryId);
      const voucherRef = db.collection('distribution_vouchers').doc(voucherId);
      const movementRef = db.collection('inventory_movements').doc(movementId);

      const result = await runTransaction(db, async (transaction) => {
        // Kho đã biết từ body nên kiểm ngay đầu, phủ cả nhánh gửi lại bên dưới.
        await assertCurrentStaffAccess(transaction, db, staff.uid, { warehouseId });
        const [voucherDoc, movementDoc] = await Promise.all([
          transaction.get(voucherRef), transaction.get(movementRef),
        ]);
        if (voucherDoc.exists || movementDoc.exists) {
          if (!voucherDoc.exists || !movementDoc.exists || voucherDoc.data().requestFingerprint !== requestFingerprint) {
            throw new ApiError(409, 'Khóa gửi đã được dùng cho một phiếu khác.', 'IDEMPOTENCY_CONFLICT');
          }
          const itemDoc = await transaction.get(inventoryRef);
          const itemData = itemDoc.exists ? itemDoc.data() : null;
          return {
            voucher: voucherDoc.data(), movement: movementDoc.data(),
            item: itemData ? {
              id: itemId,
              name: itemData.itemName || itemData.name || '',
              warehouseId: itemData.warehouseId || '',
              categoryId: itemData.category || itemData.categoryId || 'other',
              available: itemData.quantityAvailable ?? itemData.available ?? 0,
              quantityAvailable: itemData.quantityAvailable ?? itemData.available ?? 0,
              unit: itemData.unitId || itemData.unit || 'chiếc',
              unitId: itemData.unitId || itemData.unit || 'chiếc',
              location: itemData.location || '',
              sourceReceipt: itemData.sourceReceipt || itemData.receiptId || '',
              version: typeof itemData.version === 'number' ? itemData.version : 1,
            } : null,
            idempotentReplay: true,
            // Gửi lại không ghi gì thêm, nên cũng không sinh cảnh báo mới.
            warnings: [],
          };
        }

        const [warehouseDoc, inventoryDoc, beneficiaryDoc] = await Promise.all([
          transaction.get(warehouseRef),
          transaction.get(inventoryRef),
          transaction.get(beneficiaryRef),
        ]);
        if (!warehouseDoc.exists || warehouseDoc.data().status !== 'active') {
          throw new ApiError(409, 'Kho đã ngừng hoạt động. Không thể xuất hàng.', 'WAREHOUSE_INACTIVE');
        }

        if (!inventoryDoc.exists) {
          throw new ApiError(404, 'Vật phẩm không thuộc kho đang thao tác.', 'NOT_FOUND');
        }
        const itemData = inventoryDoc.data();
        if (itemData.warehouseId !== warehouseId) {
          throw new ApiError(404, 'Vật phẩm không thuộc kho đang thao tác.', 'NOT_FOUND');
        }

        if (!beneficiaryDoc.exists) {
          throw new ApiError(400, 'Chọn người thụ hưởng đã duyệt thuộc phạm vi kho.', 'VALIDATION', {
            errors: { beneficiaryId: 'Chọn người thụ hưởng đã duyệt thuộc phạm vi kho.' },
          });
        }
        const benData = beneficiaryDoc.data();
        const isApproved = benData.approved === true || benData.status === 'approved';
        if (benData.warehouseId !== warehouseId || !isApproved) {
          throw new ApiError(400, 'Chọn người thụ hưởng đã duyệt thuộc phạm vi kho.', 'VALIDATION', {
            errors: { beneficiaryId: 'Chọn người thụ hưởng đã duyệt thuộc phạm vi kho.' },
          });
        }

        const currentAvailable = typeof itemData.quantityAvailable === 'number'
          ? itemData.quantityAvailable
          : typeof itemData.available === 'number'
            ? itemData.available
            : 0;
        const currentVersion = typeof itemData.version === 'number' ? itemData.version : 1;
        const itemName = itemData.itemName || itemData.name || '';
        const categoryId = itemData.category || itemData.categoryId || 'other';
        const unit = itemData.unitId || itemData.unit || 'chiếc';

        const itemProjection = {
          id: itemId,
          name: itemName,
          warehouseId: itemData.warehouseId,
          categoryId,
          available: currentAvailable,
          quantityAvailable: currentAvailable,
          unit,
          unitId: unit,
          location: itemData.location || '',
          sourceReceipt: itemData.sourceReceipt || itemData.receiptId || '',
          version: currentVersion,
        };

        if (expectedVersion !== currentVersion) {
          throw new ApiError(
            409,
            `Sổ kho vừa thay đổi. Tồn mới: ${currentAvailable} ${unit}. Vui lòng kiểm tra và xác nhận lại.`,
            'STOCK_CONFLICT',
            { item: itemProjection }
          );
        }

        if (quantity > currentAvailable) {
          throw new ApiError(
            409,
            `Chỉ còn ${currentAvailable} ${unit}. Vui lòng điều chỉnh số lượng.`,
            'INSUFFICIENT_STOCK',
            { item: itemProjection }
          );
        }

        const before = currentAvailable;
        const after = before - quantity;
        const newVersion = currentVersion + 1;
        const progress = await readDonationProgress(transaction, {
          itemId, itemData, warehouseId, unit, currentAvailable, quantity,
        });

        const timestamp = new Date().toISOString();
        const serverNow = now();

        const voucherData = {
          id: voucherId,
          warehouseId,
          beneficiaryId,
          status: 'confirmed',
          lines: [{
            inventoryItemId: itemId,
            quantity,
            unitId: unit,
          }],
          createdByUid: staff.uid,
          confirmedByUid: staff.uid,
          createdAt: serverNow,
          confirmedAt: serverNow,
          timestamp,
          note,
          handedOver: true,
          requestFingerprint,
          // FE compatibility fields:
          movementId,
          itemId,
          itemName,
          quantity,
          unit,
          unitId: unit,
          actor: {
            id: staff.uid,
            email: staff.email,
            displayName: staff.displayName || staff.email,
            role: staff.role,
          },
          before,
          after,
        };

        const movementData = {
          id: movementId,
          voucherId,
          type: 'distribution',
          quantity: -quantity,
          unitId: unit,
          inventoryItemId: itemId,
          warehouseId,
          actorUid: staff.uid,
          createdAt: serverNow,
          timestamp,
          // FE compatibility fields:
          itemId,
          itemName,
          before,
          after,
          actorId: staff.uid,
        };

        transaction.update(inventoryRef, {
          quantityAvailable: after,
          available: after,
          version: newVersion,
          updatedAt: serverNow,
          // Bộ đếm chỉ được ghi khi đã biết chắc; không đối soát được thì để trống và gắn cờ
          // cho người kiểm tra, thay vì ghi một con số đoán.
          ...(progress.quantityDistributed !== null ? { quantityDistributed: progress.quantityDistributed } : {}),
          ...(progress.issue ? { needsReconciliation: true, reconciliationIssue: progress.issue } : {}),
        });

        transaction.set(voucherRef, voucherData);
        transaction.set(movementRef, movementData);

        if (progress.donationRef) {
          // Donor đọc được document này, nên tuyệt đối không ghi beneficiaryId hay phiếu xuất vào
          // đây. Tăng version để thao tác cầm expectedVersion cũ trên donation bị từ chối.
          transaction.update(progress.donationRef, {
            status: 'distributed',
            distributedAt: serverNow,
            version: progress.donationVersion + 1,
          });
        }

        return {
          voucher: voucherData,
          movement: movementData,
          item: {
            ...itemProjection,
            available: after,
            quantityAvailable: after,
            version: newVersion,
          },
          donationClosed: Boolean(progress.donationRef),
          // Xuất kho vẫn thành công khi sổ donation lệch — trao hàng là việc chính — nhưng phải
          // báo ra để người vận hành biết có mục cần kiểm tra.
          warnings: progress.issue ? [progress.issue] : [],
        };
      });

      return {
        status: result.idempotentReplay ? 200 : 201,
        body: {
          success: true,
          ...result,
        },
      };
    }

    throw new ApiError(404, 'Not found');
  }

  return { handle };
}

module.exports = { createDistributionApi };

