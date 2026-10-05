import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Cấu hình ứng dụng Web công khai; quyền truy cập dữ liệu do Firestore Rules quyết định.
const app = initializeApp({
  apiKey: 'AIzaSyBOuxJpkHSAr9rFCaJJijFA5xT4lTVs3CU',
  authDomain: 'reshare-13234.firebaseapp.com',
  projectId: 'reshare-13234',
  appId: '1:627512874676:web:1db0efab8857e3a68ca9e1',
})

export const auth = getAuth(app)
export const db = getFirestore(app)
