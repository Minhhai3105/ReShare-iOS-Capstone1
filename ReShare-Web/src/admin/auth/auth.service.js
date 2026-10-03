import {
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
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

export async function requestSignOut() {
  await firebaseSignOut(auth)
}
