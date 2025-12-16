import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp,
  collection,
  query,
  orderBy,
  limit,
  addDoc,
  deleteDoc,
  where,
  getDocs,
  runTransaction
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { getWeaponById } from './weaponService'

// Firestore 集合名稱
const GAME_STATE_COLLECTION = 'gameState'
const ATTACKS_COLLECTION = 'attacks'
const ONLINE_USERS_COLLECTION = 'onlineUsers'

// 初始化遊戲狀態
export const initGameState = async () => {
  const gameStateRef = doc(db, GAME_STATE_COLLECTION, 'current')
  const gameStateSnap = await getDoc(gameStateRef)
  
  if (!gameStateSnap.exists()) {
    // 如果不存在，創建初始狀態
    await setDoc(gameStateRef, {
      treeHealth: 1000000,
      maxTreeHealth: 1000000,
      defeatedCount: 0,
      currentRound: 1,
      lastUpdate: serverTimestamp(),
      createdAt: serverTimestamp()
    })
  }
  
  return gameStateRef
}

// 獲取遊戲狀態
export const getGameState = async () => {
  const gameStateRef = doc(db, GAME_STATE_COLLECTION, 'current')
  const gameStateSnap = await getDoc(gameStateRef)
  
  if (gameStateSnap.exists()) {
    return gameStateSnap.data()
  }
  
  // 如果不存在，初始化
  await initGameState()
  const newSnap = await getDoc(gameStateRef)
  return newSnap.data()
}

// 監聽遊戲狀態變化（實時更新，優化：使用節流減少讀取頻率）
let lastGameStateTime = 0
const GAME_STATE_THROTTLE = 1000 // 1秒內最多觸發一次

export const subscribeGameState = (callback) => {
  const gameStateRef = doc(db, GAME_STATE_COLLECTION, 'current')
  
  return onSnapshot(gameStateRef, (snapshot) => {
    const now = Date.now()
    // 節流：1秒內最多觸發一次
    if (now - lastGameStateTime < GAME_STATE_THROTTLE) {
      return
    }
    lastGameStateTime = now
    
    if (snapshot.exists()) {
      const data = snapshot.data()
      callback({
        treeHealth: data.treeHealth || 1000000,
        maxTreeHealth: data.maxTreeHealth || 1000000,
        defeatedCount: data.defeatedCount || 0,
        currentRound: data.currentRound || 1
      })
    }
  })
}

