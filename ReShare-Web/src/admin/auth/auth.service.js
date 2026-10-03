import {
  MOCK_ERROR_EMAIL,
  MOCK_PASSWORD,
  MOCK_USERS,
  getMockStaffAssignment,
  subscribeMockStaffAssignment,
} from './auth.mock'
import {
  ADMIN_EMAIL_DOMAIN,
  AUTH_ERROR,
  EXTENDED_SESSION_DURATION_MS,
  SESSION_DURATION_MS,
} from './auth.constants'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isAdminEmail(email) {
  return EMAIL_PATTERN.test(email) && email.toLowerCase().endsWith(ADMIN_EMAIL_DOMAIN)
}

function createAuthError(status) {
  return Object.assign(new Error(String(status)), { status })
}

function getUidFromToken(accessToken) {
  return accessToken?.split('.')[1]
}

// Giả lập độ trễ (mặc định 800–1500ms) và lỗi hạ tầng theo email đặc biệt.
async function simulateRequest(email, delayMs = 800 + Math.random() * 700) {
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  if (email === MOCK_ERROR_EMAIL.network) throw createAuthError(AUTH_ERROR.network)
  if (email === MOCK_ERROR_EMAIL.server) throw createAuthError(AUTH_ERROR.server)
}

// Chỉ xác thực danh tính (Firebase Auth); quyền nhân sự đọc riêng qua requestStaffAssignment.
export async function requestSignIn(email, password, keepSignedIn) {
  const normalizedEmail = email.toLowerCase()
  await simulateRequest(normalizedEmail)
  const mockUser = MOCK_USERS.find((user) => user.email === normalizedEmail)
  if (!mockUser || password !== MOCK_PASSWORD) throw createAuthError(AUTH_ERROR.invalidCredentials)

  const { sessionDurationMs, ...user } = mockUser
  return {
    accessToken: `mock.${user.id}.${Date.now()}`,
    user,
    expiresIn: sessionDurationMs ?? (keepSignedIn ? EXTENDED_SESSION_DURATION_MS : SESSION_DURATION_MS),
  }
}

// Nguồn quyền đáng tin cậy: staff_assignments/{uid}. Trả về null nếu không phải nhân sự.
export async function requestStaffAssignment(accessToken) {
  const uid = getUidFromToken(accessToken)
  await simulateRequest(null, 200)
  if (!MOCK_USERS.some((user) => user.id === uid)) throw createAuthError(AUTH_ERROR.invalidCredentials)
  return getMockStaffAssignment(uid)
}

// Theo dõi thay đổi phân công (tương đương onSnapshot); trả về hàm hủy theo dõi.
export function watchStaffAssignment(accessToken, callback) {
  return subscribeMockStaffAssignment(getUidFromToken(accessToken), callback)
}

export async function requestPasswordReset(email) {
  await simulateRequest(email.toLowerCase())
}
