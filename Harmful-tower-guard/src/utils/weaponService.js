import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'

const WEAPONS_COLLECTION = 'weapons'

// 獲取所有武器數據
export const getAllWeapons = async () => {
  try {
    const weaponsRef = collection(db, WEAPONS_COLLECTION)
    const snapshot = await getDocs(weaponsRef)
    
    const weapons = snapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data()
    })).sort((a, b) => a.id - b.id) // 按 ID 排序
    
    return weapons
  } catch (error) {
    console.error('獲取武器數據失敗:', error)
    throw error
  }
}

// 根據 ID 獲取單個武器
export const getWeaponById = async (weaponId) => {
  try {
    const weaponRef = doc(db, WEAPONS_COLLECTION, weaponId.toString())
    const weaponSnap = await getDoc(weaponRef)
    
    if (weaponSnap.exists()) {
      return {
        id: parseInt(weaponSnap.id),
        ...weaponSnap.data()
      }
    }
    return null
  } catch (error) {
    console.error('獲取武器失敗:', error)
    throw error
  }
}

// 根據稀有度獲取武器
export const getWeaponsByRarity = async (rarity) => {
  try {
    const weaponsRef = collection(db, WEAPONS_COLLECTION)
    const q = query(weaponsRef, where('rarity', '==', rarity))
    const snapshot = await getDocs(q)
    
    return snapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data()
    })).sort((a, b) => a.id - b.id)
  } catch (error) {
    console.error('獲取武器失敗:', error)
    throw error
  }
}

// 批量獲取武器（根據 ID 數組）
export const getWeaponsByIds = async (weaponIds) => {
  try {
    const weapons = []
    for (const weaponId of weaponIds) {
      const weapon = await getWeaponById(weaponId)
      if (weapon) {
        weapons.push(weapon)
      }
    }
    return weapons
  } catch (error) {
    console.error('批量獲取武器失敗:', error)
    throw error
  }
}