// 攻擊樹（減少血量）- 使用武器 ID 和等級進行服務器端驗證
// 返回樹血量和更新後的用戶數據（包括金錢等）
export const attackTree = async (userId, userName, weaponId, weaponLevel = 1) => {
  const gameStateRef = doc(db, GAME_STATE_COLLECTION, 'current')
  const gameStateSnap = await getDoc(gameStateRef)
  
  if (!gameStateSnap.exists()) {
    await initGameState()
  }
  
  // 檢查用戶是否超過3天未上線（停止傷害計算）
  const userRef = doc(db, 'users', userId)
  const userSnap = await getDoc(userRef)
  
  if (!userSnap.exists()) {
    throw new Error('用戶不存在')
  }
  
  const userData = userSnap.data()
  const lastLogin = userData.lastLogin
  
  if (lastLogin) {
    // 將 Firestore Timestamp 轉換為 Date
    const lastLoginDate = lastLogin.toDate ? lastLogin.toDate() : new Date(lastLogin)
    const now = new Date()
    const daysSinceLogin = (now - lastLoginDate) / (1000 * 60 * 60 * 24) // 轉換為天數
    
    // 如果超過3天未上線，停止傷害計算
    if (daysSinceLogin > 3) {
      console.log(`用戶 ${userName} 已超過3天未上線（${daysSinceLogin.toFixed(1)}天），停止傷害計算`)
      // 返回當前血量和當前用戶數據
      const currentState = gameStateSnap.data()
      return {
        newHealth: currentState.treeHealth || 1000000,
        userData: {
          gold: userData.gold || 500,
          totalGoldEarned: userData.totalGoldEarned || 0,
          totalDamage: userData.totalDamage || 0
        }
      }
    }
  }
  
  // 從 Firestore 獲取武器數據（服務器端驗證）
  let weapon
  try {
    weapon = await getWeaponById(weaponId)
    if (!weapon) {
      throw new Error(`無效的武器 ID: ${weaponId}`)
    }
  } catch (error) {
    console.error('獲取武器數據失敗:', error)
    throw new Error('無法驗證武器數據')
  }
  
  // 計算實際傷害（考慮等級）
  // 升級公式：攻擊力 = 基礎攻擊 * (1 + (等級-1) * 0.5)
  const baseDamage = weapon.attack
  const damage = Math.floor(baseDamage * (1 + (weaponLevel - 1) * 0.5))
  
  // 驗證傷害範圍（防止異常值）
  if (damage < 1 || damage > 1000) {
    console.error(`傷害值異常: ${damage} (武器ID: ${weaponId}, 等級: ${weaponLevel})`)
    throw new Error('傷害值異常，請聯繫管理員')
  }
  
  // 計算金錢獎勵（後端計算，確保公平性）- 在事務外計算，因為是確定的值
  let goldGained = 0
  if (Math.random() <= weapon.goldChance) {
    goldGained = Math.max(0, Math.floor(
      Math.random() * (weapon.goldMax - weapon.goldMin + 1) + weapon.goldMin
    ))
  }
  
  // 在事務中更新樹血量和用戶數據（確保數據一致性）
  const result = await runTransaction(db, async (transaction) => {
    // 重新讀取以確保數據是最新的
    const gameStateSnap = await transaction.get(gameStateRef)
    const userSnap = await transaction.get(userRef)
    
    if (!gameStateSnap.exists()) {
      throw new Error('遊戲狀態不存在')
    }
    
    if (!userSnap.exists()) {
      throw new Error('用戶不存在')
    }
    
    // 重新計算傷害（基於事務中的最新數據）
    const currentGameState = gameStateSnap.data()
    const currentGameHealth = currentGameState.treeHealth || 1000000
    const finalNewHealth = Math.max(0, currentGameHealth - damage)
    
    // 重新獲取用戶數據（可能已被其他請求修改）
    const currentUserData = userSnap.data()
    const userCurrentGold = currentUserData.gold || 500
    const userCurrentTotalGoldEarned = currentUserData.totalGoldEarned || 0
    const userCurrentTotalDamage = currentUserData.totalDamage || 0
    
    // 計算新的用戶數據
    const finalNewGold = userCurrentGold + goldGained
    const finalNewTotalGoldEarned = userCurrentTotalGoldEarned + goldGained
    const finalNewTotalDamage = userCurrentTotalDamage + damage
    
    // 更新樹血量
    transaction.update(gameStateRef, {
      treeHealth: finalNewHealth,
      lastUpdate: serverTimestamp()
    })
    
    // 更新用戶數據（金錢、總傷害等）
    transaction.update(userRef, {
      gold: finalNewGold,
      totalGoldEarned: finalNewTotalGoldEarned,
      totalDamage: finalNewTotalDamage,
      lastUpdate: serverTimestamp()
    })
    
    // 返回更新後的數據
    return {
      newHealth: finalNewHealth,
      userData: {
        gold: finalNewGold,
        totalGoldEarned: finalNewTotalGoldEarned,
        totalDamage: finalNewTotalDamage,
        goldGained: goldGained
      }
    }
  })
  
  // 記錄攻擊（非阻塞，異步執行）
  addAttackRecord(userId, userName, damage, weapon.name).catch(err => {
    console.error('記錄攻擊失敗:', err)
  })
  
  // 如果樹被擊敗，處理擊敗邏輯（非阻塞）
  if (result.newHealth <= 0) {
    getDoc(gameStateRef).then(gameStateSnap => {
      if (gameStateSnap.exists()) {
        return handleTreeDefeated(gameStateRef, gameStateSnap.data())
      }
    }).catch(err => {
      console.error('處理樹擊敗失敗:', err)
    })
  }
  
  // 返回事務中計算的結果
  return result
}

