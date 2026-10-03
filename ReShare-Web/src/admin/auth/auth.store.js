import { computed, reactive } from 'vue'
import { requestSignIn, requestStaffAssignment, watchStaffAssignment } from './auth.service'
import { ADMIN_ROLES, AUTH_ERROR, FORBIDDEN_REASON, SESSION_STORAGE_KEY, USER_ROLE } from './auth.constants'

// session = { accessToken, user, expiresAt } được lưu vào sessionStorage.
// staffAssignment KHÔNG lưu vào storage: luôn đọc lại từ nguồn tin cậy để không bị sửa ở trình duyệt.
const state = reactive({ session: null, staffAssignment: null, isLoading: false })
let expiryTimer = null
let stopWatchingAssignment = null
let restorePromise = null
let onSessionExpired = null
let onAccessChanged = null

export const currentUser = computed(() => state.session?.user ?? null)
export const staffAssignment = computed(() => state.staffAssignment)
export const sessionExpiresAt = computed(() => state.session?.expiresAt ?? null)
export const isLoading = computed(() => state.isLoading)
export const isAuthenticated = computed(() => Boolean(state.session) && !isSessionExpired())

export function isSessionExpired(session = state.session) {
  return !session || Date.now() >= session.expiresAt
}

export function getAccessDeniedReason() {
  const assignment = state.staffAssignment
  if (!assignment || !ADMIN_ROLES.includes(assignment.role)) return FORBIDDEN_REASON.notStaff
  return assignment.active ? null : FORBIDDEN_REASON.revoked
}

export function canAccessWarehouse(warehouseId) {
  if (getAccessDeniedReason() || typeof warehouseId !== 'string') return false
  const { role, warehouseIds } = state.staffAssignment
  return role === USER_ROLE.systemAdmin || warehouseIds.includes(warehouseId)
}

function saveSession(session) {
  state.session = session
  clearTimeout(expiryTimer)
  try {
    if (session) sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Trình duyệt chặn storage: phiên chỉ tồn tại trong bộ nhớ.
  }
  if (!session) {
    stopWatchingAssignment?.()
    stopWatchingAssignment = null
    state.staffAssignment = null
  }
  // Phiên khôi phục đã hết hạn thì để route guard xử lý (giữ được lý do session_expired).
  if (!isSessionExpired(session)) expiryTimer = setTimeout(expireSession, session.expiresAt - Date.now())
}

function expireSession() {
  saveSession(null)
  onSessionExpired?.()
}

async function loadStaffAssignment() {
  const session = state.session
  try {
    const assignment = await requestStaffAssignment(session.accessToken)
    if (state.session !== session) return
    state.staffAssignment = assignment
    stopWatchingAssignment?.()
    stopWatchingAssignment = watchStaffAssignment(session.accessToken, (nextAssignment) => {
      state.staffAssignment = nextAssignment
      onAccessChanged?.()
    })
  } catch (error) {
    if (error.status === AUTH_ERROR.invalidCredentials && state.session === session) saveSession(null)
  }
}

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler
}

export function setAccessChangedHandler(handler) {
  onAccessChanged = handler
}

export function restoreSession() {
  restorePromise ??= (async () => {
    let storedSession = null
    try {
      storedSession = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY))
    } catch {
      return
    }
    if (!storedSession) return
    saveSession(storedSession)
    if (!isSessionExpired()) await loadStaffAssignment()
  })()
  return restorePromise
}

export async function signIn(email, password, { keepSignedIn = false } = {}) {
  if (state.isLoading) return null
  state.isLoading = true
  try {
    const { accessToken, user, expiresIn } = await requestSignIn(email, password, keepSignedIn)
    saveSession({ accessToken, user, expiresAt: Date.now() + expiresIn })
    await loadStaffAssignment()
    return user
  } finally {
    state.isLoading = false
  }
}

export function signOut() {
  saveSession(null)
}
