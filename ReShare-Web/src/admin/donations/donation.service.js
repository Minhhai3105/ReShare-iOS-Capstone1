// Hàng đợi quyên góp đọc Firestore; warehouseId là kho được phân công, hubId chỉ là điểm minh họa trong app.
import { DONATION_PAGE_SIZE, DONATION_QUEUE_ERROR, DONATION_SORT } from './donation.constants.js'
import { ADMIN_ROLES, USER_ROLE } from '../auth/auth.constants.js'
import { db } from '../auth/firebase.js'
import { auth } from '../auth/firebase.js'
import { collection, doc, documentId, getDoc, getDocs, limit, orderBy, query as firestoreQuery, startAfter, where } from 'firebase/firestore'

function createQueueError(status) {
  return Object.assign(new Error(String(status)), { status })
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

/**
 * Phạm vi xem hàng đợi theo phân công (staff_assignments). Trả về null nếu không có quyền.
 */
export function resolveQueueAccess(assignment) {
  const access = assignment
  if (!access || access.active !== true || !ADMIN_ROLES.includes(access.role)) return null
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
  try {
    return await Promise.all(access.warehouseIds.map(async (id) => {
      const snapshot = await getDoc(doc(db, 'warehouses', id))
      return { id, name: snapshot.exists() ? snapshot.data().name || id : id }
    }))
  } catch (error) {
    throw createQueueError(error?.code === 'permission-denied' ? DONATION_QUEUE_ERROR.forbidden : DONATION_QUEUE_ERROR.network)
  }
}

export function processAndPaginateDonations(source, access, query) {
  const keyword = normalizeText(query.search ?? '')
  const fromTime = toDayBoundary(query.dateFrom, false)
  const toTime = toDayBoundary(query.dateTo, true)

  const matchesScopeAndFilters = source.filter((donation) => {
    const createdTime = new Date(donation.createdAt).getTime()
    const donorName = donation.donorName || donation.donorId || ''
    const assignedWarehouse = donation.warehouseId
    return (
      (access.isAllWarehouses || (assignedWarehouse && access.warehouseIds.includes(assignedWarehouse))) &&
      (!query.warehouseId || assignedWarehouse === query.warehouseId) &&
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
    donorName: donation.donorName || donation.donorId || 'Chưa có tên',
    warehouseName: donation.warehouseName || donation.warehouseId || null,
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

  try {
    const constraints = []
    const warehouseIds = access.warehouseIds
    if (query.warehouseId) {
      constraints.push(where('warehouseId', '==', query.warehouseId))
    } else if (!access.isAllWarehouses) {
      if (warehouseIds.length > 10) throw createQueueError(DONATION_QUEUE_ERROR.server)
      constraints.push(where('warehouseId', warehouseIds.length === 1 ? '==' : 'in', warehouseIds.length === 1 ? warehouseIds[0] : warehouseIds))
    }
    if (query.category) constraints.push(where('category', '==', query.category))
    if (query.status) constraints.push(where('status', '==', query.status))
    if (query.dateFrom) constraints.push(where('createdAt', '>=', new Date(`${query.dateFrom}T00:00:00`)))
    if (query.dateTo) constraints.push(where('createdAt', '<=', new Date(`${query.dateTo}T23:59:59.999`)))

    const normalizeDoc = (docSnap) => {
      const data = docSnap.data()
      return {
        ...data,
        id: docSnap.id,
        donorName: data.donorName || data.donorId || 'Chưa có tên',
        warehouseName: data.warehouseName || data.warehouseId || null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : String(data.createdAt || ''),
      }
    }

    // Search by exact donation ID avoids reading a whole collection for client-side text matching.
    if (query.search?.trim()) {
      const donationId = query.search.trim().replace(/^#/, '')
      if (donationId.includes('/')) {
        return { items: [], total: 0, page: 1, pageSize: DONATION_PAGE_SIZE, totalPages: 1, hasMore: false, nextCursor: null, statusCounts: null }
      }
      const snap = await getDoc(doc(db, 'donations', donationId))
      const items = snap.exists() ? [normalizeDoc(snap)].filter((item) =>
        (access.isAllWarehouses || warehouseIds.includes(item.warehouseId)) &&
        (!query.warehouseId || item.warehouseId === query.warehouseId) &&
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
    throw createQueueError(error?.code === 'permission-denied' ? DONATION_QUEUE_ERROR.forbidden
      : error?.code === 'failed-precondition' ? DONATION_QUEUE_ERROR.indexRequired : DONATION_QUEUE_ERROR.network)
  }
}

const reviewApiBase = (import.meta.env?.VITE_ADMIN_API_BASE_URL || 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

async function reviewRequest(path, body, responseField = 'donation') {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' })
  let response
  try {
    response = await fetch(`${reviewApiBase}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    })
  } catch {
    throw Object.assign(new Error('NETWORK'), { code: 'NETWORK' })
  }
  if (!response.ok) {
    let payload
    try { payload = await response.json() } catch {}
    const code = { 400: 'VALIDATION', 401: 'FORBIDDEN', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT' }[response.status] || 'NETWORK'
    const errorText = payload?.error || payload?.message
    throw Object.assign(new Error(errorText || code), { code, serverMessage: errorText })
  }
  const result = await response.json()
  return responseField ? result[responseField] : result
}

export const getDonationForReview = (donationId) => reviewRequest(`/v1/admin/donations/${encodeURIComponent(donationId)}`)

export const decideDonation = ({ donationId, action, publicMessage, internalNote, expectedVersion }) =>
  reviewRequest(`/v1/admin/donations/${encodeURIComponent(donationId)}/decide`, {
    action, publicMessage, internalNote, expectedVersion,
  })

export const confirmDonationCategory = ({ donationId, category, expectedVersion }) =>
  reviewRequest(`/v1/admin/donations/${encodeURIComponent(donationId)}/confirm-category`, { category, expectedVersion })

export const assignDonationWarehouse = ({ donationId, warehouseId, expectedVersion }) =>
  reviewRequest(`/v1/admin/donations/${encodeURIComponent(donationId)}/assign-warehouse`, { warehouseId, expectedVersion })

export const getAiAgreementSummary = () => reviewRequest('/v1/admin/donations/ai-summary', undefined, null)

export async function getDonationImageUrl(donationId, publicId) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' })
  try {
    const response = await fetch(`${reviewApiBase}/v1/images/read-access`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ donationId, publicId }),
      signal: AbortSignal.timeout(90000),
    })
    if (!response.ok) throw new Error('IMAGE_ACCESS_FAILED')
    return (await response.json()).url
  } catch {
    throw Object.assign(new Error('IMAGE_ACCESS_FAILED'), { code: 'IMAGE_ACCESS_FAILED' })
  }
}
