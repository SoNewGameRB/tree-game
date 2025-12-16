import { 
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth'
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  collection,
  limit
} from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { isAdmin } from './admin'

// 用戶集合名稱
const USERS_COLLECTION = 'users'

// 檢查用戶是否應被設置為管理員（通過 email 或名稱）
const shouldBeAdmin = (email, displayName) => {
  if (email && isAdmin(email)) {
    return true
  }
  // 可以添加名稱檢查邏輯（如果需要）
  // 例如：檢查名稱是否在管理員名稱列表中
  return false
}

// 檢查名稱是否已被使用
// 將帳號標準化為小寫（大小寫不敏感）
const normalizeUsername = (username) => {
  return username ? username.toLowerCase().trim() : ''
}

export const checkNameExists = async (name) => {
  try {
    const normalizedName = normalizeUsername(name)
    const usersRef = collection(db, USERS_COLLECTION)
    const q = query(usersRef, where('usernameLower', '==', normalizedName))
    const querySnapshot = await getDocs(q)
    return !querySnapshot.empty
  } catch (error) {
    console.error('檢查名稱失敗:', error)
    return false
  }
}

// 根據名稱查找用戶（大小寫不敏感）
// 如果有多個相同帳號，返回創建時間最早的（原始帳號）
export const findUserByName = async (name) => {
  try {
    const normalizedName = normalizeUsername(name)
    const usersRef = collection(db, USERS_COLLECTION)
    const q = query(usersRef, where('usernameLower', '==', normalizedName))
    const querySnapshot = await getDocs(q)
    
    if (!querySnapshot.empty) {
      // 如果有多個匹配，選擇創建時間最早的（原始帳號）
      const docs = querySnapshot.docs
      if (docs.length > 1) {
        console.warn(`警告：找到 ${docs.length} 個相同帳號 "${name}"，將使用創建時間最早的帳號`)
        
        // 排序：優先使用有 createdAt 且時間最早的
        docs.sort((a, b) => {
          const aTime = a.data().createdAt?.toMillis?.() || a.data().createdAt?.seconds * 1000 || 0
          const bTime = b.data().createdAt?.toMillis?.() || b.data().createdAt?.seconds * 1000 || 0
          return aTime - bTime // 升序，最早的在前
        })
      }
      
      const userDoc = docs[0]
      return {
        id: userDoc.id,
        uid: userDoc.id, // 確保 uid 存在
        ...userDoc.data()
      }
    }
    return null
  } catch (error) {
    console.error('查找用戶失敗:', error)
    return null
  }
}

// 創建新用戶（使用匿名認證 + Firestore，帶密碼）
export const createUserWithName = async (name, password, email = null) => {
  try {
    // 驗證密碼
    if (!password || password.length < 4) {
      throw new Error('密碼至少需要 4 個字元')
    }
    
    // 先檢查名稱是否已存在（強制唯一性，大小寫不敏感）
    const existingUser = await findUserByName(name)
    if (existingUser) {
      throw new Error(`帳號 "${name}" 已被使用，請選擇其他帳號或使用登入功能`)
    }
    
    // 先進行匿名認證
    const userCredential = await signInAnonymously(auth)
    const firebaseUser = userCredential.user
    
    // 檢查是否應設置為管理員
    const isAdminUser = shouldBeAdmin(email, name)
    const normalizedName = normalizeUsername(name)
    
    // 在 Firestore 中創建用戶資料
    const userRef = doc(db, USERS_COLLECTION, firebaseUser.uid)
    await setDoc(userRef, {
      uid: firebaseUser.uid,
      displayName: name, // 保存原始帳號（保持大小寫）
      usernameLower: normalizedName, // 保存小寫版本用於查詢（大小寫不敏感）
      password: password, // 保存密碼（生產環境應使用 hash）
      email: email || null,
      photoURL: null,
      isAdmin: isAdminUser, // 設置管理員標記
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      totalDamage: 0,
      totalGold: 0,
      inventory: [],
      achievements: []
    })
    
    return {
      uid: firebaseUser.uid,
      displayName: name,
      email: email || null,
      photoURL: null,
      isAdmin: isAdminUser
    }
  } catch (error) {
    console.error('創建用戶失敗:', error)
    throw error
  }
}

