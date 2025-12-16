// 遊戲數據服務 - 所有操作都通過 Firestore 驗證
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, runTransaction, collection, getDocs, deleteDoc, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { getWeaponById } from './weaponService'

const WEAPONS_COLLECTION = 'weapons'

const USERS_COLLECTION = 'users'

// 獲取玩家遊戲資料（從 Firestore）
export const getPlayerGameData = async (userId) => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId)
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
    console.error('獲取玩家遊戲資料失敗:', error)
    throw error
  }
}

// 更新玩家金錢（帶驗證）
export const updatePlayerGold = async (userId, goldChange, reason = '') => {
  try {
    return await runTransaction(db, async (transaction) => {
      const userRef = doc(db, USERS_COLLECTION, userId)
      const userSnap = await transaction.get(userRef)
      
      if (!userSnap.exists()) {
        throw new Error('用戶不存在')
      }
      
      const currentData = userSnap.data()
      const currentGold = currentData.gold || 500
      const newGold = currentGold + goldChange
      
      // 驗證金錢不能為負數
      if (newGold < 0) {
        throw new Error('金錢不足')
      }
      
      // 驗證金錢變化是否合理（防止異常值）
      if (Math.abs(goldChange) > 1000000) {
        throw new Error('金錢變化異常')
      }
      
      transaction.update(userRef, {
        gold: newGold,
        lastUpdate: serverTimestamp()
      })
      
      return newGold
    })
  } catch (error) {
    console.error('更新玩家金錢失敗:', error)
    throw error
  }
}

// 批量更新玩家金錢（帶驗證，用於累積多次攻擊的收益）
// 添加重試機制處理事務衝突
export const batchUpdatePlayerGold = async (userId, totalGoldChange, reason = '批量攻擊收益', retryCount = 0) => {
  const MAX_RETRIES = 3
  const RETRY_DELAY = 100 // 100ms
  
  try {
    return await runTransaction(db, async (transaction) => {
      const userRef = doc(db, USERS_COLLECTION, userId)
      const userSnap = await transaction.get(userRef)
      
      if (!userSnap.exists()) {
        throw new Error(`用戶不存在: ${userId}`)
      }
      
      const currentData = userSnap.data()
      const currentGold = currentData.gold || 500
      const newGold = currentGold + totalGoldChange
      
      // 驗證金錢不能為負數
      if (newGold < 0) {
        throw new Error('金錢不足')
      }
      
      // 驗證金錢變化是否合理（防止異常值，批量更新允許更大的變化）
      if (Math.abs(totalGoldChange) > 10000000) {
        throw new Error('金錢變化異常')
      }
      
      // 記錄更新前的數據用於日誌
      console.log(`[${userId}] 批量更新金錢: ${currentGold} + ${totalGoldChange} = ${newGold}`)
      
      transaction.update(userRef, {
        gold: newGold,
        lastUpdate: serverTimestamp()
      })
      
      return newGold
    })
  } catch (error) {
    // 如果是事務衝突錯誤，且未達到重試次數，則重試
    if (error.code === 'failed-precondition' && retryCount < MAX_RETRIES) {
      console.warn(`批量更新玩家金錢失敗（事務衝突），重試 ${retryCount + 1}/${MAX_RETRIES}:`, error.message)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1))) // 遞增延遲
      return await batchUpdatePlayerGold(userId, totalGoldChange, reason, retryCount + 1)
    }
    
    console.error(`批量更新玩家金錢失敗 (userId: ${userId}):`, error)
    throw error
  }
}

