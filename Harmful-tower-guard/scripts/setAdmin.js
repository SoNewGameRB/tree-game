// 設置管理員帳號 - 使用 Firebase Admin SDK 繞過 Firestore 規則
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 讀取 Firebase Admin SDK 金鑰
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../tree-game-fc972-firebase-adminsdk-fbsvc-bf73fee52b.json'), 'utf8')
)

// 初始化 Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()
const USERS_COLLECTION = 'users'

// 獲取命令行參數
const args = process.argv.slice(2)
const command = args[0]
const identifier = args[1] // 用戶名稱或 UID
const isAdmin = args[2] !== 'false' // 默認為 true，設置為 false 可以取消管理員權限

/**
 * 通過用戶名稱查找用戶並設置管理員權限
 */
async function setAdminByName(displayName, adminStatus = true) {
  try {
    console.log(`🔍 正在查找用戶名稱: "${displayName}"...`)
    
    const usersRef = db.collection(USERS_COLLECTION)
    const snapshot = await usersRef.where('displayName', '==', displayName).get()
    
    if (snapshot.empty) {
      console.error(`❌ 找不到用戶名稱: "${displayName}"`)
      console.log('\n💡 提示：')
      console.log('   1. 確認用戶名稱是否正確')
      console.log('   2. 用戶可能需要先登入一次才會創建文檔')
      console.log('   3. 可以使用 list-users 命令查看所有用戶')
      return
    }
    
    if (snapshot.size > 1) {
      console.warn(`⚠️  找到多個同名用戶 (${snapshot.size} 個)，將全部設置為管理員`)
    }
    
    const updatePromises = []
    snapshot.forEach((doc) => {
      const userData = doc.data()
      updatePromises.push(
        doc.ref.update({
          isAdmin: adminStatus,
          lastUpdate: admin.firestore.FieldValue.serverTimestamp()
        })
      )
      console.log(`✅ 找到用戶: ${userData.displayName} (UID: ${doc.id})`)
    })
    
    await Promise.all(updatePromises)
    
    console.log(`\n✅ 成功！已將 ${snapshot.size} 個用戶設置為 ${adminStatus ? '管理員' : '普通用戶'}`)
  } catch (error) {
    console.error('❌ 設置管理員失敗:', error.message)
    process.exit(1)
  }
}

/**
 * 通過 UID 設置管理員權限
 */
async function setAdminByUid(uid, adminStatus = true) {
  try {
    console.log(`🔍 正在查找用戶 UID: "${uid}"...`)
    
    const userRef = db.collection(USERS_COLLECTION).doc(uid)
    const userDoc = await userRef.get()
    
    if (!userDoc.exists) {
      console.error(`❌ 找不到用戶 UID: "${uid}"`)
      console.log('\n💡 提示：')
      console.log('   1. 確認 UID 是否正確')
      console.log('   2. 用戶可能需要先登入一次才會創建文檔')
      console.log('   3. 可以使用 list-users 命令查看所有用戶')
      return
    }
    
    const userData = userDoc.data()
    console.log(`✅ 找到用戶: ${userData.displayName || '未知'} (UID: ${uid})`)
    
    await userRef.update({
      isAdmin: adminStatus,
      lastUpdate: admin.firestore.FieldValue.serverTimestamp()
    })
    
    console.log(`\n✅ 成功！已將用戶設置為 ${adminStatus ? '管理員' : '普通用戶'}`)
  } catch (error) {
    console.error('❌ 設置管理員失敗:', error.message)
    process.exit(1)
  }
}

/**
 * 列出所有用戶
 */
async function listUsers() {
  try {
    console.log('🔍 正在獲取所有用戶...\n')
    
    const usersRef = db.collection(USERS_COLLECTION)
    const snapshot = await usersRef.orderBy('displayName').get()
    
    if (snapshot.empty) {
      console.log('📭 目前沒有任何用戶')
      return
    }
    
    console.log(`📊 共找到 ${snapshot.size} 個用戶:\n`)
    console.log('名稱'.padEnd(20) + 'UID'.padEnd(30) + '管理員')
    console.log('-'.repeat(70))
    
    snapshot.forEach((doc) => {
      const data = doc.data()
      const displayName = data.displayName || '未知'
      const uid = doc.id
      const isAdminUser = data.isAdmin === true ? '✅ 是' : '❌ 否'
      console.log(displayName.padEnd(20) + uid.padEnd(30) + isAdminUser)
    })
    
    console.log('\n💡 使用說明:')
    console.log('   設置管理員: node scripts/setAdmin.js set-by-name <用戶名稱>')
    console.log('   取消管理員: node scripts/setAdmin.js set-by-name <用戶名稱> false')
    console.log('   通過 UID 設置: node scripts/setAdmin.js set-by-uid <UID>')
  } catch (error) {
    console.error('❌ 獲取用戶列表失敗:', error.message)
    process.exit(1)
  }
}

