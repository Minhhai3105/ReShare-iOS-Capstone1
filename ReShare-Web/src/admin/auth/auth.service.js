import {
  browserLocalPersistence,
  browserSessionPersistence,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
} from 'firebase/auth'
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore'
import { AUTH_ERROR } from './auth.constants'
import { auth, db } from './firebase'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isAdminEmail(email) {
  return EMAIL_PATTERN.test(email)
}

export function normalizeAuthError(error) {
  const code = error?.code
  const status = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email']
    .includes(code) ? AUTH_ERROR.invalidCredentials
    : ['auth/network-request-failed', 'unavailable', 'deadline-exceeded'].includes(code) ? AUTH_ERROR.network
      : AUTH_ERROR.server
  return Object.assign(new Error(error?.message || 'Không thể xác thực'), { status, cause: error })
}

export async function requestSignIn(email, password, keepSignedIn) {
  try {
    await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence)
    return (await signInWithEmailAndPassword(auth, email.trim(), password)).user
  } catch (error) {
    throw normalizeAuthError(error)
  }
}

// Chỉ đọc từ server để không dùng quyền cũ trong cache khi phân công đã bị thu hồi.
export async function requestStaffAssignment(user) {
  try {
    const snapshot = await getDocFromServer(doc(db, 'staff_assignments', user.uid))
    return snapshot.exists() ? snapshot.data() : null
  } catch (error) {
    throw normalizeAuthError(error)
  }
}

export function watchStaffAssignment(user, callback, onError) {
  return onSnapshot(doc(db, 'staff_assignments', user.uid), (snapshot) => {
    if (!snapshot.metadata.fromCache) callback(snapshot.exists() ? snapshot.data() : null)
  }, (error) => onError(normalizeAuthError(error)))
}

export async function requestPasswordReset(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim())
  } catch (error) {
    throw normalizeAuthError(error)
  }
}

export async function requestPasswordChange(currentPassword, newPassword) {
  const user = auth.currentUser
  try {
    if (!user?.email) throw Object.assign(new Error('No signed-in email account'), { code: 'auth/no-current-user' })
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword))
    if (auth.currentUser !== user) throw Object.assign(new Error('Session changed'), { code: 'auth/no-current-user' })
    await updatePassword(user, newPassword)
  } catch (error) {
    throw normalizeAuthError(error)
  }
}

export async function requestSignOut() {
  await firebaseSignOut(auth)
}