// 後端計算武器機率並選擇武器（防止前端篡改）
const calculateWeaponProbability = (weapons, targetRarity = null) => {
  // 稀有度機率定義（與前端一致）
  const RARITY_WEIGHTS = {
    'COMMON': 50,
    'RARE': 30,
    'EPIC': 15,
    'LEGENDARY': 5
  }
  
  const rarityOrder = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']
  let availableWeights = []
  
  if (targetRarity) {
    // 指定稀有度：包含該稀有度及所有更低稀有度的武器
    const targetRarityIndex = rarityOrder.indexOf(targetRarity)
    if (targetRarityIndex === -1) {
      return null
    }
    
    // 獲取該稀有度及所有更低稀有度的武器
    const availableRarities = rarityOrder.slice(0, targetRarityIndex + 1)
    const rarityCards = weapons.filter(card => availableRarities.includes(card.rarity))
    
    if (rarityCards.length === 0) {
      return null
    }
    
    // 分別計算每個稀有度內的權重，然後按稀有度機率加權
    const rarityWeights = {}
    
    availableRarities.forEach(rarity => {
      const cards = rarityCards.filter(card => card.rarity === rarity)
      if (cards.length > 0) {
        const maxAttack = Math.max(...cards.map(card => card.attack))
        const weights = cards.map(card => {
          const attackDiff = maxAttack - card.attack + 1
          return {
            card: card,
            weight: Math.pow(attackDiff, 2) // 平方權重
          }
        })
        rarityWeights[rarity] = weights
      }
    })
    
    // 將每個稀有度的權重按稀有度機率加權
    Object.keys(rarityWeights).forEach(rarity => {
      const rarityProb = RARITY_WEIGHTS[rarity] / 100 // 稀有度機率（0-1）
      rarityWeights[rarity].forEach(item => {
        availableWeights.push({
          card: item.card,
          weight: item.weight * rarityProb // 按稀有度機率加權
        })
      })
    })
  } else {
    // 普通抽卡：分別計算每個稀有度的權重，然後按稀有度機率加權
    const rarityWeights = {}
    
    // 先計算每個稀有度的總權重
    rarityOrder.forEach(rarity => {
      const rarityCards = weapons.filter(card => card.rarity === rarity)
      if (rarityCards.length > 0) {
        const maxAttack = Math.max(...rarityCards.map(card => card.attack))
        const weights = rarityCards.map(card => {
          const attackDiff = maxAttack - card.attack + 1
          return {
            card: card,
            weight: Math.pow(attackDiff, 2) // 平方權重
          }
        })
        rarityWeights[rarity] = weights
      }
    })
    
    // 將每個稀有度的權重按稀有度機率加權
    Object.keys(rarityWeights).forEach(rarity => {
      const rarityProb = RARITY_WEIGHTS[rarity] / 100 // 稀有度機率（0-1）
      rarityWeights[rarity].forEach(item => {
        availableWeights.push({
          card: item.card,
          weight: item.weight * rarityProb // 按稀有度機率加權
        })
      })
    })
  }
  
  if (availableWeights.length === 0) {
    return null
  }
  
  // 按照權重隨機選擇
  const totalWeight = availableWeights.reduce((sum, item) => sum + item.weight, 0)
  const random = Math.random() * totalWeight
  let currentWeight = 0
  
  for (const weightItem of availableWeights) {
    currentWeight += weightItem.weight
    if (random <= currentWeight) {
      return weightItem.card
    }
  }
  
  // 備用方案：返回第一張可用卡
  return availableWeights[0].card
}

// 抽卡操作（帶驗證，後端計算機率）
export const drawCardWithValidation = async (userId, rarity, cost) => {
  try {
    // 先從 Firestore 獲取所有武器數據
    const weaponsRef = collection(db, WEAPONS_COLLECTION)
    let weaponsSnapshot
    
    // 獲取所有武器（因為指定稀有度時也需要包含更低稀有度的武器）
    weaponsSnapshot = await getDocs(weaponsRef)
    
    const weapons = weaponsSnapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data()
    }))
    
    if (weapons.length === 0) {
      throw new Error('沒有可用的武器')
    }
    
    // 後端計算機率並選擇武器
    const selectedWeapon = calculateWeaponProbability(weapons, rarity)
    
    if (!selectedWeapon) {
      throw new Error('無法選擇武器')
    }
    
    // 在事務中扣除金錢並更新數據
    return await runTransaction(db, async (transaction) => {
      const userRef = doc(db, USERS_COLLECTION, userId)
      const userSnap = await transaction.get(userRef)
      
      if (!userSnap.exists()) {
        throw new Error('用戶不存在')
      }
      
      const currentData = userSnap.data()
      const currentGold = currentData.gold || 500
      
      // 驗證金錢是否足夠
      if (currentGold < cost) {
        throw new Error('金錢不足')
      }
      
      // 驗證抽卡價格是否合理
      const validPrices = {
        'COMMON': 200,
        'RARE': 2000,
        'EPIC': 20000,
        'LEGENDARY': 200000
      }
      
      if (validPrices[rarity] !== cost) {
        throw new Error('抽卡價格異常')
      }
      
      // 扣除金錢
      const newGold = currentGold - cost
      
      // 更新數據
      transaction.update(userRef, {
        gold: newGold,
        totalDrawCount: (currentData.totalDrawCount || 0) + 1,
        lastUpdate: serverTimestamp()
      })
      
      return {
        newGold,
        selectedWeapon: selectedWeapon, // 返回後端選擇的武器
        success: true
      }
    })
  } catch (error) {
    console.error('抽卡驗證失敗:', error)
    throw error
  }
}

