import { computed, reactive } from 'vue'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { requestSignIn, requestSignOut, requestStaffAssignment, watchStaffAssignment } from './auth.service'
import { ADMIN_ROLES, FORBIDDEN_REASON, USER_ROLE } from './auth.constants'
import { setSessionExpiredHandler } from '../protected-fetch.js'

const state = reactive({ user: null, staffAssignment: null, assignmentUnavailable: false, isLoading: false, sessionExpired: false })
let stopWatchingAssignment = null
let restorePromise = null
let onAccessChanged = null

export const currentUser = computed(() => state.user && ({
  id: state.user.uid,
  email: state.user.email,
  displayName: state.user.displayName || state.user.email,
}))
export const staffAssignment = computed(() => state.staffAssignment)
export const isLoading = computed(() => state.isLoading)
export const isAuthenticated = computed(() => Boolean(state.user))
export const sessionExpired = computed(() => state.sessionExpired)

setSessionExpiredHandler(async usedToken => {
  const user = auth.currentUser
  if (!user) return
  let sameToken = true
  try { sameToken = await user.getIdToken() === usedToken } catch { /* Phiên không thể làm mới. */ }
  // Request của tài khoản/phiên cũ không được đăng xuất tài khoản vừa đăng nhập.
  if (!sameToken || auth.currentUser?.uid !== user.uid) return
  state.sessionExpired = true
  try { await requestSignOut() } finally { setUser(null) }
})

function setUser(user) {
  if (state.user?.uid === user?.uid) return
  stopWatchingAssignment?.()
  stopWatchingAssignment = null
  state.user = user
  state.staffAssignment = null
  state.assignmentUnavailable = false
  if (!user) onAccessChanged?.()
}

async function loadStaffAssignment(user) {
  try {
    const assignment = await requestStaffAssignment(user)
    if (state.user?.uid !== user.uid) return
    state.staffAssignment = assignment
    state.assignmentUnavailable = false
    onAccessChanged?.()
    stopWatchingAssignment?.()
    stopWatchingAssignment = watchStaffAssignment(user, (nextAssignment) => {
      if (state.user?.uid !== user.uid) return
      state.staffAssignment = nextAssignment
      state.assignmentUnavailable = false
      onAccessChanged?.()
    }, () => {
      if (state.user?.uid !== user.uid) return
      state.staffAssignment = null
      state.assignmentUnavailable = true
      onAccessChanged?.()
    })
  } catch {
    if (state.user?.uid !== user.uid) return
    state.staffAssignment = null
    state.assignmentUnavailable = true
  }
}

export function getAccessDeniedReason() {
  if (state.assignmentUnavailable) return FORBIDDEN_REASON.unavailable
  const assignment = state.staffAssignment
  if (!assignment || !ADMIN_ROLES.includes(assignment.role)) return FORBIDDEN_REASON.notStaff
  return assignment.active ? null : FORBIDDEN_REASON.revoked
}

export function canAccessWarehouse(warehouseId) {
  if (getAccessDeniedReason() || typeof warehouseId !== 'string') return false
  const { role, warehouseIds } = state.staffAssignment
  return role === USER_ROLE.systemAdmin || (Array.isArray(warehouseIds) && warehouseIds.includes(warehouseId))
}

export function setAccessChangedHandler(handler) {
  onAccessChanged = handler
}

export function restoreSession() {
  restorePromise ??= (async () => {
    await auth.authStateReady()
    setUser(auth.currentUser)
    if (auth.currentUser) await loadStaffAssignment(auth.currentUser)
    onAuthStateChanged(auth, (user) => {
      if (state.user?.uid === user?.uid) return
      setUser(user)
      if (user) loadStaffAssignment(user)
    })
  })()
  return restorePromise
}

export async function signIn(email, password, { keepSignedIn = false } = {}) {
  if (state.isLoading) return null
  state.isLoading = true
  try {
    const user = await requestSignIn(email, password, keepSignedIn)
    state.sessionExpired = false
    setUser(user)
    await loadStaffAssignment(user)
    return user
  } finally {
    state.isLoading = false
  }
}

export async function signOut() {
  await requestSignOut()
  setUser(null)
}