/**
 * 重置所有玩家的遊戲數據（保留用戶資料，只清除遊戲進度）
 */
async function resetAllGameData() {
  try {
    console.log('⚠️  警告：此操作將重置所有玩家的遊戲數據！')
    console.log('   將清除：背包、傷害、成就、金錢等遊戲進度')
    console.log('   將保留：用戶名稱、Email 等基本信息')
    console.log('   樹的血量將恢復到 1000000\n')
    
    // 先顯示將要重置的用戶數量
    console.log('🔍 正在獲取所有用戶...')
    const usersRef = db.collection(USERS_COLLECTION)
    const usersSnapshot = await usersRef.get()
    
    if (usersSnapshot.empty) {
      console.log('📭 目前沒有任何用戶資料')
      return
    }
    
    console.log(`\n📊 將重置 ${usersSnapshot.size} 個用戶的遊戲數據：`)
    let index = 0
    usersSnapshot.forEach((doc) => {
      const data = doc.data()
      const name = data.displayName || '未知'
      index++
      console.log(`   ${index}. ${name} (${doc.id})`)
    })
    
    console.log('\n⚠️  確認重置？輸入 "YES" 並按 Enter 繼續，或按 Ctrl+C 取消...\n')
    
    // 等待用戶輸入確認
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    
    const answer = await new Promise((resolve) => {
      rl.question('> ', resolve)
    })
    rl.close()
    
    if (answer.trim() !== 'YES') {
      console.log('\n❌ 操作已取消')
      return
    }
    
    console.log(`\n🔄 正在重置 ${usersSnapshot.size} 個用戶的遊戲數據...`)
    
    // 重置所有用戶的遊戲數據
    const updatePromises = []
    usersSnapshot.forEach((doc) => {
      const existingData = doc.data()
      
      // 構建更新數據，只包含需要重置的字段
      const updateData = {
        // 清除遊戲數據
        inventory: [],
        totalDamage: 0,
        totalGoldEarned: 0,
        totalDrawCount: 0,
        totalSacrificeCount: 0,
        legendaryCount: 0,
        epicCount: 0,
        maxWeaponLevel: 0,
        treeDefeatedCount: 0,
        achievements: [],
        gold: 500, // 重置為初始金錢
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      }
      
      // 如果 currentAxeIndex 字段存在，刪除它；否則不設置
      if (existingData.currentAxeIndex !== undefined && existingData.currentAxeIndex !== null) {
        // 使用 FieldValue.delete() 刪除字段，而不是設置為 null
        updateData.currentAxeIndex = admin.firestore.FieldValue.delete()
      }
      
      updatePromises.push(doc.ref.update(updateData))
    })
    
    await Promise.all(updatePromises)
    console.log(`✅ 已重置 ${usersSnapshot.size} 個用戶的遊戲數據`)
    
    // 重置樹的血量
    console.log('\n🌳 正在重置樹的血量...')
    const gameStateRef = db.collection('gameState').doc('current')
    const gameStateDoc = await gameStateRef.get()
    
    if (gameStateDoc.exists) {
      await gameStateRef.update({
        treeHealth: 1000000,
        maxTreeHealth: 1000000,
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      })
      console.log('✅ 樹的血量已重置為 1000000 / 1000000')
    } else {
      // 如果遊戲狀態不存在，創建一個新的
      await gameStateRef.set({
        treeHealth: 1000000,
        maxTreeHealth: 1000000,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      })
      console.log('✅ 已創建新的遊戲狀態，樹的血量為 1000000 / 1000000')
    }
    
    console.log('\n🎉 完成！所有遊戲數據已重置')
  } catch (error) {
    if (error.message.includes('canceled') || error.code === 'SIGINT') {
      console.log('\n\n❌ 操作已取消')
      process.exit(0)
    }
    console.error('❌ 重置數據失敗:', error.message)
    process.exit(1)
  }
}

/**
 * 清除所有玩家資料（僅管理員可用，使用 Admin SDK 繞過規則）
 */