// 添加武器到背包（帶驗證）
export const addWeaponToInventory = async (userId, weapon) => {
  try {
    return await runTransaction(db, async (transaction) => {
      const userRef = doc(db, USERS_COLLECTION, userId)
      const userSnap = await transaction.get(userRef)
      
      if (!userSnap.exists()) {
        throw new Error('用戶不存在')
      }
      
      const currentData = userSnap.data()
      const inventory = currentData.inventory || []
      
      // 驗證武器數據
      if (!weapon || !weapon.id || !weapon.name) {
        throw new Error('無效的武器數據')
      }
      
      // 驗證背包大小（防止無限添加）
      if (inventory.length >= 1000) {
        throw new Error('背包已滿')
      }
      
      // 添加武器
      const newInventory = [...inventory, weapon]
      
      transaction.update(userRef, {
        inventory: newInventory,
        lastUpdate: serverTimestamp()
      })
      
      return {
        inventory: newInventory,
        success: true
      }
    })
  } catch (error) {
    console.error('添加武器失敗:', error)
    throw error
  }
}

// 升級武器（帶驗證）
export const upgradeWeaponInInventory = async (userId, weaponIndex, newWeaponData) => {
  try {
    return await runTransaction(db, async (transaction) => {
      const userRef = doc(db, USERS_COLLECTION, userId)
      const userSnap = await transaction.get(userRef)
      
      if (!userSnap.exists()) {
        throw new Error('用戶不存在')
      }
      
      const currentData = userSnap.data()
      const inventory = currentData.inventory || []
      
      // 驗證索引
      if (weaponIndex < 0 || weaponIndex >= inventory.length) {
        throw new Error('無效的武器索引')
      }
      
      // 驗證新武器數據
      if (!newWeaponData || !newWeaponData.id) {
        throw new Error('無效的武器數據')
      }
      
      // 更新武器
      const newInventory = [...inventory]
      newInventory[weaponIndex] = newWeaponData
      
      transaction.update(userRef, {
        inventory: newInventory,
        lastUpdate: serverTimestamp()
      })
      
      return {
        inventory: newInventory,
        success: true
      }
    })
  } catch (error) {
    console.error('升級武器失敗:', error)
    throw error
  }
}

// 賣出武器（帶驗證）
export const sellWeapon = async (userId, weaponIndex, sellPrice) => {
  try {
    return await runTransaction(db, async (transaction) => {
      const userRef = doc(db, USERS_COLLECTION, userId)
      const userSnap = await transaction.get(userRef)
      
      if (!userSnap.exists()) {
        throw new Error('用戶不存在')
      }
      
      const currentData = userSnap.data()
      const inventory = currentData.inventory || []
      const currentGold = currentData.gold || 500
      
      // 驗證索引
      if (weaponIndex < 0 || weaponIndex >= inventory.length) {
        throw new Error('無效的武器索引')
      }
      
      // 驗證賣出價格是否合理（防止異常值）
      if (sellPrice < 0 || sellPrice > 100000) {
        throw new Error('賣出價格異常')
      }
      
      // 驗證不能賣出最後一把武器
      if (inventory.length <= 1) {
        throw new Error('至少需要保留一把武器')
      }
      
      // 移除武器並增加金錢
      const newInventory = inventory.filter((_, index) => index !== weaponIndex)
      const newGold = currentGold + sellPrice
      
      // 更新當前武器索引（如果被賣出的是當前使用的）
      let newCurrentAxeIndex = currentData.currentAxeIndex
      if (currentData.currentAxeIndex === weaponIndex) {
        newCurrentAxeIndex = newInventory.length > 0 ? 0 : null
      } else if (currentData.currentAxeIndex !== null && currentData.currentAxeIndex > weaponIndex) {
        newCurrentAxeIndex = currentData.currentAxeIndex - 1
      }
      
      transaction.update(userRef, {
        gold: newGold,
        inventory: newInventory,
        currentAxeIndex: newCurrentAxeIndex,
        lastUpdate: serverTimestamp()
      })
      
      return {
        gold: newGold,
        inventory: newInventory,
        currentAxeIndex: newCurrentAxeIndex,
        success: true
      }
    })
  } catch (error) {
    console.error('賣出武器失敗:', error)
    throw error
  }
}

