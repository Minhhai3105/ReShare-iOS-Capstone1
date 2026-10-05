// Lớp truy cập dữ liệu hàng đợi quyên góp. Hiện dùng mock; khi có Firestore/API chỉ thay phần thân hàm,
// giữ nguyên chữ ký và dạng kết quả để composable và giao diện không phải sửa.
import {
  MOCK_DONATIONS,
  MOCK_DONATION_SCENARIO,
  MOCK_WAREHOUSES,
  getMockAccessOverride,
  getMockDonationScenario,
  getMockDonorName,
} from './donation.mock.js'
import { DONATION_PAGE_SIZE, DONATION_QUEUE_ERROR, DONATION_SORT } from './donation.constants.js'
import { ADMIN_ROLES, USER_ROLE } from '../auth/auth.constants.js'
import { db } from '../auth/firebase.js'
import { collection, doc, documentId, getDoc, getDocs, limit, orderBy, query as firestoreQuery, startAfter, where } from 'firebase/firestore'

const SCENARIO_ERROR = {
  [MOCK_DONATION_SCENARIO.error]: DONATION_QUEUE_ERROR.server,
  [MOCK_DONATION_SCENARIO.network]: DONATION_QUEUE_ERROR.network,
  [MOCK_DONATION_SCENARIO.forbidden]: DONATION_QUEUE_ERROR.forbidden,
}

function createQueueError(status) {
  return Object.assign(new Error(String(status)), { status })
}

// Giả lập độ trễ mạng (400–900ms, kịch bản "slow" 3s) và lỗi theo kịch bản mock.
async function simulateRequest() {
  const scenario = getMockDonationScenario()
  const delayMs = scenario === MOCK_DONATION_SCENARIO.slow ? 3000 : 400 + Math.random() * 500
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  if (SCENARIO_ERROR[scenario]) throw createQueueError(SCENARIO_ERROR[scenario])
}

// Bỏ dấu tiếng Việt để tìm "nguyen" khớp "Nguyễn".
export function normalizeText(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/^#/, '')
    .toLowerCase()
    .trim()
}

function toDayBoundary(date, isEndOfDay) {
  if (!date) return null
  return new Date(`${date}T${isEndOfDay ? '23:59:59.999' : '00:00:00'}`).getTime()
}

function getWarehouseName(warehouseId) {
  if (!warehouseId) return null
  return MOCK_WAREHOUSES.find((warehouse) => warehouse.id === warehouseId)?.name ?? warehouseId
}

/**
 * Phạm vi xem hàng đợi theo phân công (staff_assignments). Trả về null nếu không có quyền.
 * Khi dev có thể ghi đè bằng reshareMock.setDonationAccess(...) để thử từng vai trò.
 */
export function resolveQueueAccess(assignment) {
  const access = (import.meta.env.DEV ? getMockAccessOverride() : null) ?? assignment
  if (!access || access.active === false || !ADMIN_ROLES.includes(access.role)) return null
  return {
    role: access.role,
    warehouseIds: Array.isArray(access.warehouseIds) ? access.warehouseIds : [],
    isAllWarehouses: access.role === USER_ROLE.systemAdmin,
  }
}

function canViewWarehouse(access, warehouseId) {
  return access.isAllWarehouses || access.warehouseIds.includes(warehouseId)
}
export async function fetchQueueWarehouses(access) {
  if (!access) throw createQueueError(DONATION_QUEUE_ERROR.forbidden)
  if (access.isAllWarehouses) {
    try {
      const snapshot = await getDocs(collection(db, 'warehouses'))
      return snapshot.docs.map((docSnap) => ({ id: docSnap.id, name: docSnap.data().name || docSnap.id }))
    } catch (error) {
      throw createQueueError(error?.code === 'permission-denied' ? DONATION_QUEUE_ERROR.forbidden : DONATION_QUEUE_ERROR.network)
    }
  }
  return access.warehouseIds.map((id) => ({ id, name: id }))
}

export function processAndPaginateDonations(source, access, query) {
  const keyword = normalizeText(query.search ?? '')
  const fromTime = toDayBoundary(query.dateFrom, false)
  const toTime = toDayBoundary(query.dateTo, true)

  const matchesScopeAndFilters = source.filter((donation) => {
    const createdTime = new Date(donation.createdAt).getTime()
    const donorName = donation.donorName || getMockDonorName(donation.donorId)
    const assignedHub = donation.hubId || donation.warehouseId
    return (
      (access.isAllWarehouses || (assignedHub && access.warehouseIds.includes(assignedHub))) &&
      (!query.warehouseId || assignedHub === query.warehouseId) &&
      (!query.category || donation.category === query.category) &&
      (fromTime === null || createdTime >= fromTime) &&
      (toTime === null || createdTime <= toTime) &&
      (!keyword ||
        normalizeText(donation.id).includes(keyword) ||
        normalizeText(donorName).includes(keyword) ||
        (donation.donorId && donation.donorId.includes(keyword)) ||
        (donation.title && normalizeText(donation.title).includes(keyword)))
    )
  })

  // Số lượng cho chip "Lọc nhanh": tính trên mọi bộ lọc trừ trạng thái.
  const statusCounts = matchesScopeAndFilters.reduce((counts, donation) => {
    counts[donation.status] = (counts[donation.status] ?? 0) + 1
    return counts
  }, {})

  const direction = query.sort === DONATION_SORT.newestFirst ? -1 : 1
  // Sắp theo ngày tạo rồi theo id để thứ tự ổn định: chuyển trang không lặp hay mất dòng.
  const sorted = matchesScopeAndFilters
    .filter((donation) => !query.status || donation.status === query.status)
    .sort((a, b) => direction * (String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id)))

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / DONATION_PAGE_SIZE))
  const page = Math.min(Math.max(1, query.page ?? 1), totalPages)
  const items = sorted.slice((page - 1) * DONATION_PAGE_SIZE, page * DONATION_PAGE_SIZE).map((donation) => ({
    ...donation,
    donorName: donation.donorName || getMockDonorName(donation.donorId),
    warehouseName: getWarehouseName(donation.hubId || donation.warehouseId),
  }))

  return { items, total, page, pageSize: DONATION_PAGE_SIZE, totalPages, statusCounts }
}

