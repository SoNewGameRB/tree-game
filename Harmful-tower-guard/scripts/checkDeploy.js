// 部署前檢查腳本
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

console.log('🔍 檢查部署配置...\n')

let hasError = false

// 檢查 .env 文件
const envPath = join(rootDir, '.env')
if (!existsSync(envPath)) {
  console.log('⚠️  警告: .env 文件不存在')
  console.log('   建議創建 .env 文件並設置 Firebase 配置')
  console.log('   參考: .env.example\n')
} else {
  console.log('✅ .env 文件存在')
  
  // 讀取並檢查環境變量
  const envContent = readFileSync(envPath, 'utf8')
  const requiredVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
  ]
  
  const missingVars = requiredVars.filter(varName => {
    const regex = new RegExp(`^${varName}=`, 'm')
    return !regex.test(envContent)
  })
  
  if (missingVars.length > 0) {
    console.log('❌ 缺少以下環境變量：')
    missingVars.forEach(v => console.log(`   - ${v}`))
    hasError = true
  } else {
    console.log('✅ 所有必需的環境變量已設置\n')
  }
}

// 檢查 dist 目錄
const distPath = join(rootDir, 'dist')
if (!existsSync(distPath)) {
  console.log('⚠️  警告: dist 目錄不存在')
  console.log('   請先運行: npm run build\n')
  hasError = true
} else {
  console.log('✅ dist 目錄存在')
  
  // 檢查 index.html
  const indexPath = join(distPath, 'index.html')
  if (!existsSync(indexPath)) {
    console.log('❌ dist/index.html 不存在')
    hasError = true
  } else {
    console.log('✅ dist/index.html 存在\n')
  }
}

// 檢查 firebase.json
const firebaseJsonPath = join(rootDir, 'firebase.json')
if (!existsSync(firebaseJsonPath)) {
  console.log('❌ firebase.json 不存在')
  hasError = true
} else {
  console.log('✅ firebase.json 存在')
}

// 檢查 .firebaserc
const firebasercPath = join(rootDir, '.firebaserc')
if (!existsSync(firebasercPath)) {
  console.log('❌ .firebaserc 不存在')
  hasError = true
} else {
  console.log('✅ .firebaserc 存在')
  
  // 檢查專案 ID
  const firebaserc = JSON.parse(readFileSync(firebasercPath, 'utf8'))
  if (firebaserc.projects?.default === 'tree-game-fc972') {
    console.log('✅ Firebase 專案 ID 正確: tree-game-fc972\n')
  } else {
    console.log('⚠️  Firebase 專案 ID 可能不正確\n')
  }
}

// 總結
console.log('═══════════════════════════════════════════════════')
if (hasError) {
  console.log('❌ 檢查失敗！請修復上述問題後再部署。')
  process.exit(1)
} else {
  console.log('✅ 所有檢查通過！可以開始部署。')
  console.log('\n運行以下命令部署：')
  console.log('  npm run deploy')
  console.log('或')
  console.log('  firebase deploy --only hosting')
}
console.log('═══════════════════════════════════════════════════\n')