async function clearAllUsers() {
  try {
    console.log('⚠️  警告：此操作將刪除所有用戶資料！')
    console.log('   此操作無法復原！\n')
    
    // 先顯示將要刪除的用戶數量
    console.log('🔍 正在獲取所有用戶...')
    const usersRef = db.collection(USERS_COLLECTION)
    const snapshot = await usersRef.get()
    
    if (snapshot.empty) {
      console.log('📭 目前沒有任何用戶資料')
      return
    }
    
    console.log(`\n📊 將刪除 ${snapshot.size} 個用戶資料：`)
    let index = 0
    snapshot.forEach((doc) => {
      const data = doc.data()
      const name = data.displayName || '未知'
      index++
      console.log(`   ${index}. ${name} (${doc.id})`)
    })
    
    console.log('\n⚠️  確認刪除？輸入 "YES" 並按 Enter 繼續，或按 Ctrl+C 取消...\n')
    
    // 等待用戶輸入確認
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    
    const answer = await new Promise((resolve) => {
      rl.question('> ', resolve)
    })
    rl.close()
    
    if (answer.trim() !== 'YES') {
      console.log('\n❌ 操作已取消')
      return
    }
    
    console.log(`\n🗑️  正在刪除 ${snapshot.size} 個用戶資料...`)
    
    const deletePromises = []
    snapshot.forEach((doc) => {
      deletePromises.push(doc.ref.delete())
    })
    
    await Promise.all(deletePromises)
    
    console.log(`\n✅ 成功！已刪除 ${snapshot.size} 個用戶資料`)
  } catch (error) {
    if (error.message.includes('canceled') || error.code === 'SIGINT') {
      console.log('\n\n❌ 操作已取消')
      process.exit(0)
    }
    console.error('❌ 清除資料失敗:', error.message)
    process.exit(1)
  }
}

/**
 * 重置所有數據，只保留武器和樹的資料
 */
async function resetAllDataKeepWeaponsAndTree() {
  try {
    console.log('⚠️  警告：此操作將清除所有用戶數據、攻擊記錄和聊天消息！')
    console.log('   將保留：武器資料（weapons）、樹的資料（gameState）')
    console.log('   將清除：用戶資料（users）、攻擊記錄（attacks）、聊天消息（chatMessages）、在線用戶（onlineUsers）')
    console.log('   此操作無法復原！\n')
    
    // 統計將要清除的數據
    console.log('🔍 正在統計數據...')
    
    const usersRef = db.collection(USERS_COLLECTION)
    const usersSnapshot = await usersRef.get()
    
    const attacksRef = db.collection('attacks')
    const attacksSnapshot = await attacksRef.get()
    
    const chatRef = db.collection('chatMessages')
    const chatSnapshot = await chatRef.get()
    
    const onlineUsersRef = db.collection('onlineUsers')
    const onlineUsersSnapshot = await onlineUsersRef.get()
    
    console.log(`\n📊 數據統計：`)
    console.log(`   用戶資料：${usersSnapshot.size} 筆`)
    console.log(`   攻擊記錄：${attacksSnapshot.size} 筆`)
    console.log(`   聊天消息：${chatSnapshot.size} 筆`)
    console.log(`   在線用戶：${onlineUsersSnapshot.size} 筆`)
    console.log(`\n   將保留：武器資料、樹的資料`)
    
    console.log('\n⚠️  確認重置？輸入 "YES" 並按 Enter 繼續，或按 Ctrl+C 取消...\n')
    
    // 等待用戶輸入確認
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    
    const answer = await new Promise((resolve) => {
      rl.question('> ', resolve)
    })
    rl.close()
    
    if (answer.trim() !== 'YES') {
      console.log('\n❌ 操作已取消')
      return
    }
    
    console.log('\n🗑️  正在清除數據...\n')
    
    // 1. 清除所有用戶資料
    if (usersSnapshot.size > 0) {
      console.log(`🗑️  正在刪除 ${usersSnapshot.size} 個用戶資料...`)
      const userDeletePromises = []
      usersSnapshot.forEach((doc) => {
        userDeletePromises.push(doc.ref.delete())
      })
      await Promise.all(userDeletePromises)
      console.log(`✅ 已刪除 ${usersSnapshot.size} 個用戶資料`)
    } else {
      console.log('✅ 沒有用戶資料需要清除')
    }
    
    // 2. 清除所有攻擊記錄
    if (attacksSnapshot.size > 0) {
      console.log(`🗑️  正在刪除 ${attacksSnapshot.size} 筆攻擊記錄...`)
      const attackDeletePromises = []
      attacksSnapshot.forEach((doc) => {
        attackDeletePromises.push(doc.ref.delete())
      })
      await Promise.all(attackDeletePromises)
      console.log(`✅ 已刪除 ${attacksSnapshot.size} 筆攻擊記錄`)
    } else {
      console.log('✅ 沒有攻擊記錄需要清除')
    }
    
    // 3. 清除所有聊天消息
    if (chatSnapshot.size > 0) {
      console.log(`🗑️  正在刪除 ${chatSnapshot.size} 筆聊天消息...`)
      const chatDeletePromises = []
      chatSnapshot.forEach((doc) => {
        chatDeletePromises.push(doc.ref.delete())
      })
      await Promise.all(chatDeletePromises)
      console.log(`✅ 已刪除 ${chatSnapshot.size} 筆聊天消息`)
    } else {
      console.log('✅ 沒有聊天消息需要清除')
    }
    
    // 4. 清除所有在線用戶
    if (onlineUsersSnapshot.size > 0) {
      console.log(`🗑️  正在刪除 ${onlineUsersSnapshot.size} 個在線用戶記錄...`)
      const onlineDeletePromises = []
      onlineUsersSnapshot.forEach((doc) => {
        onlineDeletePromises.push(doc.ref.delete())
      })
      await Promise.all(onlineDeletePromises)
      console.log(`✅ 已刪除 ${onlineUsersSnapshot.size} 個在線用戶記錄`)
    } else {
      console.log('✅ 沒有在線用戶記錄需要清除')
    }
    
    // 5. 重置樹的血量（如果存在）
    console.log('\n🌳 正在重置樹的血量...')
    const gameStateRef = db.collection('gameState').doc('current')
    const gameStateDoc = await gameStateRef.get()
    
    if (gameStateDoc.exists) {
      await gameStateRef.update({
        treeHealth: 1000000,
        maxTreeHealth: 1000000,
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      })
      console.log('✅ 樹的血量已重置為 1000000 / 1000000')
    } else {
      // 如果遊戲狀態不存在，創建一個新的
      await gameStateRef.set({
        treeHealth: 1000000,
        maxTreeHealth: 1000000,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      })
      console.log('✅ 已創建新的遊戲狀態，樹的血量為 1000000 / 1000000')
    }
    
    // 6. 確認武器資料保留
    const weaponsRef = db.collection('weapons')
    const weaponsSnapshot = await weaponsRef.get()
    console.log(`\n✅ 武器資料已保留（${weaponsSnapshot.size} 把武器）`)
    
    console.log('\n🎉 完成！數據重置成功')
    console.log('   已保留：武器資料、樹的資料')
    console.log('   已清除：用戶資料、攻擊記錄、聊天消息、在線用戶')
  } catch (error) {
    if (error.message.includes('canceled') || error.code === 'SIGINT') {
      console.log('\n\n❌ 操作已取消')
      process.exit(0)
    }
    console.error('❌ 重置數據失敗:', error.message)
    console.error('錯誤詳情:', error)
    process.exit(1)
  }
}