// 獻祭升級（帶驗證）
export const sacrificeUpgradeWithValidation = async (userId, upgradeIndex, sacrificeIndices, newWeaponData, newGold) => {
  try {
    return await runTransaction(db, async (transaction) => {
      const userRef = doc(db, USERS_COLLECTION, userId)
      const userSnap = await transaction.get(userRef)
      
      if (!userSnap.exists()) {
        throw new Error('用戶不存在')
      }
      
      const currentData = userSnap.data()
      const inventory = currentData.inventory || []
      const currentGold = currentData.gold || 500
      
      // 驗證索引
      if (upgradeIndex < 0 || upgradeIndex >= inventory.length) {
        throw new Error('無效的升級武器索引')
      }
      
      // 驗證獻祭索引
      for (const idx of sacrificeIndices) {
        if (idx < 0 || idx >= inventory.length) {
          throw new Error('無效的獻祭武器索引')
        }
        if (idx === upgradeIndex) {
          throw new Error('不能獻祭正在升級的武器')
        }
      }
      
      // 驗證不能獻祭所有武器
      if (inventory.length - sacrificeIndices.length < 1) {
        throw new Error('至少需要保留一把武器')
      }
      
      // 驗證新武器數據
      if (!newWeaponData || !newWeaponData.id) {
        throw new Error('無效的武器數據')
      }
      
      // 注意：獻祭操作不應該改變金錢，使用後端金錢（currentGold）而不是前端傳入的 newGold
      // 這樣可以避免前端和後端金錢不同步導致的驗證失敗
      
      // 移除獻祭的武器並更新升級的武器（基於原始索引，避免索引錯亂）
      const newInventory = inventory.reduce((result, weapon, index) => {
        if (index === upgradeIndex) {
          // 升級目標武器
          result.push(newWeaponData)
        } else if (!sacrificeIndices.includes(index)) {
          // 未被獻祭的武器保留
          result.push(weapon)
        }
        // 被獻祭的武器不加入新背包
        return result
      }, [])
      
      // 更新當前武器索引
      let newCurrentAxeIndex = currentData.currentAxeIndex
      if (newCurrentAxeIndex !== null && newCurrentAxeIndex >= 0) {
        // 計算新索引
        const sortedSacrificeIndices = [...sacrificeIndices].sort((a, b) => a - b)
        let offset = 0
        
        // 計算被刪除的武器數量（在當前武器之前的）
        for (const idx of sortedSacrificeIndices) {
          if (idx < newCurrentAxeIndex) {
            offset++
          }
        }
        
        if (newCurrentAxeIndex === upgradeIndex) {
          // 升級的是當前武器，找到新位置
          const upgradedWeaponIndex = newInventory.findIndex(w => w && w.id === newWeaponData.id)
          if (upgradedWeaponIndex >= 0) {
            newCurrentAxeIndex = upgradedWeaponIndex
          } else {
            // 如果找不到，保持原索引減去偏移量
            newCurrentAxeIndex = newCurrentAxeIndex - offset
            // 確保索引有效
            if (newCurrentAxeIndex < 0 || newCurrentAxeIndex >= newInventory.length) {
              newCurrentAxeIndex = newInventory.length > 0 ? 0 : null
            }
          }
        } else {
          // 升級的不是當前武器，只調整索引
          newCurrentAxeIndex = newCurrentAxeIndex - offset
          // 確保索引有效
          if (newCurrentAxeIndex < 0 || newCurrentAxeIndex >= newInventory.length) {
            newCurrentAxeIndex = newInventory.length > 0 ? 0 : null
          }
        }
      } else {
        // 如果之前沒有裝備武器，保持不裝備狀態
        newCurrentAxeIndex = null
      }
      
      transaction.update(userRef, {
        inventory: newInventory,
        currentAxeIndex: newCurrentAxeIndex,
        totalSacrificeCount: (currentData.totalSacrificeCount || 0) + 1,
        lastUpdate: serverTimestamp()
      })
      
      return {
        inventory: newInventory,
        currentAxeIndex: newCurrentAxeIndex,
        gold: currentGold, // 返回後端金錢，確保前端同步
        success: true
      }
    })
  } catch (error) {
    console.error('獻祭升級驗證失敗:', error)
    throw error
  }
}

