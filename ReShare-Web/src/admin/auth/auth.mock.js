import { USER_ROLE } from './auth.constants'

export const MOCK_PASSWORD = '123456'

// Tài khoản đăng nhập (Firebase Auth + UserProfile iOS). sessionDurationMs chỉ dùng để test hết hạn phiên.
export const MOCK_USERS = Object.freeze([
  { id: 'mock-system-admin', displayName: 'Trần Quản Trị', email: 'admin@reshare.vn' },
  { id: 'mock-warehouse-admin', displayName: 'Hoàng Phạm', email: 'warehouse@reshare.vn' },
  { id: 'mock-guest', displayName: 'Khách ReShare', email: 'guest@reshare.vn' },
  { id: 'mock-revoked', displayName: 'Nhân sự đã thu hồi', email: 'revoked@reshare.vn' },
  { id: 'mock-short-session', displayName: 'Phiên ngắn (test)', email: 'expired@reshare.vn', sessionDurationMs: 10 * 1000 },
])

// Giống collection staff_assignments/{uid} của BE (US02-T02). Không có document = không phải nhân sự.
const mockStaffAssignments = {
  'mock-system-admin': { uid: 'mock-system-admin', role: USER_ROLE.systemAdmin, warehouseIds: [], active: true },
  'mock-warehouse-admin': {
    uid: 'mock-warehouse-admin',
    role: USER_ROLE.warehouseAdmin,
    warehouseIds: ['wh_dn_01'],
    active: true,
  },
  'mock-revoked': { uid: 'mock-revoked', role: USER_ROLE.warehouseAdmin, warehouseIds: [], active: false },
  'mock-short-session': { uid: 'mock-short-session', role: USER_ROLE.systemAdmin, warehouseIds: [], active: true },
}
const assignmentListeners = new Map()

// Email đặc biệt để giả lập lỗi máy chủ / mất kết nối
export const MOCK_ERROR_EMAIL = Object.freeze({
  server: 'error500@reshare.vn',
  network: 'offline@reshare.vn',
})

export function getMockStaffAssignment(uid) {
  return mockStaffAssignments[uid] ? structuredClone(mockStaffAssignments[uid]) : null
}

export function subscribeMockStaffAssignment(uid, callback) {
  if (!assignmentListeners.has(uid)) assignmentListeners.set(uid, new Set())
  assignmentListeners.get(uid).add(callback)
  return () => assignmentListeners.get(uid).delete(callback)
}

// Giả lập server (Admin SDK) đổi hoặc thu hồi phân công; changes = null để xóa document.
export function updateMockStaffAssignment(email, changes) {
  const user = MOCK_USERS.find((mockUser) => mockUser.email === email)
  if (!user) return
  if (changes === null) delete mockStaffAssignments[user.id]
  else mockStaffAssignments[user.id] = { ...mockStaffAssignments[user.id], uid: user.id, ...changes }
  assignmentListeners.get(user.id)?.forEach((callback) => callback(getMockStaffAssignment(user.id)))
}

// Dùng trong Console khi dev để test AC3 (dữ liệu mock reset khi tải lại trang).
if (import.meta.env.DEV) globalThis.reshareMock = { updateStaffAssignment: updateMockStaffAssignment }
