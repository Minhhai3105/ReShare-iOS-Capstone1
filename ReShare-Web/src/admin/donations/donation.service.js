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
import { collection, getDocs, query as firestoreQuery, where } from 'firebase/firestore'

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
  const access = getMockAccessOverride() ?? assignment
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
      if (!snapshot.empty) {
        return snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          name: docSnap.data().name || docSnap.id,
        }))
      }
    } catch {
      // Fallback khi chạy preview hoặc offline
    }
    return MOCK_WAREHOUSES.map(({ id, name }) => ({ id, name }))
  }
  return access.warehouseIds.map((id) => ({ id, name: getWarehouseName(id) }))
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

  // Khi có kịch bản mock (error, slow, empty...) thì ưu tiên chạy kịch bản mock để phục vụ test UI
  if (getMockDonationScenario() !== MOCK_DONATION_SCENARIO.normal) {
    await simulateRequest()
    const source = getMockDonationScenario() === MOCK_DONATION_SCENARIO.empty ? [] : MOCK_DONATIONS
    return processAndPaginateDonations(source, access, query)
  }

  // Thử truy vấn dữ liệu từ Firestore thực tế
  try {
    const constraints = []
    if (query.warehouseId) {
      constraints.push(where('hubId', '==', query.warehouseId))
    } else if (!access.isAllWarehouses) {
      if (access.warehouseIds.length === 1) {
        constraints.push(where('hubId', '==', access.warehouseIds[0]))
      } else {
        constraints.push(where('hubId', 'in', access.warehouseIds.slice(0, 10)))
      }
    }
    if (query.category) {
      constraints.push(where('category', '==', query.category))
    }

    const q = firestoreQuery(collection(db, 'donations'), ...constraints)
    const snapshot = await getDocs(q)
    if (!snapshot.empty) {
      const realDocs = snapshot.docs.map((docSnap) => {
        const data = docSnap.data()
        return {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
        }
      })
      return processAndPaginateDonations(realDocs, access, query)
    }
  } catch (error) {
    if (error?.code === 'permission-denied') {
      throw createQueueError(DONATION_QUEUE_ERROR.forbidden)
    }
    // Nếu chưa có kết nối mạng hoặc Firestore trống, fallback sang dữ liệu mẫu cho dev
  }

  await simulateRequest()
  const source = getMockDonationScenario() === MOCK_DONATION_SCENARIO.empty ? [] : MOCK_DONATIONS
  return processAndPaginateDonations(source, access, query)
}
