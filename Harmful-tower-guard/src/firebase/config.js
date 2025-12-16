import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Firebase 配置
// 從環境變量讀取，如果沒有則使用默認值（開發模式）
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "your-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "tree-game-fc972.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "tree-game-fc972",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "tree-game-fc972.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "your-app-id"
}

// 生產環境檢查配置
if (import.meta.env.PROD) {
  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']
  const missingFields = requiredFields.filter(field => 
    !firebaseConfig[field] || firebaseConfig[field].includes('your-') || firebaseConfig[field] === '123456789'
  )
  
  if (missingFields.length > 0) {
    console.error('❌ Firebase 配置不完整！缺少以下字段：', missingFields)
    console.error('請設置環境變量或創建 .env 文件')
  }
}

// 初始化 Firebase
const app = initializeApp(firebaseConfig)

// 初始化 Authentication
export const auth = getAuth(app)

// 初始化 Firestore
export const db = getFirestore(app)

// Google 登入提供者
export const googleProvider = new GoogleAuthProvider()

export default app