// 更新成就（帶驗證）
export const updateAchievement = async (userId, achievementId, unlocked, progress) => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId)
    const userSnap = await getDoc(userRef)
    
    if (!userSnap.exists()) {
      throw new Error('用戶不存在')
    }
    
    const currentData = userSnap.data()
    const achievements = currentData.achievements || []
    
    // 更新或添加成就
    const achievementIndex = achievements.findIndex(a => a.id === achievementId)
    const achievementData = {
      id: achievementId,
      unlocked: unlocked || false,
      progress: progress || 0
    }
    
    if (achievementIndex >= 0) {
      achievements[achievementIndex] = achievementData
    } else {
      achievements.push(achievementData)
    }
    
    await updateDoc(userRef, {
      achievements: achievements,
      lastUpdate: serverTimestamp()
    })
    
    return { success: true }
  } catch (error) {
    console.error('更新成就失敗:', error)
    throw error
  }
}

// 統計數據批量更新緩存（優化：減少寫入次數）
const statsBatchCache = new Map() // userId -> { totalDamage, totalGoldEarned, lastFlush }
const STATS_FLUSH_INTERVAL = 30000 // 30秒批量更新一次
const STATS_FLUSH_THRESHOLD = 1000 // 累積變化超過1000時強制更新

// 更新總傷害（帶驗證，批量模式）
export const updateTotalDamage = async (userId, damage) => {
  // 驗證傷害值是否合理
  if (damage < 0 || damage > 1000000000) {
    throw new Error('傷害值異常')
  }
  
  // 添加到批量緩存
  if (!statsBatchCache.has(userId)) {
    statsBatchCache.set(userId, {
      totalDamage: 0,
      totalGoldEarned: 0,
      lastFlush: Date.now()
    })
  }
  
  const cache = statsBatchCache.get(userId)
  cache.totalDamage = Math.max(cache.totalDamage, damage) // 只保留最大值
  
  // 檢查是否需要刷新
  const timeSinceFlush = Date.now() - cache.lastFlush
  const shouldFlush = timeSinceFlush >= STATS_FLUSH_INTERVAL
  
  if (shouldFlush) {
    await flushStatsBatch(userId)
  }
  
  return { success: true }
}

// 刷新統計數據批次（使用事務防止數據混亂）
const flushStatsBatch = async (userId) => {
  const cache = statsBatchCache.get(userId)
  if (!cache) return
  
  try {
    // 使用事務確保數據一致性
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, USERS_COLLECTION, userId)
      const userSnap = await transaction.get(userRef)
      
      if (!userSnap.exists()) {
        throw new Error(`用戶不存在: ${userId}`)
      }
      
      const currentData = userSnap.data()
      const updateData = {}
      
      // 更新總傷害（只允許增加）
      if (cache.totalDamage > 0) {
        const currentDamage = currentData.totalDamage || 0
        if (cache.totalDamage >= currentDamage) {
          updateData.totalDamage = cache.totalDamage
        }
        cache.totalDamage = 0 // 重置緩存
      }
      
      // 更新總金錢收益（只允許增加）
      if (cache.totalGoldEarned > 0) {
        const currentGoldEarned = currentData.totalGoldEarned || 0
        if (cache.totalGoldEarned >= currentGoldEarned) {
          updateData.totalGoldEarned = cache.totalGoldEarned
        }
        cache.totalGoldEarned = 0 // 重置緩存
      }
      
      if (Object.keys(updateData).length > 0) {
        updateData.lastUpdate = serverTimestamp()
        transaction.update(userRef, updateData)
      }
      
      cache.lastFlush = Date.now()
    })
  } catch (error) {
    console.error(`批量更新統計數據失敗 (userId: ${userId}):`, error)
  }
}

// 定期刷新所有統計緩存
setInterval(() => {
  for (const userId of statsBatchCache.keys()) {
    flushStatsBatch(userId).catch(err => console.error('定期刷新統計數據失敗:', err))
  }
}, STATS_FLUSH_INTERVAL)

