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
  collection
} from 'firebase/firestore'
import { auth, db } from '../firebase/config'

// 用戶集合名稱
const USERS_COLLECTION = 'users'

// 檢查名稱是否已被使用
export const checkNameExists = async (name) => {
  try {
    const usersRef = collection(db, USERS_COLLECTION)
    const q = query(usersRef, where('displayName', '==', name))
    const querySnapshot = await getDocs(q)
    return !querySnapshot.empty
  } catch (error) {
    console.error('檢查名稱失敗:', error)
    return false
  }
}

// 根據名稱查找用戶
export const findUserByName = async (name) => {
  try {
    const usersRef = collection(db, USERS_COLLECTION)
    const q = query(usersRef, where('displayName', '==', name))
    const querySnapshot = await getDocs(q)
    
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0]
      return {
        id: userDoc.id,
        ...userDoc.data()
      }
    }
    return null
  } catch (error) {
    console.error('查找用戶失敗:', error)
    return null
  }
}

// 創建新用戶（使用匿名認證 + Firestore）
export const createUserWithName = async (name) => {
  try {
    // 先進行匿名認證
    const userCredential = await signInAnonymously(auth)
    const firebaseUser = userCredential.user
    
    // 在 Firestore 中創建用戶資料
    const userRef = doc(db, USERS_COLLECTION, firebaseUser.uid)
    await setDoc(userRef, {
      uid: firebaseUser.uid,
      displayName: name,
      email: null,
      photoURL: null,
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
      email: null,
      photoURL: null
    }
  } catch (error) {
    console.error('創建用戶失敗:', error)
    throw error
  }
}

// 登入現有用戶（使用匿名認證 + 更新 Firestore）
export const loginUserWithName = async (name) => {
  try {
    // 查找用戶
    const userData = await findUserByName(name)
    
    if (!userData) {
      // 如果用戶不存在，創建新用戶
      return await createUserWithName(name)
    }
    
    // 如果用戶存在，進行匿名認證
    const userCredential = await signInAnonymously(auth)
    const firebaseUser = userCredential.user
    
    // 為新的匿名 UID 創建用戶資料，並繼承原有用戶的數據
    const userRef = doc(db, USERS_COLLECTION, firebaseUser.uid)
    
    // 檢查是否已經有這個 UID 的用戶
    const existingUser = await getDoc(userRef)
    
    if (!existingUser.exists()) {
      // 如果這個 UID 沒有用戶資料，創建一個新的並繼承原有用戶的數據
      await setDoc(userRef, {
        uid: firebaseUser.uid,
        displayName: name,
        email: null,
        photoURL: null,
        originalUserId: userData.uid, // 保存原始用戶 ID（用於數據遷移）
        lastLogin: serverTimestamp(),
        totalDamage: userData.totalDamage || 0,
        totalGold: userData.totalGold || 0,
        inventory: userData.inventory || [],
        achievements: userData.achievements || [],
        createdAt: userData.createdAt || serverTimestamp()
      })
    } else {
      // 如果已存在，更新登入時間和用戶數據
      const existingData = existingUser.data()
      await setDoc(userRef, {
        displayName: name,
        lastLogin: serverTimestamp(),
        // 如果原有用戶有更多數據，合併它們
        totalDamage: Math.max(existingData.totalDamage || 0, userData.totalDamage || 0),
        totalGold: Math.max(existingData.totalGold || 0, userData.totalGold || 0),
        inventory: existingData.inventory?.length > 0 ? existingData.inventory : (userData.inventory || []),
        achievements: existingData.achievements?.length > 0 ? existingData.achievements : (userData.achievements || [])
      }, { merge: true })
    }
    
    return {
      uid: firebaseUser.uid,
      displayName: name,
      email: null,
      photoURL: null
    }
  } catch (error) {
    console.error('登入用戶失敗:', error)
    throw error
  }
}

// 簡化的登入/註冊函數（自動判斷）
export const loginOrRegister = async (name) => {
  try {
    // 檢查名稱是否已存在
    const exists = await checkNameExists(name)
    
    if (exists) {
      // 名稱存在，登入
      return await loginUserWithName(name)
    } else {
      // 名稱不存在，註冊
      return await createUserWithName(name)
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
    await setDoc(userRef, {
      ...data,
      lastUpdate: serverTimestamp()
    }, { merge: true })
  } catch (error) {
    console.error('更新用戶資料失敗:', error)
    throw error
  }
}

// 初始化用戶資料表（如果不存在）
export const initUsersCollection = async () => {
  try {
    // 嘗試讀取一個文檔來檢查集合是否存在
    // 如果不存在，Firestore 會自動創建
    const usersRef = collection(db, USERS_COLLECTION)
    const q = query(usersRef, where('__name__', '!=', ''))
    await getDocs(q)
    
    console.log('用戶資料表已初始化')
    return true
  } catch (error) {
    console.error('初始化用戶資料表失敗:', error)
    // 即使失敗也返回 true，因為 Firestore 會在首次寫入時自動創建
    return true
  }
}

