/**
 * 檢查 Firestore 規則是否正確設置
 * 
 * 使用方法：
 * node scripts/checkFirestoreRules.js
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 讀取 Firebase 配置
const firebaseConfigPath = join(__dirname, '..', '.env')
let projectId = 'tree-game-fc972' // 默認值

try {
  const envContent = readFileSync(firebaseConfigPath, 'utf-8')
  const projectIdMatch = envContent.match(/VITE_FIREBASE_PROJECT_ID=(.+)/)
  if (projectIdMatch) {
    projectId = projectIdMatch[1].trim()
  }
} catch (error) {
  console.log('無法讀取 .env 文件，使用默認 projectId:', projectId)
}

// 初始化 Firebase Admin
try {
  initializeApp({
    projectId: projectId
  })
  console.log('✅ Firebase Admin 初始化成功')
} catch (error) {
  console.error('❌ Firebase Admin 初始化失敗:', error.message)
  console.log('\n請確保：')
  console.log('1. 已設置 GOOGLE_APPLICATION_CREDENTIALS 環境變量')
  console.log('2. 或者已通過 gcloud auth application-default login 登入')
  process.exit(1)
}

const db = getFirestore()

console.log('\n📋 Firestore 規則檢查指南\n')
console.log('請在 Firebase Console 中檢查以下規則：\n')
console.log('1. 前往：https://console.firebase.google.com/')
console.log('2. 選擇專案：', projectId)
console.log('3. 進入「Firestore Database」→「規則」\n')
console.log('4. 確認 users 集合的 update 規則為：\n')
console.log('   match /users/{userId} {')
console.log('     allow read: if true;')
console.log('     allow create: if request.auth != null && request.auth.uid == userId;')
console.log('     allow update: if request.auth != null;  // ← 這行很重要！')
console.log('     allow delete: if isAdmin() || (request.auth != null && request.auth.uid == userId);')
console.log('   }\n')
console.log('5. 如果規則不同，請更新並點擊「發布」\n')
console.log('6. 規則更新後需要等待幾秒鐘才會生效\n')

// 嘗試讀取一個測試文檔來驗證連接
try {
  const testRef = db.collection('users').limit(1)
  const snapshot = await testRef.get()
  console.log('✅ Firestore 連接正常')
  console.log(`   找到 ${snapshot.size} 個用戶文檔\n`)
} catch (error) {
  console.error('❌ Firestore 連接失敗:', error.message)
  console.log('\n請檢查：')
  console.log('1. Firebase 專案 ID 是否正確')
  console.log('2. 是否有權限訪問 Firestore')
}

console.log('💡 提示：')
console.log('如果規則已更新但仍遇到權限錯誤，請：')
console.log('1. 等待 10-30 秒讓規則生效')
console.log('2. 清除瀏覽器緩存並重新載入頁面')
console.log('3. 檢查瀏覽器控制台的詳細錯誤信息\n')