// 登入現有用戶（通過 usernameLower 查找，帶密碼驗證）
// 重要：先通過 usernameLower 比對查找原有用戶，使用原有用戶的 UID，不創建新文檔
export const loginUserWithName = async (name, password) => {
  try {
    // 驗證密碼
    if (!password) {
      throw new Error('請輸入密碼')
    }
    
    // 第一步：通過 usernameLower 查找原有用戶（大小寫不敏感）
    const normalizedName = normalizeUsername(name)
    const userData = await findUserByName(name)
    
    if (!userData) {
      throw new Error('帳號不存在，請先註冊')
    }
    
    // 驗證密碼
    if (userData.password !== password) {
      throw new Error('密碼錯誤')
    }
    
    // 第二步：使用原有用戶的 UID（通過 usernameLower 找到的）
    const originalUid = userData.uid || userData.id
    
    console.log('✅ 通過 usernameLower 找到原有用戶:', {
      usernameLower: normalizedName,
      originalUid: originalUid,
      displayName: userData.displayName
    })
    
    // 重要：我們需要 Firebase Auth 認證狀態來通過 Firestore 規則
    // 調用 signInAnonymously 獲取認證狀態（但不在新 UID 下創建文檔）
    // 注意：Firestore 規則需要 request.auth != null，但規則會檢查 request.auth.uid == userId
    // 由於我們使用原有用戶的 UID，而 request.auth.uid 是新的匿名 UID，規則會失敗
    // 因此，我們需要修改策略：先獲取認證狀態，然後嘗試更新
    
    // 獲取 Firebase Auth 認證狀態（用於通過 Firestore 規則的基本檢查）
    let firebaseUser = null
    try {
      // 先檢查是否已經有認證狀態
      const currentUser = auth.currentUser
      if (currentUser && currentUser.isAnonymous) {
        firebaseUser = currentUser
        console.log('使用現有的匿名認證，UID:', firebaseUser.uid)
      } else {
        // 如果沒有認證狀態，創建新的匿名認證
        const userCredential = await signInAnonymously(auth)
        firebaseUser = userCredential.user
        console.log('✅ Firebase Auth 認證成功，匿名 UID:', firebaseUser.uid)
      }
    } catch (authError) {
      console.error('❌ Firebase Auth 認證失敗:', authError)
      throw new Error('無法獲取認證狀態，請重試登入')
    }
    
    // 確認認證狀態
    if (!firebaseUser) {
      throw new Error('認證狀態無效，無法更新用戶數據')
    }
    
    console.log('認證狀態確認:', {
      authUid: firebaseUser.uid,
      originalUid: originalUid,
      isAnonymous: firebaseUser.isAnonymous
    })
    
    // 直接使用原有用戶的 UID 來更新數據（所有遊戲數據都在這裡）
    const userRef = doc(db, USERS_COLLECTION, originalUid)
    
    // 獲取現有用戶數據（使用原 UID）
    const existingUserDoc = await getDoc(userRef)
    
    // 檢查是否應設置為管理員（從原有用戶數據或重新檢查）
    const isAdminUser = userData.isAdmin || shouldBeAdmin(userData.email, name)
    // normalizedName 已在上面第151行聲明，直接使用即可
    
    // 更新原有用戶的登入時間和數據（確保所有數據都在原 UID 下）
    const updateData = {
      displayName: userData.displayName || name,
      usernameLower: normalizedName,
      password: userData.password, // 確保密碼保持
      isAdmin: isAdminUser,
      lastLogin: serverTimestamp()
    }
    
    // 如果原有用戶文檔存在，保留所有遊戲數據；否則使用 userData 中的數據
    if (existingUserDoc.exists()) {
      const existingData = existingUserDoc.data()
      // 保留所有現有遊戲數據
      updateData.gold = existingData.gold !== undefined ? existingData.gold : (userData.gold !== undefined ? userData.gold : 500)
      updateData.inventory = existingData.inventory || userData.inventory || []
      updateData.currentAxeIndex = existingData.currentAxeIndex !== undefined ? existingData.currentAxeIndex : (userData.currentAxeIndex !== undefined ? userData.currentAxeIndex : null)
      updateData.totalDamage = existingData.totalDamage || userData.totalDamage || 0
      updateData.totalGoldEarned = existingData.totalGoldEarned || userData.totalGoldEarned || 0
      updateData.totalDrawCount = existingData.totalDrawCount || userData.totalDrawCount || 0
      updateData.totalSacrificeCount = existingData.totalSacrificeCount || userData.totalSacrificeCount || 0
      updateData.legendaryCount = existingData.legendaryCount || userData.legendaryCount || 0
      updateData.epicCount = existingData.epicCount || userData.epicCount || 0
      updateData.maxWeaponLevel = existingData.maxWeaponLevel || userData.maxWeaponLevel || 0
      updateData.treeDefeatedCount = existingData.treeDefeatedCount || userData.treeDefeatedCount || 0
      updateData.achievements = existingData.achievements || userData.achievements || []
    } else {
      // 如果文檔不存在（不應該發生），使用 userData 的數據
      updateData.gold = userData.gold !== undefined ? userData.gold : (userData.totalGold !== undefined ? userData.totalGold : 500)
      updateData.inventory = userData.inventory || []
      updateData.currentAxeIndex = userData.currentAxeIndex !== undefined ? userData.currentAxeIndex : null
      updateData.totalDamage = userData.totalDamage || 0
      updateData.totalGoldEarned = userData.totalGoldEarned || 0
      updateData.totalDrawCount = userData.totalDrawCount || 0
      updateData.totalSacrificeCount = userData.totalSacrificeCount || 0
      updateData.legendaryCount = userData.legendaryCount || 0
      updateData.epicCount = userData.epicCount || 0
      updateData.maxWeaponLevel = userData.maxWeaponLevel || 0
      updateData.treeDefeatedCount = userData.treeDefeatedCount || 0
      updateData.achievements = userData.achievements || []
      updateData.createdAt = userData.createdAt || serverTimestamp()
    }
    
    // 更新原有用戶的文檔
    // 注意：Firestore 規則需要 request.auth != null，且規則應允許已認證用戶更新任何用戶文檔
    try {
      console.log('嘗試更新用戶文檔:', {
        documentId: originalUid,
        authUid: firebaseUser.uid,
        hasAuth: !!firebaseUser
      })
      
      await setDoc(userRef, updateData, { merge: true })
      
      console.log('✅ 登入成功：使用原有用戶 UID:', originalUid)
      console.log('   原有用戶數據已更新，所有遊戲數據都在此 UID 下')
    } catch (firestoreError) {
      console.error('❌ 更新用戶數據失敗:', {
        error: firestoreError,
        code: firestoreError.code,
        message: firestoreError.message,
        documentId: originalUid,
        authUid: firebaseUser?.uid,
        hasAuth: !!firebaseUser
      })
      
      // 如果是權限錯誤，提供詳細的解決方案
      if (firestoreError.code === 'permission-denied' || firestoreError.code === 7) {
        const errorMessage = `
權限不足：無法更新用戶數據。

可能的原因：
1. Firestore 規則尚未更新 - 請確認 users 集合的 update 規則為：
   allow update: if request.auth != null;

2. 規則更新後需要等待幾秒鐘才會生效

3. 請檢查 Firebase Console 中的 Firestore 規則是否已正確發布

當前狀態：
- 認證 UID: ${firebaseUser?.uid || '無'}
- 目標文檔 UID: ${originalUid}
- 認證狀態: ${firebaseUser ? '已認證' : '未認證'}
        `
        throw new Error(errorMessage.trim())
      }
      throw firestoreError
    }
    
    // 返回原有用戶的 UID 和數據
    // 重要：這個 UID 會被前端使用，所有數據操作都使用這個 UID
    return {
      uid: originalUid, // 使用原有用戶的 UID（重要！）
      displayName: userData.displayName || name,
      email: userData.email || null,
      photoURL: null,
      isAdmin: isAdminUser
    }
  } catch (error) {
    console.error('登入用戶失敗:', error)
    throw error
  }
}

