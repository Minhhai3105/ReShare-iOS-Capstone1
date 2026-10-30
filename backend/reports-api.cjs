const { ApiError } = require('./image-api.cjs');

const REPORT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function reportDay(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(dayFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const DEFAULT_CATEGORIES = [
  { id: 'clothing', name: 'Quần áo' },
  { id: 'blankets', name: 'Chăn ấm' },
  { id: 'household', name: 'Đồ gia dụng' },
  { id: 'food', name: 'Thực phẩm' },
  { id: 'books', name: 'Sách vở' },
  { id: 'other', name: 'Khác' },
];

function createReportsApi({ db, verifyToken, serverTimestamp }) {
  if (!db || !verifyToken) throw new Error('Reports API configuration is incomplete');

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
      role: data.role,
      warehouseIds: Array.isArray(data.warehouseIds) ? data.warehouseIds : [],
    };
  }

  async function handle(method, path, headers) {
    const url = new URL(path, 'http://localhost');
    const pathname = url.pathname;
    const isReports = method === 'GET' && (pathname === '/v1/admin/reports' || pathname === '/v1/admin/reports/');

    if (!isReports) throw new ApiError(404, 'Not found');

    const staff = await getStaffAssignment(headers);

    const from = url.searchParams.get('from') || '2025-01-01';
    const to = url.searchParams.get('to') || '2030-12-31';
    const isDate = (val) => /^\d{4}-\d{2}-\d{2}$/.test(val) &&
      Number.isFinite(Date.parse(`${val}T00:00:00Z`)) &&
      new Date(`${val}T00:00:00Z`).toISOString().slice(0, 10) === val;
    if (!isDate(from) || !isDate(to) || from > to) {
      throw new ApiError(400, 'Hãy chọn khoảng thời gian hợp lệ (từ ngày ≤ đến ngày).', 'VALIDATION');
    }

    const queryWarehouseId = url.searchParams.get('warehouseId') || '';
    const queryCategoryId = url.searchParams.get('categoryId') || '';

    // Authorization scope
    if (staff.role === 'warehouse_admin') {
      if (queryWarehouseId && !staff.warehouseIds.includes(queryWarehouseId)) {
        throw new ApiError(403, 'Bạn không có quyền xem kho đã chọn.', 'FORBIDDEN');
      }
    }

    // 1. Warehouses
    const warehousesSnap = await db.collection('warehouses').get();
    const allWarehouses = warehousesSnap.docs.map(doc => {
      const d = doc.data();
      return { id: doc.id, name: d.name || doc.id, status: d.status || 'active' };
    }).filter(w => w.status === 'active');

    const allowedWarehouseIds = new Set(
      staff.role === 'system_admin'
        ? allWarehouses.map(w => w.id)
        : allWarehouses.filter(w => staff.warehouseIds.includes(w.id)).map(w => w.id)
    );

    const scopedWarehouses = allWarehouses.filter(w => allowedWarehouseIds.has(w.id));

    // 2. Categories
    let categories = DEFAULT_CATEGORIES;
    try {
      const categoriesSnap = await db.collection('categories').get();
      if (!categoriesSnap.empty) {
        categories = categoriesSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id }));
      }
    } catch {
      categories = DEFAULT_CATEGORIES;
    }

    const inScope = (row) => {
      if (!row.warehouseId) {
        if (staff.role !== 'system_admin' || row.type !== 'donation' || queryWarehouseId) return false;
      } else if (!allowedWarehouseIds.has(row.warehouseId)) return false;
      if (queryWarehouseId && row.warehouseId !== queryWarehouseId) return false;
      if (queryCategoryId && row.categoryId !== queryCategoryId) return false;
      return true;
    };

    // 3. Collect sources (donations, receipts, movements) - with strict PII removal
    const sources = [];

    // Pre-load donation and inventory category lookups so receipts and movements inherit exact category
    const donationsSnap = await db.collection('donations').get();
    const donationMeta = new Map();
    for (const doc of donationsSnap.docs) {
      const d = doc.data();
      const cat = d.category || d.categoryId || '';
      const unit = d.unitId || d.unitName || d.unit || 'chiếc';
      const itemTitle = d.title || d.itemName || d.item || 'Vật phẩm';
      donationMeta.set(doc.id, { category: cat, unit, itemTitle });
    }

    const inventorySnap = await db.collection('inventory').get();
    const inventoryMeta = new Map();
    for (const doc of inventorySnap.docs) {
      const d = doc.data();
      const cat = d.category || d.categoryId || (d.donationId ? donationMeta.get(d.donationId)?.category : '') || '';
      const unit = d.unitId || d.unit || 'chiếc';
      const itemName = d.itemName || d.name || d.item || '';
      inventoryMeta.set(doc.id, { category: cat, unit, itemName });
    }

    // 3a. Donations
    for (const doc of donationsSnap.docs) {
      const d = doc.data();
      const rawTs = d.createdAt?.toDate?.().toISOString() || d.createdAt || d.created_at || '';
      const day = reportDay(rawTs);
      if (day && day >= from && day <= to) {
        const meta = donationMeta.get(doc.id) || {};
        const categoryId = d.category || d.categoryId || meta.category || 'other';
        const rawQty = typeof d.quantity === 'number' ? d.quantity : typeof d.declaredQuantity === 'number' ? d.declaredQuantity : 0;
        const row = {
          id: doc.id,
          type: 'donation',
          timestamp: new Date(rawTs).toISOString(),
          warehouseId: d.warehouseId || '',
          categoryId,
          item: d.title || d.itemName || d.item || 'Vật phẩm quyên góp',
          quantity: rawQty,
          unit: d.unitId || d.unitName || d.unit || 'chiếc',
          reference: '',
          status: d.status || 'approved',
        };
        if (inScope(row)) sources.push(row);
      }
    }

    // 3b. Receipts
    const receiptsSnap = await db.collection('receipts').get();
    for (const doc of receiptsSnap.docs) {
      const d = doc.data();
      const rawTs = d.createdAt?.toDate?.().toISOString() || d.createdAt || '';
      const day = reportDay(rawTs);
      if (day && day >= from && day <= to) {
        const donMeta = d.donationId ? donationMeta.get(d.donationId) : null;
        const categoryId = d.category || d.categoryId || donMeta?.category || 'other';
        const rawQty = typeof d.quantity === 'number' ? d.quantity : 0;
        const row = {
          id: doc.id,
          type: 'receipt',
          timestamp: new Date(rawTs).toISOString(),
          warehouseId: d.warehouseId || '',
          categoryId,
          item: d.itemName || d.item || donMeta?.itemTitle || 'Hàng thực nhận',
          quantity: rawQty,
          unit: d.unitId || d.unitName || d.unit || donMeta?.unit || 'chiếc',
          reference: d.donationId || '',
          status: 'confirmed',
        };
        if (inScope(row)) sources.push(row);
      }
    }

    // 3c. Inventory movements (intake and distribution)
    const movementsSnap = await db.collection('inventory_movements').get();
    const seenMovementIds = new Set();
    for (const doc of movementsSnap.docs) {
      const d = doc.data();
      const rawTs = d.createdAt?.toDate?.().toISOString() || d.createdAt || d.timestamp || '';
      const day = reportDay(rawTs);
      if (day && day >= from && day <= to) {
        const type = (d.type === 'stock_in' || d.type === 'intake') ? 'intake' : d.type === 'distribution' ? 'distribution' : d.type;
        if (type === 'intake' || type === 'distribution') {
          seenMovementIds.add(doc.id);
          const invMeta = (d.inventoryItemId || d.itemId) ? inventoryMeta.get(d.inventoryItemId || d.itemId) : null;
          const donMeta = d.donationId ? donationMeta.get(d.donationId) : null;
          const categoryId = d.category || d.categoryId || invMeta?.category || donMeta?.category || 'other';
          const rawQty = Math.abs(typeof d.quantity === 'number' ? d.quantity : 0);
          const row = {
            id: doc.id,
            type,
            timestamp: new Date(rawTs).toISOString(),
            warehouseId: d.warehouseId || '',
            categoryId,
            item: d.itemName || d.item || invMeta?.itemName || donMeta?.itemTitle || 'Vật phẩm',
            quantity: rawQty,
            unit: d.unitId || d.unit || invMeta?.unit || donMeta?.unit || 'chiếc',
            reference: d.voucherId || d.receiptId || d.stockEntryId || '',
            status: 'confirmed',
          };
          if (inScope(row)) sources.push(row);
        }
      }
    }

    // Also include distribution vouchers if any were created without a movement
    const vouchersSnap = await db.collection('distribution_vouchers').get();
    for (const doc of vouchersSnap.docs) {
      const d = doc.data();
      if (d.movementId && seenMovementIds.has(d.movementId)) continue;
      const rawTs = d.createdAt?.toDate?.().toISOString() || d.createdAt || d.timestamp || '';
      const day = reportDay(rawTs);
      if (day && day >= from && day <= to) {
        const firstLine = Array.isArray(d.lines) && d.lines[0] ? d.lines[0] : null;
        const itemId = firstLine?.inventoryItemId || d.itemId || '';
        const invMeta = itemId ? inventoryMeta.get(itemId) : null;
        const categoryId = d.category || d.categoryId || invMeta?.category || 'other';
        const rawQty = typeof d.quantity === 'number' ? d.quantity : typeof firstLine?.quantity === 'number' ? firstLine.quantity : 0;
        const row = {
          id: doc.id,
          type: 'distribution',
          timestamp: new Date(rawTs).toISOString(),
          warehouseId: d.warehouseId || '',
          categoryId,
          item: d.itemName || d.item || invMeta?.itemName || 'Vật phẩm phân phối',
          quantity: rawQty,
          unit: d.unitId || d.unit || firstLine?.unitId || invMeta?.unit || 'chiếc',
          reference: d.movementId || '',
          status: 'confirmed',
        };
        if (inScope(row)) sources.push(row);
      }
    }

    // Sort sources by timestamp ascending, then id
    sources.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));

    // 4. Inventory snapshot
    const inventory = inventorySnap.docs.map(doc => {
      const d = doc.data();
      const invMeta = inventoryMeta.get(doc.id) || {};
      const currentAvailable = typeof d.quantityAvailable === 'number'
        ? d.quantityAvailable
        : typeof d.available === 'number'
          ? d.available
          : 0;
      return {
        id: doc.id,
        warehouseId: d.warehouseId || '',
        categoryId: d.category || d.categoryId || invMeta.category || 'other',
        item: d.itemName || d.name || d.item || '',
        available: currentAvailable,
        quantityAvailable: currentAvailable,
        unit: d.unitId || d.unit || 'chiếc',
      };
    }).filter(inScope);

    return {
      status: 200,
      body: {
        warehouses: scopedWarehouses,
        categories,
        sources,
        inventory,
        snapshotAt: new Date().toISOString(),
      },
    };
  }

  return { handle };
}

module.exports = { createReportsApi, reportDay };