// 更新總金錢收益（帶驗證，批量模式）
export const updateTotalGoldEarned = async (userId, goldEarned) => {
  // 驗證金錢收益是否合理
  if (goldEarned < 0 || goldEarned > 1000000000) {
    throw new Error('金錢收益異常')
  }
  
  // 添加到批量緩存
  if (!statsBatchCache.has(userId)) {
    statsBatchCache.set(userId, {
      totalDamage: 0,
      totalGoldEarned: 0,
      lastFlush: Date.now()
    })
  }
  
  const cache = statsBatchCache.get(userId)
  cache.totalGoldEarned = Math.max(cache.totalGoldEarned, goldEarned) // 只保留最大值
  
  // 檢查是否需要刷新
  const timeSinceFlush = Date.now() - cache.lastFlush
  const shouldFlush = timeSinceFlush >= STATS_FLUSH_INTERVAL
  
  if (shouldFlush) {
    await flushStatsBatch(userId)
  }
  
  return { success: true }
}

// 保存離線狀態（記錄當前裝備和時間）
// inactiveStartTime: 用戶開始不活動的時間（可選，如果不提供則使用當前時間）
export const saveOfflineState = async (userId, weaponId, weaponLevel, attackInterval, inactiveStartTime = null) => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId)
    
    // 如果提供了 inactiveStartTime，使用它；否則使用當前時間
    const lastActiveTime = inactiveStartTime 
      ? (inactiveStartTime instanceof Date ? inactiveStartTime : new Date(inactiveStartTime))
      : serverTimestamp()
    
    await updateDoc(userRef, {
      offlineState: {
        weaponId: weaponId,
        weaponLevel: weaponLevel || 1,
        attackInterval: attackInterval || 2000,
        lastActiveTime: inactiveStartTime 
          ? (inactiveStartTime instanceof Date ? inactiveStartTime : new Date(inactiveStartTime))
          : serverTimestamp()
      },
      lastUpdate: serverTimestamp()
    })
    return { success: true }
  } catch (error) {
    console.error('保存離線狀態失敗:', error)
    throw error
  }
}

// 清除離線狀態
export const clearOfflineState = async (userId) => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId)
    await updateDoc(userRef, {
      offlineState: null,
      lastUpdate: serverTimestamp()
    })
    return { success: true }
  } catch (error) {
    console.error('清除離線狀態失敗:', error)
    throw error
  }
}

// 計算離線收益（根據離線時間和攻擊間隔計算傷害次數）
export const calculateOfflineRewards = async (userId) => {
  try {
    console.log('開始計算離線收益，userId:', userId)
    const userRef = doc(db, USERS_COLLECTION, userId)
    const userSnap = await getDoc(userRef)
    
    if (!userSnap.exists()) {
      console.log('用戶不存在，無法計算離線收益')
      return null
    }
    
    const userData = userSnap.data()
    const offlineState = userData.offlineState
    
    console.log('用戶離線狀態:', offlineState)
    
    if (!offlineState || !offlineState.lastActiveTime) {
      console.log('沒有離線狀態或最後活動時間，可能是首次登入')
      return null
    }
    
    // 計算離線時間（毫秒）
    // lastActiveTime 是開始不活動的時間（用戶停止動作1分鐘後）
    const lastActiveTime = offlineState.lastActiveTime.toDate ? 
      offlineState.lastActiveTime.toDate() : 
      new Date(offlineState.lastActiveTime)
    const now = new Date()
    const offlineTime = now - lastActiveTime
    
    console.log('離線時間（毫秒）:', offlineTime, '最後活動時間:', lastActiveTime, '現在時間:', now)
    
    // 如果離線時間少於1分鐘，不計算收益（因為是從停止動作1分鐘後開始計算的）
    const MIN_OFFLINE_TIME = 60 * 1000 // 1分鐘
    if (offlineTime < MIN_OFFLINE_TIME) {
      console.log('離線時間少於1分鐘，不計算收益')
      return null
    }
    
    // 最多計算24小時的離線收益
    const maxOfflineTime = 24 * 60 * 60 * 1000 // 24小時
    const effectiveOfflineTime = Math.min(offlineTime, maxOfflineTime)
    
    // 計算攻擊次數
    const attackInterval = offlineState.attackInterval || 2000
    const attackCount = Math.floor(effectiveOfflineTime / attackInterval)
    
    console.log('攻擊間隔:', attackInterval, '有效離線時間:', effectiveOfflineTime, '攻擊次數:', attackCount)
    
    if (attackCount <= 0) {
      console.log('攻擊次數為 0 或負數，離線時間太短')
      return null
    }
    
    // 獲取武器數據計算傷害
    console.log('獲取武器數據，weaponId:', offlineState.weaponId)
    const weapon = await getWeaponById(offlineState.weaponId)
    
    if (!weapon) {
      console.error('無法找到武器，weaponId:', offlineState.weaponId)
      return null
    }
    
    console.log('武器數據:', weapon)
    
    const weaponLevel = offlineState.weaponLevel || 1
    const baseDamage = weapon.attack
    const damagePerAttack = Math.floor(baseDamage * (1 + (weaponLevel - 1) * 0.5))
    const totalDamage = damagePerAttack * attackCount
    
    console.log('武器等級:', weaponLevel, '基礎傷害:', baseDamage, '每次傷害:', damagePerAttack, '總傷害:', totalDamage)
    
    // 計算金錢收益（根據武器的金錢機率）
    let totalGoldEarned = 0
    const goldChance = weapon.goldChance || 0.3
    const goldMin = weapon.goldMin || 5
    const goldMax = weapon.goldMax || 15
    
    for (let i = 0; i < attackCount; i++) {
      if (Math.random() <= goldChance) {
        totalGoldEarned += Math.floor(Math.random() * (goldMax - goldMin + 1) + goldMin)
      }
    }
    
    console.log('金錢收益計算完成:', {
      attackCount,
      totalDamage,
      totalGoldEarned,
      offlineHours: (effectiveOfflineTime / (60 * 60 * 1000)).toFixed(1)
    })
    
    return {
      attackCount,
      totalDamage,
      totalGoldEarned,
      offlineTime: effectiveOfflineTime,
      offlineHours: (effectiveOfflineTime / (60 * 60 * 1000)).toFixed(1)
    }
  } catch (error) {
    console.error('計算離線收益失敗:', error)
    console.error('錯誤詳情:', error.stack)
    return null
  }
}