// 簡化的登入/註冊函數（自動判斷，需要密碼）
export const loginOrRegister = async (name, password) => {
  try {
    if (!password) {
      throw new Error('請輸入密碼')
    }
    
    // 檢查名稱是否已存在（大小寫不敏感）
    const exists = await checkNameExists(name)
    
    if (exists) {
      // 名稱存在，登入
      return await loginUserWithName(name, password)
    } else {
      // 名稱不存在，註冊
      return await createUserWithName(name, password)
    }
  } catch (error) {
    console.error('登入/註冊失敗:', error)
    throw error
  }
}

// 獲取用戶資料
export const getUserData = async (uid) => {
  try {
    const userRef = doc(db, USERS_COLLECTION, uid)
    const userSnap = await getDoc(userRef)
    
    if (userSnap.exists()) {
      return {
        uid: userSnap.id,
        ...userSnap.data()
      }
    }
    return null
  } catch (error) {
    console.error('獲取用戶資料失敗:', error)
    return null
  }
}

// 更新用戶資料
export const updateUserData = async (uid, data) => {
  try {
    const userRef = doc(db, USERS_COLLECTION, uid)
    
    // 如果提供了 email 或 displayName，檢查是否應設置為管理員
    const isAdminUser = data.isAdmin !== undefined 
      ? data.isAdmin 
      : shouldBeAdmin(data.email, data.displayName)
    
    await setDoc(userRef, {
      ...data,
      isAdmin: isAdminUser, // 確保 isAdmin 字段被正確設置
      lastUpdate: serverTimestamp()
    }, { merge: true })
  } catch (error) {
    console.error('更新用戶資料失敗:', error)
    throw error
  }
}