// 攻擊記錄批量緩存（優化：減少寫入次數）
const attackBatchCache = new Map() // userId -> { totalDamage, count, lastFlush }
const BATCH_FLUSH_INTERVAL = 10000 // 10秒批量記錄一次
const MAX_BATCH_SIZE = 50 // 最多累積50次攻擊後強制刷新

// 記錄攻擊記錄（批量模式，每10秒或50次攻擊記錄一次）
const addAttackRecord = async (userId, userName, damage, weaponName) => {
  const now = Date.now()
  const cacheKey = userId
  
  // 獲取或創建緩存
  if (!attackBatchCache.has(cacheKey)) {
    attackBatchCache.set(cacheKey, {
      userId,
      userName,
      totalDamage: 0,
      count: 0,
      lastFlush: now,
      weaponName: weaponName || '無'
    })
  }
  
  const cache = attackBatchCache.get(cacheKey)
  cache.totalDamage += damage
  cache.count += 1
  cache.weaponName = weaponName || cache.weaponName
  
  // 檢查是否需要刷新（10秒或50次攻擊）
  const timeSinceFlush = now - cache.lastFlush
  const shouldFlush = timeSinceFlush >= BATCH_FLUSH_INTERVAL || cache.count >= MAX_BATCH_SIZE
  
  if (shouldFlush) {
    await flushAttackBatch(cacheKey)
  }
}

// 刷新攻擊記錄批次
const flushAttackBatch = async (cacheKey) => {
  const cache = attackBatchCache.get(cacheKey)
  if (!cache || cache.count === 0) return
  
  try {
    const attacksRef = collection(db, ATTACKS_COLLECTION)
    await addDoc(attacksRef, {
      userId: cache.userId || 'unknown',
      userName: cache.userName || '未知玩家',
      damage: cache.totalDamage,
      count: cache.count, // 記錄攻擊次數
      weaponName: cache.weaponName || '無',
      timestamp: serverTimestamp(),
      batchRecord: true // 標記為批量記錄
    })
    
    // 重置緩存
    cache.totalDamage = 0
    cache.count = 0
    cache.lastFlush = Date.now()
  } catch (error) {
    console.error('批量記錄攻擊失敗:', error)
  }
}

// 定期刷新所有緩存（確保數據不會丟失）
setInterval(() => {
  for (const cacheKey of attackBatchCache.keys()) {
    const cache = attackBatchCache.get(cacheKey)
    if (cache && cache.count > 0) {
      flushAttackBatch(cacheKey).catch(err => console.error('定期刷新攻擊記錄失敗:', err))
    }
  }
}, BATCH_FLUSH_INTERVAL)

// 處理樹被擊敗
const handleTreeDefeated = async (gameStateRef, currentState) => {
  await updateDoc(gameStateRef, {
    treeHealth: currentState.maxTreeHealth || 1000000,
    defeatedCount: (currentState.defeatedCount || 0) + 1,
    currentRound: (currentState.currentRound || 1) + 1,
    lastUpdate: serverTimestamp()
  })
  
  // 清理舊的攻擊記錄（保留最近100條）
  await cleanupOldAttacks()
}

// 清理舊的攻擊記錄（優化：限制保留數量，減少存儲費用）
const cleanupOldAttacks = async () => {
  try {
    const attacksRef = collection(db, ATTACKS_COLLECTION)
    const q = query(attacksRef, orderBy('timestamp', 'desc'))
    const snapshot = await getDocs(q)
    
    const attacks = snapshot.docs
    const MAX_ATTACKS = 200 // 只保留最近200條記錄（降低到200條）
    
    if (attacks.length > MAX_ATTACKS) {
      // 批量刪除舊記錄（每次最多刪除50條，避免一次性刪除太多）
      const toDelete = attacks.slice(MAX_ATTACKS)
      const batchSize = 50
      
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize)
        await Promise.all(batch.map(attackDoc => deleteDoc(attackDoc.ref)))
      }
      
      console.log(`清理了 ${toDelete.length} 條舊攻擊記錄`)
    }
  } catch (error) {
    console.error('清理攻擊記錄失敗:', error)
  }
}