// 清除所有玩家資料（僅測試模式使用）
export const clearAllPlayersData = async () => {
  try {
    const usersRef = collection(db, USERS_COLLECTION)
    const snapshot = await getDocs(usersRef)
    
    const deletePromises = []
    snapshot.forEach((doc) => {
      deletePromises.push(deleteDoc(doc.ref))
    })
    
    await Promise.all(deletePromises)
    
    console.log(`✓ 已清除 ${snapshot.size} 個玩家的資料`)
    return { success: true, deletedCount: snapshot.size }
  } catch (error) {
    console.error('清除所有玩家資料失敗:', error)
    throw error
  }
}

// 應用離線收益到遊戲
export const applyOfflineRewards = async (userId, rewards) => {
  try {
    return await runTransaction(db, async (transaction) => {
      const userRef = doc(db, USERS_COLLECTION, userId)
      const gameStateRef = doc(db, 'gameState', 'current')
      
      const userSnap = await transaction.get(userRef)
      const gameStateSnap = await transaction.get(gameStateRef)
      
      if (!userSnap.exists()) {
        throw new Error('用戶不存在')
      }
      
      const currentData = userSnap.data()
      const currentGold = currentData.gold || 500
      const currentDamage = currentData.totalDamage || 0
      const currentGoldEarned = currentData.totalGoldEarned || 0
      
      // 更新用戶數據
      transaction.update(userRef, {
        gold: currentGold + rewards.totalGoldEarned,
        totalDamage: currentDamage + rewards.totalDamage,
        totalGoldEarned: currentGoldEarned + rewards.totalGoldEarned,
        offlineState: null, // 清除離線狀態
        lastUpdate: serverTimestamp()
      })
      
      // 對樹造成傷害
      if (gameStateSnap.exists()) {
        const gameState = gameStateSnap.data()
        const currentTreeHealth = gameState.treeHealth || 1000000
        const newTreeHealth = Math.max(0, currentTreeHealth - rewards.totalDamage)
        
        transaction.update(gameStateRef, {
          treeHealth: newTreeHealth,
          lastUpdate: serverTimestamp()
        })
      }
      
      return {
        newGold: currentGold + rewards.totalGoldEarned,
        newTotalDamage: currentDamage + rewards.totalDamage,
        newTotalGoldEarned: currentGoldEarned + rewards.totalGoldEarned
      }
    })
  } catch (error) {
    console.error('應用離線收益失敗:', error)
    throw error
  }
}