// 設置用戶為管理員（通過名稱查找）
export const setUserAsAdminByName = async (displayName, isAdmin = true) => {
  try {
    const userData = await findUserByName(displayName)
    if (!userData) {
      throw new Error('用戶不存在')
    }
    
    const userRef = doc(db, USERS_COLLECTION, userData.uid)
    await setDoc(userRef, {
      isAdmin: isAdmin,
      lastUpdate: serverTimestamp()
    }, { merge: true })
    
    return { success: true }
  } catch (error) {
    console.error('設置管理員失敗:', error)
    throw error
  }
}

// 保存遊戲資料（金錢、背包、成就等）
export const saveGameData = async (uid, gameData) => {
  try {
    const userRef = doc(db, USERS_COLLECTION, uid)
    await setDoc(userRef, {
      gold: gameData.gold || 0,
      inventory: gameData.inventory || [],
      currentAxeIndex: gameData.currentAxeIndex || null,
      totalDamage: gameData.totalDamage || 0,
      totalGoldEarned: gameData.totalGoldEarned || 0,
      totalDrawCount: gameData.totalDrawCount || 0,
      totalSacrificeCount: gameData.totalSacrificeCount || 0,
      legendaryCount: gameData.legendaryCount || 0,
      epicCount: gameData.epicCount || 0,
      maxWeaponLevel: gameData.maxWeaponLevel || 0,
      treeDefeatedCount: gameData.treeDefeatedCount || 0,
      achievements: gameData.achievements || [],
      lastUpdate: serverTimestamp()
    }, { merge: true })
  } catch (error) {
    console.error('保存遊戲資料失敗:', error)
    // 不拋出錯誤，避免影響遊戲體驗
  }
}

// 加載遊戲資料
export const loadGameData = async (uid) => {
  try {
    const userRef = doc(db, USERS_COLLECTION, uid)
    const userSnap = await getDoc(userRef)
    
    if (userSnap.exists()) {
      const data = userSnap.data()
      return {
        gold: data.gold || 500,
        inventory: data.inventory || [],
        currentAxeIndex: data.currentAxeIndex || null,
        totalDamage: data.totalDamage || 0,
        totalGoldEarned: data.totalGoldEarned || 0,
        totalDrawCount: data.totalDrawCount || 0,
        totalSacrificeCount: data.totalSacrificeCount || 0,
        legendaryCount: data.legendaryCount || 0,
        epicCount: data.epicCount || 0,
        maxWeaponLevel: data.maxWeaponLevel || 0,
        treeDefeatedCount: data.treeDefeatedCount || 0,
        achievements: data.achievements || []
      }
    }
    return null
  } catch (error) {
    console.error('加載遊戲資料失敗:', error)
    return null
  }
}

// 初始化用戶資料表（如果不存在）
export const initUsersCollection = async () => {
  try {
    // 嘗試讀取集合來檢查是否存在
    // 如果不存在，Firestore 會在首次寫入時自動創建
    const usersRef = collection(db, USERS_COLLECTION)
    // 使用 limit(1) 來避免查詢所有文檔，只是檢查集合是否可訪問
    const q = query(usersRef, limit(1))
    await getDocs(q)
    
    console.log('用戶資料表已初始化')
    return true
  } catch (error) {
    console.error('初始化用戶資料表失敗:', error)
    // 即使失敗也返回 true，因為 Firestore 會在首次寫入時自動創建
    return true
  }
}

