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
  getDocs
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

// 監聽遊戲狀態變化（實時更新）
export const subscribeGameState = (callback) => {
  const gameStateRef = doc(db, GAME_STATE_COLLECTION, 'current')
  
  return onSnapshot(gameStateRef, (snapshot) => {
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
export const attackTree = async (userId, userName, weaponId, weaponLevel = 1) => {
  const gameStateRef = doc(db, GAME_STATE_COLLECTION, 'current')
  const gameStateSnap = await getDoc(gameStateRef)
  
  if (!gameStateSnap.exists()) {
    await initGameState()
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
  
  const currentState = gameStateSnap.data()
  const newHealth = Math.max(0, (currentState.treeHealth || 1000000) - damage)
  
  // 更新樹血量
  await updateDoc(gameStateRef, {
    treeHealth: newHealth,
    lastUpdate: serverTimestamp()
  })
  
  // 記錄攻擊
  await addAttackRecord(userId, userName, damage, weapon.name)
  
  // 如果樹被擊敗
  if (newHealth <= 0) {
    await handleTreeDefeated(gameStateRef, currentState)
  }
  
  return newHealth
}

// 記錄攻擊記錄
const addAttackRecord = async (userId, userName, damage, weaponName) => {
  const attacksRef = collection(db, ATTACKS_COLLECTION)
  await addDoc(attacksRef, {
    userId: userId || 'unknown',
    userName: userName || '未知玩家',
    damage: damage || 0,
    weaponName: weaponName || '無',
    timestamp: serverTimestamp()
  })
}

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

// 清理舊的攻擊記錄
const cleanupOldAttacks = async () => {
  const attacksRef = collection(db, ATTACKS_COLLECTION)
  const q = query(attacksRef, orderBy('timestamp', 'desc'))
  const snapshot = await getDocs(q)
  
  const attacks = snapshot.docs
  if (attacks.length > 100) {
    // 刪除超過100條的舊記錄
    const toDelete = attacks.slice(100)
    for (const attackDoc of toDelete) {
      await deleteDoc(attackDoc.ref)
    }
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

// 監聽最近的攻擊記錄（實時更新）
export const subscribeRecentAttacks = (callback, limitCount = 20) => {
  const attacksRef = collection(db, ATTACKS_COLLECTION)
  const q = query(attacksRef, orderBy('timestamp', 'desc'), limit(limitCount))
  
  return onSnapshot(q, (snapshot) => {
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

// 監聽在線玩家列表（實時更新）
export const subscribeOnlineUsers = (callback) => {
  const usersRef = collection(db, ONLINE_USERS_COLLECTION)
  const q = query(usersRef, where('isOnline', '==', true))
  
  return onSnapshot(q, (snapshot) => {
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