// 獲取最近的攻擊記錄
export const getRecentAttacks = async (limitCount = 20) => {
  const attacksRef = collection(db, ATTACKS_COLLECTION)
  const q = query(attacksRef, orderBy('timestamp', 'desc'), limit(limitCount))
  const snapshot = await getDocs(q)
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))
}

// 監聽最近的攻擊記錄（實時更新，優化：使用節流減少讀取頻率）
let lastSnapshotTime = 0
const SNAPSHOT_THROTTLE = 2000 // 2秒內最多觸發一次

export const subscribeRecentAttacks = (callback, limitCount = 20) => {
  const attacksRef = collection(db, ATTACKS_COLLECTION)
  const q = query(attacksRef, orderBy('timestamp', 'desc'), limit(limitCount))
  
  return onSnapshot(q, (snapshot) => {
    const now = Date.now()
    // 節流：2秒內最多觸發一次
    if (now - lastSnapshotTime < SNAPSHOT_THROTTLE) {
      return
    }
    lastSnapshotTime = now
    
    const attacks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    callback(attacks)
  })
}

// 標記玩家在線
export const setUserOnline = async (userId, userData) => {
  const userRef = doc(db, ONLINE_USERS_COLLECTION, userId)
  await setDoc(userRef, {
    userId: userId, // Firestore 規則需要這個字段來驗證權限
    ...userData,
    lastActive: serverTimestamp(),
    isOnline: true
  })
}

// 標記玩家離線
export const setUserOffline = async (userId) => {
  const userRef = doc(db, ONLINE_USERS_COLLECTION, userId)
  await updateDoc(userRef, {
    isOnline: false,
    lastActive: serverTimestamp()
  })
}

// 更新玩家狀態
export const updateUserStatus = async (userId, updates) => {
  const userRef = doc(db, ONLINE_USERS_COLLECTION, userId)
  await updateDoc(userRef, {
    ...updates,
    lastActive: serverTimestamp()
  })
}

// 獲取在線玩家列表
export const getOnlineUsers = async () => {
  const usersRef = collection(db, ONLINE_USERS_COLLECTION)
  const q = query(usersRef, where('isOnline', '==', true))
  const snapshot = await getDocs(q)
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))
}

// 監聽在線玩家列表（實時更新，優化：使用節流減少讀取頻率）
let lastOnlineUsersTime = 0
const ONLINE_USERS_THROTTLE = 3000 // 3秒內最多觸發一次

export const subscribeOnlineUsers = (callback) => {
  const usersRef = collection(db, ONLINE_USERS_COLLECTION)
  const q = query(usersRef, where('isOnline', '==', true))
  
  return onSnapshot(q, (snapshot) => {
    const now = Date.now()
    // 節流：3秒內最多觸發一次
    if (now - lastOnlineUsersTime < ONLINE_USERS_THROTTLE) {
      return
    }
    lastOnlineUsersTime = now
    
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    callback(users)
  })
}

// 清理離線玩家（超過5分鐘未活動）
export const cleanupOfflineUsers = async () => {
  const usersRef = collection(db, ONLINE_USERS_COLLECTION)
  const snapshot = await getDocs(usersRef)
  const now = Date.now()
  const fiveMinutes = 5 * 60 * 1000
  
  for (const userDoc of snapshot.docs) {
    const userData = userDoc.data()
    if (userData.lastActive) {
      const lastActive = userData.lastActive.toMillis()
      if (now - lastActive > fiveMinutes && userData.isOnline) {
        await setUserOffline(userDoc.id)
      }
    }
  }
}

