import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { readAppCheckConfig } from './app-check.js'

// Cấu hình ứng dụng Web công khai; quyền truy cập dữ liệu do Firestore Rules quyết định.
const app = initializeApp({
  apiKey: 'AIzaSyBOuxJpkHSAr9rFCaJJijFA5xT4lTVs3CU',
  authDomain: 'reshare-13234.firebaseapp.com',
  projectId: 'reshare-13234',
  appId: '1:627512874676:web:1db0efab8857e3a68ca9e1',
})

// RC1D-145: App Check phải khởi tạo trước Auth/Firestore để mọi request Firestore kèm token.
// App Check chỉ chứng minh request đến từ Web Admin thật; quyền nghiệp vụ vẫn do Firebase Auth + Firestore Rules.
const appCheckConfig = readAppCheckConfig(import.meta.env)
if (appCheckConfig) {
  if (appCheckConfig.debugToken) self.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckConfig.debugToken
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckConfig.siteKey),
    isTokenAutoRefreshEnabled: true,
  })
}

export const auth = getAuth(app)
export const db = getFirestore(app)