// 主程序
async function main() {
  console.log('🚀 Firebase 管理員設置工具\n')
  
  if (!command) {
    console.log('使用方法:')
    console.log('  node scripts/setAdmin.js list                              - 列出所有用戶')
    console.log('  node scripts/setAdmin.js set-by-name <用戶名稱>            - 通過名稱設置管理員')
    console.log('  node scripts/setAdmin.js set-by-name <用戶名稱> false      - 取消管理員權限')
    console.log('  node scripts/setAdmin.js set-by-uid <UID>                  - 通過 UID 設置管理員')
    console.log('  node scripts/setAdmin.js reset-game                        - 重置所有玩家的遊戲數據（保留用戶資料）')
    console.log('  node scripts/setAdmin.js clear-all                         - 清除所有玩家資料（危險操作）')
    console.log('  node scripts/setAdmin.js reset-all                         - 重置所有數據，只保留武器和樹的資料（危險操作）\n')
    console.log('範例:')
    console.log('  node scripts/setAdmin.js list')
    console.log('  node scripts/setAdmin.js set-by-name admin')
    console.log('  node scripts/setAdmin.js set-by-uid abc123def456')
    console.log('  node scripts/setAdmin.js reset-game                        - 重置遊戲數據和樹的血量')
    console.log('  node scripts/setAdmin.js reset-all                         - 清除所有數據，只保留武器和樹')
    process.exit(0)
  }
  
  switch (command) {
    case 'list':
      await listUsers()
      break
      
    case 'set-by-name':
      if (!identifier) {
        console.error('❌ 錯誤：請提供用戶名稱')
        console.log('使用方法: node scripts/setAdmin.js set-by-name <用戶名稱>')
        process.exit(1)
      }
      await setAdminByName(identifier, isAdmin)
      break
      
    case 'set-by-uid':
      if (!identifier) {
        console.error('❌ 錯誤：請提供用戶 UID')
        console.log('使用方法: node scripts/setAdmin.js set-by-uid <UID>')
        process.exit(1)
      }
      await setAdminByUid(identifier, isAdmin)
      break
      
    case 'reset-game':
      await resetAllGameData()
      break
      
    case 'clear-all':
      await clearAllUsers()
      break
      
    case 'reset-all':
      await resetAllDataKeepWeaponsAndTree()
      break
      
    default:
      console.error(`❌ 未知命令: ${command}`)
      console.log('使用 "node scripts/setAdmin.js" 查看使用說明')
      process.exit(1)
  }
  
  // 關閉連接
  await admin.app().delete()
  process.exit(0)
}

// 運行主程序
main().catch((error) => {
  console.error('❌ 發生錯誤:', error)
  process.exit(1)
})