/**
 * @param access kết quả resolveQueueAccess
 * @param query { search, status, warehouseId, category, dateFrom, dateTo, sort, page }
 * @returns { items, total, page, pageSize, totalPages, statusCounts }
 */
export async function fetchDonationQueue(access, query) {
  if (!access) throw createQueueError(DONATION_QUEUE_ERROR.forbidden)

  // Giống backend: từ chối khi request chỉ định kho ngoài phân công, kể cả khi sửa request thủ công.
  if (query.warehouseId && !canViewWarehouse(access, query.warehouseId)) {
    throw createQueueError(DONATION_QUEUE_ERROR.forbidden)
  }

  // Nhân sự kho chưa được gán kho nào thì hàng đợi rỗng.
  if (!access.isAllWarehouses && access.warehouseIds.length === 0) {
    return { items: [], total: 0, page: 1, pageSize: DONATION_PAGE_SIZE, totalPages: 1, statusCounts: {} }
  }

  // Kịch bản minh họa chỉ chạy khi lập trình viên chủ động bật trong môi trường dev.
  if (import.meta.env.DEV && getMockDonationScenario() !== MOCK_DONATION_SCENARIO.normal) {
    await simulateRequest()
    const source = getMockDonationScenario() === MOCK_DONATION_SCENARIO.empty ? [] : MOCK_DONATIONS
    return processAndPaginateDonations(source, access, query)
  }

  try {
    const constraints = []
    const warehouseIds = access.warehouseIds
    if (query.warehouseId) {
      constraints.push(where('hubId', '==', query.warehouseId))
    } else if (!access.isAllWarehouses) {
      if (warehouseIds.length > 10) throw createQueueError(DONATION_QUEUE_ERROR.server)
      constraints.push(where('hubId', warehouseIds.length === 1 ? '==' : 'in', warehouseIds.length === 1 ? warehouseIds[0] : warehouseIds))
    }
    if (query.category) constraints.push(where('category', '==', query.category))
    if (query.status) constraints.push(where('status', '==', query.status))
    if (query.dateFrom) constraints.push(where('createdAt', '>=', new Date(`${query.dateFrom}T00:00:00`)))
    if (query.dateTo) constraints.push(where('createdAt', '<=', new Date(`${query.dateTo}T23:59:59.999`)))

    const normalizeDoc = (docSnap) => {
      const data = docSnap.data()
      const assignedHub = data.hubId || data.warehouseId
      return {
        ...data,
        id: docSnap.id,
        donorName: data.donorName || data.donorId,
        warehouseName: data.hubName || data.warehouseName || assignedHub || null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : String(data.createdAt || ''),
      }
    }

    // Search by exact donation ID avoids reading a whole collection for client-side text matching.
    if (query.search?.trim()) {
      const snap = await getDoc(doc(db, 'donations', query.search.trim().replace(/^#/, '')))
      const items = snap.exists() ? [normalizeDoc(snap)].filter((item) =>
        (access.isAllWarehouses || warehouseIds.includes(item.hubId || item.warehouseId)) &&
        (!query.warehouseId || (item.hubId || item.warehouseId) === query.warehouseId) &&
        (!query.category || item.category === query.category) &&
        (!query.status || item.status === query.status) &&
        (!query.dateFrom || new Date(item.createdAt) >= new Date(`${query.dateFrom}T00:00:00`)) &&
        (!query.dateTo || new Date(item.createdAt) <= new Date(`${query.dateTo}T23:59:59.999`))) : []
      return { items, total: items.length, page: 1, pageSize: DONATION_PAGE_SIZE, totalPages: 1, hasMore: false, nextCursor: null, statusCounts: null }
    }

    const direction = query.sort === DONATION_SORT.newestFirst ? 'desc' : 'asc'
    constraints.push(orderBy('createdAt', direction), orderBy(documentId(), direction))
    if (query.cursor) constraints.push(startAfter(query.cursor))
    constraints.push(limit(DONATION_PAGE_SIZE + 1))
    const q = firestoreQuery(collection(db, 'donations'), ...constraints)
    const snapshot = await getDocs(q)
    const pageDocs = snapshot.docs.slice(0, DONATION_PAGE_SIZE)
    return {
      items: pageDocs.map(normalizeDoc), total: null, page: query.page || 1,
      pageSize: DONATION_PAGE_SIZE, totalPages: null,
      hasMore: snapshot.docs.length > DONATION_PAGE_SIZE,
      nextCursor: pageDocs.at(-1) || null, statusCounts: null,
    }
  } catch (error) {
    if (error?.status) throw error
    throw createQueueError(error?.code === 'permission-denied' ? DONATION_QUEUE_ERROR.forbidden : DONATION_QUEUE_ERROR.network)
  }
}
