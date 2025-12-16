<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getUserRole } from '../utils/admin'
import {
  initGameState,
  subscribeGameState,
  attackTree,
  subscribeRecentAttacks,
  setUserOnline,
  setUserOffline,
  updateUserStatus,
  subscribeOnlineUsers
} from '../utils/multiplayer'
import {
  sendLegendaryAnnouncement,
  sendAchievementAnnouncement,
  subscribeChatMessages,
  sendLocalLegendaryAnnouncement,
  sendLocalAchievementAnnouncement,
  getLocalMessages
} from '../utils/chatService'
import { getAllWeapons } from '../utils/weaponService'
import { saveGameData, loadGameData } from '../utils/userService'
import {
  getPlayerGameData,
  updatePlayerGold,
  batchUpdatePlayerGold,
  drawCardWithValidation,
  addWeaponToInventory,
  sellWeapon,
  sacrificeUpgradeWithValidation,
  updateTotalDamage,
  updateTotalGoldEarned,
  updateAchievement as updateAchievementInFirestore,
  saveOfflineState,
  clearOfflineState,
  calculateOfflineRewards,
  applyOfflineRewards,
  clearAllPlayersData
} from '../utils/gameDataService'

const props = defineProps({
  user: {
    type: Object,
    required: true
  }
})

// 遊戲狀態
const gold = ref(props.user.initialGold || 500) // 初始金錢（測試帳號為 999999）
const inventory = ref([]) // 背包（存放所有斧頭）
const currentAxeIndex = ref(null) // 當前使用的斧頭在背包中的索引
const treeHealth = ref(1000000) // 樹的血量（從 Firebase 同步）
const maxTreeHealth = ref(1000000) // 最大血量
const totalDamage = ref(0) // 總傷害（個人）
const attackTimer = ref(null) // 當前斧頭的攻擊計時器
const lastAttackTime = ref(Date.now()) // 上次攻擊時間（用於基於時間戳的攻擊計算）
const lastActivityTime = ref(Date.now()) // 最後一次用戶活動時間（用於離線收益計算）
const activityCheckInterval = ref(null) // 活動檢查計時器（檢查是否需要保存離線狀態）
const attackCheckInterval = ref(null) // 攻擊檢查定時器（基於時間戳檢查是否需要攻擊）

// 自動保存計時器
const saveTimer = ref(null)
const isSaving = ref(false)

// 清除資料狀態
const isClearingData = ref(false)

// 多人遊戲狀態
const recentAttacks = ref([]) // 最近的攻擊記錄
const onlineUsers = ref([]) // 在線玩家列表
const gameStateUnsubscribe = ref(null) // 遊戲狀態監聽器
const attacksUnsubscribe = ref(null) // 攻擊記錄監聽器
const usersUnsubscribe = ref(null) // 在線玩家監聽器
const isMultiplayerReady = ref(false) // 多人遊戲是否已初始化
const multiplayerError = ref(null) // 多人模式連接錯誤

// 當前使用的斧頭
const currentAxe = computed(() => {
  return currentAxeIndex.value !== null ? inventory.value[currentAxeIndex.value] : null
})

// 獲取使用者角色
const userRole = computed(() => getUserRole(props.user.email))

// 格式化時間（用於顯示攻擊記錄）
const formatTime = (timestamp) => {
  if (!timestamp) return '剛剛'
  
  // 如果是 Firestore Timestamp
  const time = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  const now = new Date()
  const diff = now - time
  
  if (diff < 1000) return '剛剛'
  if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分鐘前`
  return `${Math.floor(diff / 3600000)}小時前`
}

// 稀有度定義和權重
const RARITY = {
  COMMON: { name: '普通', weight: 50, color: '#9e9e9e' },      // 50% 機率
  RARE: { name: '稀有', weight: 30, color: '#2196f3' },        // 30% 機率
  EPIC: { name: '史詩', weight: 15, color: '#9c27b0' },        // 15% 機率
  LEGENDARY: { name: '傳說', weight: 5, color: '#ff9800' }     // 5% 機率
}

// 備用武器數據（如果 Firestore 加載失敗時使用）
const fallbackWeaponDatabase = [
  // 普通級別 (Common)
  { id: 1, name: '手刀斧', icon: '✋', rarity: 'COMMON', attack: 3, attackInterval: 2200, goldChance: 0.25, goldMin: 3, goldMax: 10, description: '用手當斧頭，痛但有效，真·空手道' },
  { id: 2, name: '紙箱斧', icon: '📦', rarity: 'COMMON', attack: 4, attackInterval: 2100, goldChance: 0.28, goldMin: 4, goldMax: 12, description: '環保又輕便，搬家神器，超實用' },
  { id: 3, name: '手機斧', icon: '📱', rarity: 'COMMON', attack: 5, attackInterval: 2000, goldChance: 0.3, goldMin: 5, goldMax: 15, description: '用iPhone砍樹，庫克看了都哭' },
  { id: 4, name: '泡麵叉斧', icon: '🍜', rarity: 'COMMON', attack: 4, attackInterval: 2050, goldChance: 0.27, goldMin: 4, goldMax: 13, description: '餓了還能吃，一物兩用，超方便' },
  { id: 5, name: '鍵盤斧', icon: '⌨️', rarity: 'COMMON', attack: 6, attackInterval: 1950, goldChance: 0.32, goldMin: 6, goldMax: 16, description: '敲敲打打，工程師的最愛' },
  
  // 稀有級別 (Rare)
  { id: 6, name: '滑板斧', icon: '🛹', rarity: 'RARE', attack: 12, attackInterval: 1700, goldChance: 0.4, goldMin: 10, goldMax: 25, description: '滑起來砍樹，超chill的，有夠帥' },
  { id: 7, name: '耳機斧', icon: '🎧', rarity: 'RARE', attack: 15, attackInterval: 1600, goldChance: 0.45, goldMin: 12, goldMax: 28, description: '無線砍樹，斷線就尷尬了' },
  { id: 8, name: '珍奶斧', icon: '🧋', rarity: 'RARE', attack: 14, attackInterval: 1650, goldChance: 0.42, goldMin: 11, goldMax: 26, description: '台灣之光，邊喝邊砍，超台' },
  { id: 9, name: '薯條斧', icon: '🍟', rarity: 'RARE', attack: 13, attackInterval: 1680, goldChance: 0.4, goldMin: 10, goldMax: 24, description: '麥當勞最強武器，熱量爆表' },
  { id: 10, name: '手把斧', icon: '🎮', rarity: 'RARE', attack: 16, attackInterval: 1550, goldChance: 0.48, goldMin: 13, goldMax: 30, description: '按鍵砍樹，連招不斷，打game專用' },
  
  // 史詩級別 (Epic)
  { id: 11, name: '迷因斧', icon: '💀', rarity: 'EPIC', attack: 35, attackInterval: 1200, goldChance: 0.65, goldMin: 25, goldMax: 50, description: '網路梗王，傷害爆表，有夠靠北' },
  { id: 12, name: 'NFT斧', icon: '🖼️', rarity: 'EPIC', attack: 40, attackInterval: 1100, goldChance: 0.7, goldMin: 28, goldMax: 55, description: '區塊鏈認證，價值連城，雖然沒用' },
  { id: 13, name: '抖音斧', icon: '🎵', rarity: 'EPIC', attack: 38, attackInterval: 1150, goldChance: 0.68, goldMin: 26, goldMax: 52, description: '音樂砍樹，節奏感拉滿，超洗腦' },
  { id: 14, name: '貓貓斧', icon: '🐱', rarity: 'EPIC', attack: 42, attackInterval: 1050, goldChance: 0.72, goldMin: 30, goldMax: 58, description: '超可愛但超強，反差萌，有夠香' },
  { id: 15, name: '咖啡斧', icon: '☕', rarity: 'EPIC', attack: 36, attackInterval: 1180, goldChance: 0.66, goldMin: 24, goldMax: 48, description: '熬夜神器，越砍越精神，不睡覺' },
  
  // 傳說級別 (Legendary)
  { id: 16, name: '衝一波斧', icon: '🔥', rarity: 'LEGENDARY', attack: 85, attackInterval: 650, goldChance: 0.85, goldMin: 60, goldMax: 100, description: '不管了直接衝，砍爆一切，有夠兇' },
  { id: 17, name: '秒殺斧', icon: '✨', rarity: 'LEGENDARY', attack: 95, attackInterval: 600, goldChance: 0.9, goldMin: 70, goldMax: 120, description: '秒殺全場，超強，直接輾壓' },
  { id: 18, name: '氛圍斧', icon: '🌊', rarity: 'LEGENDARY', attack: 88, attackInterval: 630, goldChance: 0.87, goldMin: 65, goldMax: 110, description: '氛圍感拉滿，超chill，超放鬆' },
  { id: 19, name: '優雅斧', icon: '💅', rarity: 'LEGENDARY', attack: 92, attackInterval: 610, goldChance: 0.88, goldMin: 68, goldMax: 115, description: '優雅砍樹，超有氣質，不騙你' },
  { id: 20, name: '超強斧', icon: '🚀', rarity: 'LEGENDARY', attack: 100, attackInterval: 580, goldChance: 0.92, goldMin: 75, goldMax: 130, description: '強到爆，真的超強，沒在唬' },
  
  // 額外傳說級別
  { id: 21, name: '可疑斧', icon: '😳', rarity: 'LEGENDARY', attack: 90, attackInterval: 620, goldChance: 0.89, goldMin: 67, goldMax: 112, description: '有點可疑但超強，真的假的' },
  { id: 22, name: '認真斧', icon: '🎯', rarity: 'LEGENDARY', attack: 98, attackInterval: 590, goldChance: 0.91, goldMin: 73, goldMax: 125, description: '不騙你，真的強，認真的' }
]

// Z世代創意斧頭資料庫（從 Firestore 加載）
const cardDatabase = ref([])

// 按稀有度分組卡片
const cardsByRarity = computed(() => {
  const weapons = cardDatabase.value.length > 0 ? cardDatabase.value : fallbackWeaponDatabase
  const grouped = {}
  weapons.forEach(card => {
    if (!grouped[card.rarity]) {
      grouped[card.rarity] = []
    }
    grouped[card.rarity].push(card)
  })
  return grouped
})

// 加權隨機抽取（基於攻擊傷害的權重）
const drawRandomCard = (targetRarity = null) => {
  const weapons = cardDatabase.value.length > 0 ? cardDatabase.value : fallbackWeaponDatabase
  // 如果指定了目標稀有度，只從該稀有度的卡片中抽取
  let availableCards = weapons
  if (targetRarity) {
    // 只抽取指定稀有度的武器
    availableCards = weapons.filter(card => card.rarity === targetRarity)
  }
  
  // 如果沒有可用卡片，返回 null
  if (availableCards.length === 0) {
    console.warn(`沒有找到稀有度為 ${targetRarity} 的武器`)
    return null
  }
  
  // 計算權重：每個稀有度內的武器都基於該稀有度內的最高傷害來計算
  // 這樣可以確保每個稀有度內的武器機率都不同
  const rarityOrder = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']
  
  // 如果指定了目標稀有度，只計算該稀有度內的權重
  // 如果沒有指定，則需要分別計算每個稀有度的權重
  let availableWeights = []
  
  if (targetRarity) {
    // 指定稀有度：只計算該稀有度內的權重
    const maxAttack = Math.max(...availableCards.map(card => card.attack))
    availableWeights = availableCards.map(card => {
      const attackDiff = maxAttack - card.attack + 1
      const weight = Math.pow(attackDiff, 2) // 平方權重
      return {
        card: card,
        weight: weight
      }
    })
  } else {
    // 普通抽卡：分別計算每個稀有度的權重，然後按稀有度機率加權
    const rarityWeights = {}
    
    // 先計算每個稀有度的總權重
    rarityOrder.forEach(rarity => {
      const rarityCards = availableCards.filter(card => card.rarity === rarity)
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
      const rarityProb = RARITY[rarity].weight / 100 // 稀有度機率（0-1）
      rarityWeights[rarity].forEach(item => {
        availableWeights.push({
          card: item.card,
          weight: item.weight * rarityProb // 按稀有度機率加權
        })
      })
    })
  }
  const availableTotalWeight = availableWeights.reduce((sum, item) => sum + item.weight, 0)
  
  // 按照權重隨機選擇
  const random = Math.random() * availableTotalWeight
  let currentWeight = 0
  
  for (const weightItem of availableWeights) {
    currentWeight += weightItem.weight
    if (random <= currentWeight) {
      return weightItem.card
    }
  }
  
  // 備用方案：返回第一張可用卡
  return availableCards[0] || weapons[0]
}

// 抽卡費用（舊版，保留兼容）
const drawCardCost = 200

// 不同稀有度的抽卡價格
const drawCardPrices = {
  COMMON: 200,      // 普通：200金錢
  RARE: 2000,       // 稀有：2000金錢
  EPIC: 20000,      // 史詩：20000金錢
  LEGENDARY: 200000 // 傳說：200000金錢
}

// 計算每秒金錢收益（預估值，實際是機率性的）
const estimatedGoldPerSecond = computed(() => {
  if (!currentAxe.value) return 0
  const card = currentAxe.value
  const attacksPerSecond = 1000 / card.attackInterval
  const expectedGoldPerAttack = (card.goldChance * (card.goldMin + card.goldMax) / 2)
  return attacksPerSecond * expectedGoldPerAttack
})

// 計算總攻擊力
const totalAttack = computed(() => {
  return currentAxe.value ? currentAxe.value.attack : 0
})

// 停止當前斧頭的攻擊計時器
const stopCurrentAttackTimer = () => {
  if (attackTimer.value) {
    clearInterval(attackTimer.value)
    attackTimer.value = null
  }
  if (attackCheckInterval.value) {
    clearInterval(attackCheckInterval.value)
    attackCheckInterval.value = null
  }
}

// 啟動當前斧頭的攻擊計時器（使用基於時間戳的方式，適用於手機瀏覽器）
const startCurrentAttackTimer = () => {
  if (!currentAxe.value) return
  
  stopCurrentAttackTimer()
  
  const card = currentAxe.value
  lastAttackTime.value = Date.now() // 記錄啟動時間
  
  // 使用基於時間戳的檢查方式，每100ms檢查一次（適合手機瀏覽器）
  attackCheckInterval.value = setInterval(() => {
    if (!currentAxe.value) {
      stopCurrentAttackTimer()
      return
    }
    
    const now = Date.now()
    const timeSinceLastAttack = now - lastAttackTime.value
    const requiredInterval = currentAxe.value.attackInterval
    
    // 如果已經過了攻擊間隔時間，執行攻擊
    // 考慮可能跳過的時間（例如手機卡頓），允許補償錯過的攻擊
    if (timeSinceLastAttack >= requiredInterval) {
      const attacksToExecute = Math.floor(timeSinceLastAttack / requiredInterval)
      // 限制補償次數，防止一次執行太多攻擊導致卡頓
      // 如果超過10次，只補償10次，剩餘時間重新開始計算
      const actualAttacks = Math.min(attacksToExecute, 10)
      
      // 執行補償攻擊（直接調用，因為每次攻擊都是獨立的）
      for (let i = 0; i < actualAttacks; i++) {
        attackTreeWithCurrentAxe(true) // 標記為自動攻擊，不更新活動時間
      }
      
      // 更新攻擊時間
      if (actualAttacks >= attacksToExecute) {
        // 如果補償了所有攻擊，保留剩餘時間
        const remainingTime = timeSinceLastAttack % requiredInterval
        lastAttackTime.value = now - remainingTime
      } else {
        // 如果還有更多攻擊需要補償，從當前時間重新開始（下次檢查時會繼續補償）
        lastAttackTime.value = now
      }
    }
  }, 100) // 每100ms檢查一次，減少檢查頻率但仍然精確
}

// 升級斧頭
const upgradeAxe = (axe, baseCard) => {
  // 升級：攻擊力增加 50%，金錢收益增加 30%，金錢機率增加 5%
  const previousLevel = axe.level || 1
  axe.level = previousLevel + 1
  
  // 計算升級後的屬性（基於基礎屬性）
  axe.attack = Math.floor(baseCard.attack * (1 + (axe.level - 1) * 0.5))
  axe.goldMin = Math.floor(baseCard.goldMin * (1 + (axe.level - 1) * 0.3))
  axe.goldMax = Math.floor(baseCard.goldMax * (1 + (axe.level - 1) * 0.3))
  axe.goldChance = Math.min(1.0, baseCard.goldChance + (axe.level - 1) * 0.05) // 每次升級增加 5% 機率，最高 100%
  
  // 更新描述以反映升級後的屬性
  const interval = (axe.attackInterval / 1000).toFixed(1)
  const chance = (axe.goldChance * 100).toFixed(0)
  axe.description = `每${interval}秒攻擊，${chance}%機率獲得${axe.goldMin}-${axe.goldMax}金錢 (Lv.${axe.level})`
}

// 更換當前使用的斧頭
const switchAxe = async (index) => {
  if (index < 0 || index >= inventory.value.length) return
  
  // 更新活動時間
  updateActivityTime()
  
  // 停止當前斧頭的攻擊計時器
  stopCurrentAttackTimer()
  
  // 切換斧頭
  currentAxeIndex.value = index
  
  // 啟動新斧頭的攻擊計時器
  startCurrentAttackTimer()
  
  // 更新用戶狀態（多人模式）
  if (isMultiplayerReady.value && currentAxe.value) {
    try {
      await updateUserStatus(props.user.uid, {
        currentWeapon: currentAxe.value.name
      })
    } catch (error) {
      console.error('更新用戶狀態失敗:', error)
    }
  }
}

// 計算斧頭的賣出價格
const getSellPrice = (axe) => {
  // 基礎價格根據稀有度
  const basePrices = {
    'COMMON': 50,
    'RARE': 150,
    'EPIC': 400,
    'LEGENDARY': 1000
  }
  
  const basePrice = basePrices[axe.rarity] || basePrices['COMMON']
  
  // 等級加成：每級增加 30% 價值
  const levelMultiplier = 1 + (axe.level - 1) * 0.3
  
  // 最終價格 = 基礎價格 * 等級倍率
  const finalPrice = Math.floor(basePrice * levelMultiplier)
  
  return finalPrice
}

// 賣出斧頭
const sellAxe = async (index, event) => {
  // 阻止事件冒泡，避免觸發卡片點擊
  if (event) {
    event.stopPropagation()
  }
  
  // 更新活動時間
  updateActivityTime()
  
  if (index < 0 || index >= inventory.value.length) return
  
  // 檢查是否只剩一把斧頭（且正在使用）
  if (inventory.value.length === 1 && currentAxeIndex.value === index) {
    showNotification('至少需要保留一把斧頭！', 'error')
    return
  }
  
  const axe = inventory.value[index]
  const sellPrice = getSellPrice(axe)
  
  // 如果是管理員或用戶沒有 UID，直接操作（本地模式）
  if (props.user.isAdmin || !props.user.uid) {
    const isCurrentAxe = currentAxeIndex.value === index
    let newAxeIndex = null
    
    if (isCurrentAxe) {
      stopCurrentAttackTimer()
      if (inventory.value.length > 1) {
        newAxeIndex = index === 0 ? 1 : 0
      }
    }
    
    inventory.value.splice(index, 1)
    
    if (isCurrentAxe) {
      if (newAxeIndex !== null) {
        currentAxeIndex.value = newAxeIndex > index ? newAxeIndex - 1 : newAxeIndex
        startCurrentAttackTimer()
      } else {
        currentAxeIndex.value = null
      }
    } else if (currentAxeIndex.value !== null && currentAxeIndex.value > index) {
      currentAxeIndex.value--
    }
    
    gold.value += sellPrice
    showNotification(`賣出 ${axe.name} 獲得 ${sellPrice} 金錢！`, 'success')
    return
  }
  
  // Firebase 用戶：通過服務器端驗證
  try {
    const result = await sellWeapon(props.user.uid, index, sellPrice)
    gold.value = result.gold
    inventory.value = result.inventory
    currentAxeIndex.value = result.currentAxeIndex
    
    // 如果賣出的是當前使用的武器，需要重新啟動計時器
    if (result.currentAxeIndex !== null && inventory.value[result.currentAxeIndex]) {
      stopCurrentAttackTimer()
      startCurrentAttackTimer()
    } else if (result.currentAxeIndex === null) {
      stopCurrentAttackTimer()
    }
    
    showNotification(`賣出 ${axe.name} 獲得 ${sellPrice} 金錢！`, 'success')
  } catch (error) {
    console.error('賣出武器失敗:', error)
    showNotification(error.message || '賣出武器失敗', 'error')
  }
}

// 更新用戶活動時間（用於離線收益計算）
const updateActivityTime = () => {
  lastActivityTime.value = Date.now()
  // 如果離線狀態存在，清除它（因為用戶又開始活動了）
  if (!props.user.isAdmin && props.user.uid && isMultiplayerReady.value) {
    clearOfflineState(props.user.uid).catch(err => console.error('清除離線狀態失敗:', err))
  }
}

// 註：已移除批量同步邏輯，現在所有數據都直接從後端返回

// 檢查並應用離線收益（定期調用，用於掛機時自動計算收益）
const checkAndApplyOfflineRewards = async () => {
  if (props.user.isAdmin || !props.user.uid) {
    return
  }
  
  try {
    console.log('定期檢查離線收益...')
    const rewards = await calculateOfflineRewards(props.user.uid)
    
    if (rewards && rewards.attackCount > 0) {
      console.log('發現離線收益，應用中...', rewards)
      const result = await applyOfflineRewards(props.user.uid, rewards)
      
      // 更新本地狀態
      gold.value = result.newGold
      totalDamage.value = result.newTotalDamage
      totalGoldEarned.value = result.newTotalGoldEarned
      
      // 顯示離線收益通知
      showNotification(
        `💰 掛機收益：${rewards.offlineHours}小時內攻擊 ${rewards.attackCount} 次，造成 ${rewards.totalDamage} 傷害，獲得 ${rewards.totalGoldEarned} 金錢！`,
        'success'
      )
      console.log('✓ 離線收益已應用並顯示')
      
      // 更新檢查時間
      lastOfflineRewardCheck.value = Date.now()
    } else {
      console.log('沒有離線收益（離線時間太短或沒有離線狀態）')
    }
  } catch (error) {
    console.error('檢查離線收益失敗:', error)
  }
}

// 使用當前斧頭攻擊樹（後端權威模式：所有數據來自後端）
// isAutoAttack: 是否為自動攻擊（自動攻擊不更新活動時間，避免影響離線收益計算）
const attackTreeWithCurrentAxe = async (isAutoAttack = false) => {
  if (!currentAxe.value || treeHealth.value <= 0) return
  
  // 只有非自動攻擊才更新活動時間（自動攻擊不應該影響離線收益計算）
  if (!isAutoAttack) {
    updateActivityTime()
  }
  
  const card = currentAxe.value
  const weaponId = card.baseId || card.id
  const weaponLevel = card.level || 1
  
  // 必須連接多人模式才能攻擊（管理員除外）
  if (props.user.isAdmin) {
    attackTreeLocal()
    return
  }
  
  // 檢查多人模式是否已連接
  if (!isMultiplayerReady.value) {
    showNotification('無法攻擊：多人模式未連接。請等待連接成功或重新載入頁面。', 'error')
    return
  }
  
  try {
    // 發送到 Firebase（使用武器 ID 和等級，服務器端會驗證並計算傷害和金錢）
    const result = await attackTree(
      props.user.uid,
      props.user.displayName || props.user.email || '未知玩家',
      weaponId,
      weaponLevel
    )
    
    // 後端返回的數據（權威數據源）
    if (result && result.userData) {
      // 使用後端返回的數據更新前端狀態
      gold.value = result.userData.gold
      totalGoldEarned.value = result.userData.totalGoldEarned
      totalDamage.value = result.userData.totalDamage
      
      // 顯示獲得的金錢（如果有）
      if (result.userData.goldGained && result.userData.goldGained > 0) {
        card.lastGoldGained = result.userData.goldGained
      } else {
        card.lastGoldGained = 0
      }
    }
    
    // 更新用戶狀態
    if (currentAxe.value) {
      await updateUserStatus(props.user.uid, {
        userName: props.user.displayName || props.user.email,
        currentWeapon: currentAxe.value.name,
        totalDamage: totalDamage.value
      })
    }
  } catch (error) {
    console.error('攻擊失敗:', error)
    showNotification('攻擊失敗：' + (error.message || '未知錯誤'), 'error')
  }
}

// 本地攻擊模式（備用）
const attackTreeLocal = async () => {
  if (!currentAxe.value || treeHealth.value <= 0) return
  
  // 檢查用戶是否超過3天未上線（停止傷害計算）
  if (props.user.uid && !props.user.isAdmin) {
    try {
      const { getUserData } = await import('../utils/userService')
      const userData = await getUserData(props.user.uid)
      
      if (userData && userData.lastLogin) {
        // 將 Firestore Timestamp 轉換為 Date
        const lastLoginDate = userData.lastLogin.toDate ? userData.lastLogin.toDate() : new Date(userData.lastLogin)
        const now = new Date()
        const daysSinceLogin = (now - lastLoginDate) / (1000 * 60 * 60 * 24) // 轉換為天數
        
        // 如果超過3天未上線，停止傷害計算
        if (daysSinceLogin > 3) {
          console.log(`用戶已超過3天未上線（${daysSinceLogin.toFixed(1)}天），停止傷害計算`)
          showNotification(`您已超過3天未上線，請重新登入以繼續遊戲`, 'warning')
          return
        }
      }
    } catch (error) {
      console.error('檢查用戶登入時間失敗:', error)
      // 如果檢查失敗，繼續正常流程（避免影響遊戲體驗）
    }
  }
  
  const card = currentAxe.value
  const damage = card.attack
  treeHealth.value -= damage
  totalDamage.value += damage
  
  // 機率性獲得金錢（不得小於0）
  if (Math.random() <= card.goldChance) {
    const goldGained = Math.max(0, Math.floor(
      Math.random() * (card.goldMax - card.goldMin + 1) + card.goldMin
    ))
    
    // 如果是管理員或用戶沒有 UID，直接操作（本地模式）
    if (props.user.isAdmin || !props.user.uid) {
      gold.value += goldGained
      totalGoldEarned.value += goldGained
      card.lastGoldGained = goldGained
      saveGameDataToFirestore(true)
    } else {
      // 註：非管理員用戶應該使用後端攻擊API（attackTreeWithCurrentAxe），這裡不應該執行
      console.warn('非管理員用戶使用了本地攻擊模式，這不應該發生')
    }
  } else {
    card.lastGoldGained = 0
  }
  
  // 如果樹被擊敗
  if (treeHealth.value <= 0) {
    treeHealth.value = 0
    treeDefeatedCount.value++
    // 使用 setTimeout 避免在非 async 函數中使用 await
    setTimeout(async () => {
      await checkAchievement('tree_defeated')
    }, 0)
    showNotification('恭喜！你擊敗了樹大招風！', 'success')
    // 重置樹的血量
    treeHealth.value = maxTreeHealth.value
  }
}

// 處理武器數據（返回新武器對象，不直接修改）
const processWeaponData = (baseCard) => {
  return { 
    ...baseCard,
    baseId: baseCard.id,
    baseCard: baseCard,
    instanceId: Date.now() + Math.random(),
    level: 1,
    lastGoldGained: 0
  }
}

// 處理單個武器（添加或升級）
const processWeapon = async (baseCard, isFirstWeapon = false) => {
  // 檢查背包中是否已有相同 id 的斧頭
  const existingAxeIndex = inventory.value.findIndex(axe => axe.baseId === baseCard.id)
  
  if (existingAxeIndex !== -1) {
    // 如果已存在，則升級
    const existingAxe = inventory.value[existingAxeIndex]
    // 如果沒有保存基礎卡片，則保存
    if (!existingAxe.baseCard) {
      existingAxe.baseCard = baseCard
    }
    upgradeAxe(existingAxe, existingAxe.baseCard || baseCard)
    showNotification(`升級成功！${existingAxe.name} 升至 ${existingAxe.level} 級！攻擊力：${existingAxe.attack} | 金錢機率：${(existingAxe.goldChance * 100).toFixed(0)}%`, 'success')
    
    // 如果是 Firebase 用戶（非管理員），更新到服務器
    if (!props.user.isAdmin && props.user.uid) {
      try {
        await upgradeWeaponInInventory(props.user.uid, existingAxeIndex, existingAxe)
      } catch (error) {
        console.error('更新武器失敗:', error)
      }
    }
    
    // 如果正在使用這把斧頭，需要重啟計時器
    if (currentAxeIndex.value === existingAxeIndex) {
      stopCurrentAttackTimer()
      startCurrentAttackTimer()
    }
  } else {
    // 如果不存在，則加入背包
    const newAxe = { 
      ...baseCard,
      baseId: baseCard.id, // 保存基礎 ID 用於識別相同類型的斧頭
      baseCard: baseCard, // 保存基礎卡片資料用於升級計算
      instanceId: Date.now() + Math.random(), // 唯一ID
      level: 1, // 等級
      lastGoldGained: 0
    }
    inventory.value.push(newAxe)
    
    // 如果是第一把斧頭，自動裝備
    if (isFirstWeapon && currentAxeIndex.value === null) {
      currentAxeIndex.value = inventory.value.length - 1
      startCurrentAttackTimer()
    }
    
    showNotification(`獲得新斧頭：${newAxe.name}！`, 'success')
    
    // 立即保存（獲得新武器時）
    saveGameDataToFirestore(true)
    
    // 如果抽到傳說級武器，發送公告（管理員不發送）
    if (baseCard.rarity === 'LEGENDARY' && !props.user.isAdmin) {
      const userName = props.user.displayName || props.user.email || '未知玩家'
      const userId = props.user.uid
      
      // 使用 setTimeout 避免在非 async 函數中使用 await
      setTimeout(async () => {
        if (isMultiplayerReady.value) {
          try {
            await sendLegendaryAnnouncement(userId, userName, baseCard.name)
          } catch (error) {
            console.error('發送傳說武器公告失敗:', error)
          }
        }
      }, 0)
    }
  }
}

// 抽武器（加入背包或升級現有斧頭）
const drawCard = async (rarity = null) => {
  // 更新活動時間
  updateActivityTime()
  
  // 根據稀有度確定價格
  const cost = rarity ? drawCardPrices[rarity] : drawCardCost
  
  if (gold.value < cost) {
    showNotification(`金錢不足！需要 ${cost} 金錢，目前只有 ${gold.value}`, 'error')
    return
  }

  // 如果是管理員或用戶沒有 UID，直接操作（本地模式）
  if (props.user.isAdmin || !props.user.uid) {
    gold.value -= cost
    totalDrawCount.value++
    
    // 根據稀有度決定抽取的武器組合
    const rarityOrder = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']
    const cardsToDraw = []
    
    if (!rarity || rarity === 'COMMON') {
      cardsToDraw.push({ rarity: 'COMMON', isFirst: currentAxeIndex.value === null })
    } else {
      const rarityIndex = rarityOrder.indexOf(rarity)
      if (rarityIndex !== -1) {
        for (let i = rarityIndex; i >= 0; i--) {
          cardsToDraw.push({ 
            rarity: rarityOrder[i], 
            isFirst: i === rarityIndex && currentAxeIndex.value === null 
          })
        }
      }
    }
    
    cardsToDraw.forEach((cardInfo, index) => {
      const baseCard = drawRandomCard(cardInfo.rarity)
      if (baseCard) {
        processWeapon(baseCard, cardInfo.isFirst && index === 0)
      }
    })
    return
  }
  
  // Firebase 用戶：通過服務器端驗證（後端計算機率）
  try {
    const result = await drawCardWithValidation(props.user.uid, rarity || 'COMMON', cost)
    gold.value = result.newGold
    totalDrawCount.value++
    
    // 使用後端返回的武器（後端已計算機率並選擇）
    if (result.selectedWeapon) {
      const baseCard = result.selectedWeapon
      await processWeapon(baseCard, currentAxeIndex.value === null)
    } else {
      throw new Error('後端未返回武器')
    }
  } catch (error) {
    console.error('抽卡失敗:', error)
    showNotification(error.message || '抽卡失敗', 'error')
  }
}

// 樹的血量百分比
const treeHealthPercent = computed(() => {
  if (maxTreeHealth.value === 0) return 0
  return (treeHealth.value / maxTreeHealth.value) * 100
})

// 頁面切換
const currentPage = ref('game') // 'game', 'inventory', 'probability', 'achievements', 'draw', 'chat'

// 聊天室狀態
const chatMessages = ref([]) // 聊天記錄
const chatInput = ref('') // 聊天輸入框
const chatUnsubscribe = ref(null) // 聊天監聽器
const isChatReady = ref(false) // 聊天室是否已初始化
const chatContainer = ref(null) // 聊天容器引用

// 過濾掉管理員和測試玩家的消息（只顯示正式玩家的消息）
const filteredChatMessages = computed(() => {
  return chatMessages.value.filter(message => {
    // 過濾掉測試玩家和管理員的消息（userId 以 'test-' 或 'admin-' 開頭）
    const userId = message.userId || ''
    return !userId.startsWith('test-') && !userId.startsWith('admin-')
  })
})

// 初始化聊天室（必須連接多人模式）
const initChat = async () => {
  try {
    // 管理員可以跳過
    if (props.user.isAdmin) {
      chatMessages.value = getLocalMessages()
      isChatReady.value = true
      return
    }
    
    // 非管理員必須連接多人模式才能使用聊天室
    if (!isMultiplayerReady.value) {
      const errorMsg = '無法初始化聊天室：多人模式未連接'
      console.error('❌', errorMsg)
      isChatReady.value = false
      showNotification(errorMsg, 'error')
      return
    }
    
    // Firebase 用戶：訂閱聊天消息（過濾掉測試玩家的消息）
    if (isMultiplayerReady.value && props.user.uid) {
      chatUnsubscribe.value = subscribeChatMessages((messages) => {
        chatMessages.value = messages
          .map(msg => ({
            ...msg,
            timestamp: msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp || Date.now())
          }))
          .filter(msg => {
            // 過濾掉測試玩家和管理員的消息（userId 以 'test-' 或 'admin-' 開頭）
            const userId = msg.userId || ''
            return !userId.startsWith('test-') && !userId.startsWith('admin-')
          })
      }, 50)
      isChatReady.value = true
    } else {
      // 多人模式未連接，無法使用聊天室
      isChatReady.value = false
      console.error('❌ 聊天室初始化失敗：多人模式未連接')
    }
  } catch (error) {
    console.error('初始化聊天室失敗:', error)
    // 失敗時使用本地存儲
    chatMessages.value = getLocalMessages()
    isChatReady.value = true
  }
}

// 發送聊天消息
const sendChatMessage = async () => {
  const message = chatInput.value.trim()
  if (!message || !isChatReady.value) return
  
  // 管理員不能發送消息到聊天室
  if (props.user.isAdmin) {
    showNotification('管理員無法發送消息到聊天室', 'error')
    chatInput.value = ''
    return
  }
  
  const userName = props.user.displayName || props.user.email || '未知玩家'
  const userId = props.user.uid
  
  try {
    if (isMultiplayerReady.value && props.user.uid) {
      // Firebase 用戶：發送到 Firestore
      const { sendChatMessage: sendFirebaseMessage } = await import('../utils/chatService')
      await sendFirebaseMessage(userId, userName, message, 'normal')
      // 發送成功後，消息會通過監聽器自動更新，所以不需要手動添加
    } else {
      // 多人模式未連接，無法發送消息
      showNotification('無法發送消息：多人模式未連接。', 'error')
    }
    
    chatInput.value = ''
  } catch (error) {
    console.error('發送聊天消息失敗:', error)
    showNotification('發送消息失敗: ' + (error.message || '未知錯誤'), 'error')
  }
}

// 滾動聊天到底部
const scrollChatToBottom = () => {
  if (chatContainer.value) {
    setTimeout(() => {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }, 100)
  }
}

const switchPage = (page) => {
  currentPage.value = page
  // 切換頁面時取消升級模式
  if (page !== 'inventory') {
    upgradeMode.value = false
    selectedUpgradeAxeIndex.value = null
    selectedSacrificeAxeIndices.value = []
  }
}

// 機率頁面輪播系統
const carouselIndices = ref({}) // 每個稀有度的當前輪播索引

// 初始化輪播索引
const initCarouselIndices = () => {
  Object.keys(cardsByRarity.value).forEach(rarity => {
    if (carouselIndices.value[rarity] === undefined) {
      carouselIndices.value[rarity] = 0
    }
  })
}

// 切換到下一個（輪播）
const nextCard = (rarity) => {
  const cards = cardsByRarity.value[rarity] || []
  if (cards.length === 0) return
  carouselIndices.value[rarity] = (carouselIndices.value[rarity] + 1) % cards.length
}

// 切換到上一個（輪播）
const prevCard = (rarity) => {
  const cards = cardsByRarity.value[rarity] || []
  if (cards.length === 0) return
  carouselIndices.value[rarity] = carouselIndices.value[rarity] === 0 
    ? cards.length - 1 
    : carouselIndices.value[rarity] - 1
}

// 獲取當前顯示的卡片
const getCurrentCard = (rarity) => {
  const cards = cardsByRarity.value[rarity] || []
  const index = carouselIndices.value[rarity] || 0
  return cards[index] || null
}

// 獲取稀有度的總機率百分比
const getRarityTotalProbability = (rarity) => {
  if (!RARITY[rarity]) return 0
  const totalWeight = Object.values(RARITY).reduce((sum, r) => sum + r.weight, 0)
  return ((RARITY[rarity].weight / totalWeight) * 100).toFixed(1)
}

// 獲取單個卡片在該稀有度內的機率百分比（基於傷害的權重計算）
const getCardProbability = (card) => {
  if (!card || !card.rarity) return 0
  const cards = cardsByRarity.value[card.rarity] || []
  if (cards.length === 0) return 0
  
  // 該稀有度的總機率
  const rarityTotalProb = parseFloat(getRarityTotalProbability(card.rarity))
  
  // 計算該稀有度內所有武器的權重（基於傷害）
  const maxAttack = Math.max(...cards.map(c => c.attack))
  const cardWeights = cards.map(c => {
    const attackDiff = maxAttack - c.attack + 1
    return Math.pow(attackDiff, 2) // 使用平方權重
  })
  const totalWeight = cardWeights.reduce((sum, w) => sum + w, 0)
  
  // 計算該卡片的權重
  const cardAttackDiff = maxAttack - card.attack + 1
  const cardWeight = Math.pow(cardAttackDiff, 2)
  
  // 該卡片在該稀有度內的機率 = 稀有度總機率 * (該卡片權重 / 總權重)
  const cardProbInRarity = (cardWeight / totalWeight) * 100
  const finalProb = (rarityTotalProb / 100) * cardProbInRarity
  
  return finalProb.toFixed(2)
}

// 監聽cardsByRarity變化，初始化索引
watch(cardsByRarity, () => {
  initCarouselIndices()
}, { immediate: true, deep: true })

// 獻祭升級系統
const upgradeMode = ref(false) // 是否處於升級模式
const selectedUpgradeAxeIndex = ref(null) // 要升級的斧頭索引
const selectedSacrificeAxeIndices = ref([]) // 要獻祭的斧頭索引（多選）

// 武器詳情彈窗
const showWeaponModal = ref(false) // 是否顯示武器詳情彈窗
const selectedWeaponIndex = ref(null) // 選中的武器索引
const showBaseWeaponModal = ref(false) // 是否顯示基礎武器詳情彈窗（用於概率頁面）
const selectedBaseWeapon = ref(null) // 選中的基礎武器數據（用於概率頁面）

// 進入升級模式
const enterUpgradeMode = () => {
  if (inventory.value.length < 2) {
    showNotification('至少需要兩把斧頭才能進行獻祭升級！', 'error')
    return
  }
  upgradeMode.value = true
  // 預設選擇當前使用的武器進行升級
  selectedUpgradeAxeIndex.value = currentAxeIndex.value !== null ? currentAxeIndex.value : null
  selectedSacrificeAxeIndices.value = []
}

// 取消升級模式
const cancelUpgradeMode = () => {
  upgradeMode.value = false
  selectedUpgradeAxeIndex.value = null
  selectedSacrificeAxeIndices.value = []
}

// 選擇要升級的斧頭
const selectUpgradeAxe = (index) => {
  if (selectedSacrificeAxeIndices.value.includes(index)) {
    showNotification('不能選擇同一把斧頭！', 'error')
    return
  }
  selectedUpgradeAxeIndex.value = index
}

// 選擇要獻祭的斧頭（多選）
const toggleSacrificeAxe = (index) => {
  if (selectedUpgradeAxeIndex.value === index) {
    showNotification('不能選擇同一把斧頭！', 'error')
    return
  }
  
  // 不能獻祭正在使用的斧頭
  if (currentAxeIndex.value === index) {
    showNotification('不能獻祭正在使用的斧頭！', 'error')
    return
  }
  
  const idx = selectedSacrificeAxeIndices.value.indexOf(index)
  if (idx > -1) {
    // 取消選擇
    selectedSacrificeAxeIndices.value.splice(idx, 1)
  } else {
    // 添加選擇
    selectedSacrificeAxeIndices.value.push(index)
  }
}

// 按稀有度批量選擇/取消選擇獻祭武器
const toggleSacrificeByRarity = (rarity, event) => {
  // 防止事件冒泡，避免觸發其他點擊事件
  if (event) {
    event.stopPropagation()
  }
  
  // 獲取該稀有度的所有武器索引
  const rarityIndices = inventory.value
    .map((axe, index) => ({ axe, index }))
    .filter(({ axe, index }) => {
      // 過濾條件：相同稀有度、不是升級目標、不是正在使用的
      return (axe.rarity || 'COMMON') === rarity 
        && index !== selectedUpgradeAxeIndex.value
        && index !== currentAxeIndex.value
    })
    .map(({ index }) => index)
  
  if (rarityIndices.length === 0) {
    showNotification('該稀有度沒有可獻祭的武器', 'info')
    return
  }
  
  // 檢查該稀有度的所有武器是否都已選中
  const allSelected = rarityIndices.every(idx => selectedSacrificeAxeIndices.value.includes(idx))
  
  if (allSelected) {
    // 如果全部已選中，則取消選擇
    rarityIndices.forEach(idx => {
      const index = selectedSacrificeAxeIndices.value.indexOf(idx)
      if (index > -1) {
        selectedSacrificeAxeIndices.value.splice(index, 1)
      }
    })
    showNotification(`已取消選擇 ${rarityIndices.length} 把 ${RARITY[rarity]?.name || rarity} 武器`, 'info')
  } else {
    // 如果未全部選中，則添加所有未選中的
    const addedCount = rarityIndices.filter(idx => !selectedSacrificeAxeIndices.value.includes(idx)).length
    rarityIndices.forEach(idx => {
      if (!selectedSacrificeAxeIndices.value.includes(idx)) {
        selectedSacrificeAxeIndices.value.push(idx)
      }
    })
    showNotification(`已選擇 ${addedCount} 把 ${RARITY[rarity]?.name || rarity} 武器`, 'info')
  }
}

// 計算每個稀有度被選中的數量
const getRaritySelectedCount = (rarity) => {
  return inventory.value
    .map((axe, index) => ({ axe, index }))
    .filter(({ axe, index }) => {
      return (axe.rarity || 'COMMON') === rarity 
        && selectedSacrificeAxeIndices.value.includes(index)
        && index !== selectedUpgradeAxeIndex.value
        && index !== currentAxeIndex.value
    }).length
}

// 計算每個稀有度的總數量（可獻祭的）
const getRarityTotalCount = (rarity) => {
  return inventory.value
    .filter((axe, index) => {
      return (axe.rarity || 'COMMON') === rarity 
        && index !== selectedUpgradeAxeIndex.value
        && index !== currentAxeIndex.value
    }).length
}

// 檢查稀有度是否全部選中
const isRarityAllSelected = (rarity) => {
  const total = getRarityTotalCount(rarity)
  const selected = getRaritySelectedCount(rarity)
  return total > 0 && selected === total
}

// 顯示武器詳情彈窗
const showWeaponDetails = (index) => {
  selectedWeaponIndex.value = index
  showWeaponModal.value = true
}

// 關閉武器詳情彈窗
const closeWeaponModal = () => {
  showWeaponModal.value = false
  selectedWeaponIndex.value = null
}

// 顯示基礎武器詳情彈窗（用於概率頁面）
const showBaseWeaponDetails = (weapon) => {
  selectedBaseWeapon.value = weapon
  showBaseWeaponModal.value = true
}

// 關閉基礎武器詳情彈窗
const closeBaseWeaponModal = () => {
  showBaseWeaponModal.value = false
  selectedBaseWeapon.value = null
}

// 獻祭升級（隨機提升攻擊間隔，支持多選）
const sacrificeUpgrade = async () => {
  // 更新活動時間
  updateActivityTime()
  
  if (selectedUpgradeAxeIndex.value === null || selectedSacrificeAxeIndices.value.length === 0) {
    showNotification('請選擇要升級的斧頭和至少一把要獻祭的斧頭！', 'error')
    return
  }
  
  if (selectedSacrificeAxeIndices.value.includes(selectedUpgradeAxeIndex.value)) {
    showNotification('不能選擇同一把斧頭！', 'error')
    return
  }
  
  if (selectedUpgradeAxeIndex.value >= inventory.value.length) {
    showNotification('選擇的斧頭不存在！', 'error')
    return
  }
  
  // 檢查所有獻祭的斧頭是否存在
  for (const idx of selectedSacrificeAxeIndices.value) {
    if (idx >= inventory.value.length) {
      showNotification('選擇的斧頭不存在！', 'error')
      return
    }
    // 不能獻祭正在使用的斧頭
    if (currentAxeIndex.value === idx) {
      showNotification('不能獻祭正在使用的斧頭！', 'error')
      return
    }
  }
  
  // 至少要保留一把斧頭
  if (inventory.value.length - selectedSacrificeAxeIndices.value.length < 1) {
    showNotification('至少需要保留一把斧頭！', 'error')
    return
  }
  
  const upgradeAxe = inventory.value[selectedUpgradeAxeIndex.value]
  
  // 計算所有獻祭武器的總提升（帶遞減效果）
  let totalBoost = 0
  const sacrificeAxeNames = []
  
  // 按索引從大到小排序，這樣從後往前刪除不會影響前面的索引
  const sortedSacrificeIndices = [...selectedSacrificeAxeIndices.value].sort((a, b) => b - a)
  
  for (let i = 0; i < sortedSacrificeIndices.length; i++) {
    const sacrificeIndex = sortedSacrificeIndices[i]
    const sacrificeAxe = inventory.value[sacrificeIndex]
    const sacrificeLevel = sacrificeAxe.level || 1
    
    // 根據被獻祭武器的等級計算隨機提升%數（降低基礎提升）
    const minBoost = 3 + (sacrificeLevel - 1) * 1.5  // 降低基礎提升：從5改為3，從2改為1.5
    const maxBoost = 10 + (sacrificeLevel - 1) * 3   // 降低最大提升：從15改為10，從5改為3
    const randomBoost = Math.random() * (maxBoost - minBoost) + minBoost
    
    // 遞減效果：每多獻祭一把，提升效果減少 25%
    const decayFactor = Math.pow(0.75, i) // 第一把100%，第二把75%，第三把56.25%...
    totalBoost += randomBoost * decayFactor
    
    sacrificeAxeNames.push(`${sacrificeAxe.name} (Lv.${sacrificeLevel})`)
  }
  
  // 設定單次獻祭的最大提升上限（40%）
  const maxBoost = 40
  totalBoost = Math.min(totalBoost, maxBoost)
  
  // 減少攻擊間隔（提升攻擊速度）
  const originalInterval = upgradeAxe.attackInterval
  const boostPercent = totalBoost / 100
  
  // 增加最低限制和上限
  const baseInterval = upgradeAxe.baseCard?.attackInterval || originalInterval
  const minInterval = Math.max(500, baseInterval * 0.4) // 最低為基礎間隔的40%，但不少於500ms
  const maxReduction = 0.6 // 最多減少60%的攻擊間隔
  const effectiveBoost = Math.min(boostPercent, maxReduction)
  const newInterval = Math.max(minInterval, Math.floor(originalInterval * (1 - effectiveBoost)))
  upgradeAxe.attackInterval = newInterval
  
  // 保存索引（僅用於本地模式計算）
  const upgradeIndex = selectedUpgradeAxeIndex.value
  const isCurrentAxeBeingUpgraded = currentAxeIndex.value === upgradeIndex
  
  // 計算實際的提升百分比（考慮上限）
  const actualBoostPercent = ((originalInterval - newInterval) / originalInterval * 100).toFixed(1)
  const boostDisplay = totalBoost.toFixed(1)
  const oldInterval = (originalInterval / 1000).toFixed(1)
  const newIntervalDisplay = (newInterval / 1000).toFixed(1)
  
  // 如果是管理員或用戶沒有 UID，直接操作（本地模式）
  if (props.user.isAdmin || !props.user.uid) {
    // 本地模式下，直接從前端移除被獻祭的武器
    const sortedIndices = [...sortedSacrificeIndices]
    for (const sacrificeIndex of sortedIndices) {
      inventory.value.splice(sacrificeIndex, 1)
      
      // 調整當前使用斧頭的索引
      if (currentAxeIndex.value !== null && currentAxeIndex.value > sacrificeIndex) {
        currentAxeIndex.value--
      }
    }
    
    // 如果升級的是當前使用的斧頭，更新索引並重啟計時器
    if (isCurrentAxeBeingUpgraded) {
      let newUpgradeIndex = upgradeIndex
      for (const sacrificeIndex of sortedIndices) {
        if (sacrificeIndex < upgradeIndex) {
          newUpgradeIndex--
        }
      }
      currentAxeIndex.value = newUpgradeIndex
      stopCurrentAttackTimer()
      startCurrentAttackTimer()
    }
    
    totalSacrificeCount.value++
    showNotification(`獻祭成功！${upgradeAxe.name} 攻擊間隔減少 ${actualBoostPercent}% (${oldInterval}秒 → ${newIntervalDisplay}秒)`, 'success')
    saveGameDataToFirestore(true)
    cancelUpgradeMode()
    return
  }
  
  // Firebase 用戶：通過服務器端驗證
  try {
    const result = await sacrificeUpgradeWithValidation(
      props.user.uid,
      selectedUpgradeAxeIndex.value,
      selectedSacrificeAxeIndices.value,
      upgradeAxe,
      gold.value
    )
    
    // 使用後端返回的背包、當前武器索引和金錢，避免前後端數據不一致
    inventory.value = result.inventory
    currentAxeIndex.value = result.currentAxeIndex
    if (result.gold !== undefined) {
      gold.value = result.gold // 同步後端金錢
    }
    totalSacrificeCount.value++
    
    // 如果當前有裝備武器，重新啟動計時器；否則停止
    if (currentAxeIndex.value !== null && inventory.value[currentAxeIndex.value]) {
      stopCurrentAttackTimer()
      startCurrentAttackTimer()
    } else {
      stopCurrentAttackTimer()
    }
    
    showNotification(`獻祭成功！${upgradeAxe.name} 攻擊間隔減少 ${actualBoostPercent}% (${oldInterval}秒 → ${newIntervalDisplay}秒)`, 'success')
    cancelUpgradeMode()
  } catch (error) {
    console.error('獻祭升級失敗:', error)
    showNotification(error.message || '獻祭升級失敗', 'error')
  }
}

// 通知系統
const notification = ref(null)
const notificationTimer = ref(null)

const showNotification = (message, type = 'info') => {
  notification.value = { message, type }
  
  // 清除之前的計時器
  if (notificationTimer.value) {
    clearTimeout(notificationTimer.value)
  }
  
  // 3秒後自動隱藏
  notificationTimer.value = setTimeout(() => {
    notification.value = null
  }, 3000)
}

const hideNotification = () => {
  notification.value = null
  if (notificationTimer.value) {
    clearTimeout(notificationTimer.value)
    notificationTimer.value = null
  }
}

// 成就系統
const achievements = ref([
  { 
    id: 'first_weapon', 
    name: '第一把武器', 
    description: '獲得第一把武器', 
    icon: '🪓', 
    unlocked: false,
    progress: 0,
    target: 1,
    type: 'weapon_count'
  },
  { 
    id: 'weapon_collector', 
    name: '武器收藏家', 
    description: '擁有10把武器', 
    icon: '🎒', 
    unlocked: false,
    progress: 0,
    target: 10,
    type: 'weapon_count'
  },
  { 
    id: 'legendary_owner', 
    name: '傳說擁有者', 
    description: '獲得傳說級武器', 
    icon: '✨', 
    unlocked: false,
    progress: 0,
    target: 1,
    type: 'legendary_count'
  },
  { 
    id: 'rich_player', 
    name: '大富翁', 
    description: '累積獲得10000金錢', 
    icon: '💰', 
    unlocked: false,
    progress: 0,
    target: 10000,
    type: 'total_gold'
  },
  { 
    id: 'damage_dealer', 
    name: '傷害輸出者', 
    description: '造成100000總傷害', 
    icon: '⚔️', 
    unlocked: false,
    progress: 0,
    target: 100000,
    type: 'total_damage'
  },
  { 
    id: 'tree_defeated', 
    name: '樹大招風終結者', 
    description: '擊敗樹大招風', 
    icon: '🌳', 
    unlocked: false,
    progress: 0,
    target: 1,
    type: 'tree_defeated'
  },
  { 
    id: 'upgrade_master', 
    name: '升級大師', 
    description: '將武器升級到5級', 
    icon: '⬆️', 
    unlocked: false,
    progress: 0,
    target: 5,
    type: 'max_level'
  },
  { 
    id: 'card_drawer', 
    name: '抽卡達人', 
    description: '抽卡50次', 
    icon: '🎴', 
    unlocked: false,
    progress: 0,
    target: 50,
    type: 'draw_count'
  },
  { 
    id: 'sacrifice_expert', 
    name: '獻祭專家', 
    description: '進行10次獻祭升級', 
    icon: '🔥', 
    unlocked: false,
    progress: 0,
    target: 10,
    type: 'sacrifice_count'
  },
  { 
    id: 'epic_collector', 
    name: '史詩收藏家', 
    description: '擁有5把史詩級武器', 
    icon: '💜', 
    unlocked: false,
    progress: 0,
    target: 5,
    type: 'epic_count'
  }
])

// 成就進度追蹤
const totalGoldEarned = ref(0) // 累積獲得的總金錢
const totalDrawCount = ref(0) // 總抽卡次數
const totalSacrificeCount = ref(0) // 總獻祭次數
const legendaryCount = ref(0) // 傳說級武器數量
const epicCount = ref(0) // 史詩級武器數量
const maxWeaponLevel = ref(0) // 最高武器等級

// 註：已移除樂觀更新機制，現在所有數據都直接從後端返回

// 離線收益定期檢查機制
const offlineRewardCheckTimer = ref(null) // 離線收益檢查定時器
const OFFLINE_REWARD_CHECK_INTERVAL = 60000 // 每1分鐘檢查一次離線收益
const lastOfflineRewardCheck = ref(Date.now()) // 上次檢查離線收益的時間
const treeDefeatedCount = ref(0) // 擊敗樹的次數

// 保存遊戲資料到 Firestore
const saveGameDataToFirestore = async (immediate = false) => {
  // 如果是測試用戶，不保存
  if (props.user.isAdmin || !props.user.uid) {
    return
  }
  
  // 如果正在保存，且不是立即保存，則跳過
  if (isSaving.value && !immediate) {
    return
  }
  
  try {
    isSaving.value = true
    
    // 序列化成就數據（只保存解鎖狀態）
    const achievementsData = achievements.value.map(a => ({
      id: a.id,
      unlocked: a.unlocked,
      progress: a.progress || 0
    }))
    
    await saveGameData(props.user.uid, {
      gold: gold.value,
      inventory: inventory.value,
      currentAxeIndex: currentAxeIndex.value,
      totalDamage: totalDamage.value,
      totalGoldEarned: totalGoldEarned.value,
      totalDrawCount: totalDrawCount.value,
      totalSacrificeCount: totalSacrificeCount.value,
      legendaryCount: legendaryCount.value,
      epicCount: epicCount.value,
      maxWeaponLevel: maxWeaponLevel.value,
      treeDefeatedCount: treeDefeatedCount.value,
      achievements: achievementsData
    })
    
    if (immediate) {
      console.log('✓ 遊戲資料已保存')
    }
  } catch (error) {
    console.error('保存遊戲資料失敗:', error)
  } finally {
    isSaving.value = false
  }
}

// 加載遊戲資料從 Firestore
const loadGameDataFromFirestore = async () => {
  // 如果是管理員或用戶沒有 UID，不加載
  if (props.user.isAdmin || !props.user.uid) {
    return
  }
  
  try {
    // 先從 props.user.gameData 加載（如果有的話）
    if (props.user.gameData) {
      const data = props.user.gameData
      gold.value = data.gold || gold.value
      inventory.value = data.inventory || []
      currentAxeIndex.value = data.currentAxeIndex !== null ? data.currentAxeIndex : null
      totalDamage.value = data.totalDamage || 0
      totalGoldEarned.value = data.totalGoldEarned || 0
      totalDrawCount.value = data.totalDrawCount || 0
      totalSacrificeCount.value = data.totalSacrificeCount || 0
      legendaryCount.value = data.legendaryCount || 0
      epicCount.value = data.epicCount || 0
      maxWeaponLevel.value = data.maxWeaponLevel || 0
      treeDefeatedCount.value = data.treeDefeatedCount || 0
      
      // 恢復成就狀態
      if (data.achievements && Array.isArray(data.achievements)) {
        data.achievements.forEach(savedAchievement => {
          const achievement = achievements.value.find(a => a.id === savedAchievement.id)
          if (achievement) {
            achievement.unlocked = savedAchievement.unlocked || false
            achievement.progress = savedAchievement.progress || 0
          }
        })
      }
      
      // 如果有背包數據，自動裝備第一把武器（如果沒有當前武器）
      if (inventory.value.length > 0 && currentAxeIndex.value === null) {
        currentAxeIndex.value = 0
        startCurrentAttackTimer()
      } else if (currentAxeIndex.value !== null && inventory.value[currentAxeIndex.value]) {
        startCurrentAttackTimer()
      }
      
      console.log('✓ 遊戲資料已加載')
      return
    }
    
    // 如果 props 中沒有，從 Firestore 加載
    const data = await loadGameData(props.user.uid)
    if (data) {
      gold.value = data.gold || gold.value
      inventory.value = data.inventory || []
      currentAxeIndex.value = data.currentAxeIndex !== null ? data.currentAxeIndex : null
      totalDamage.value = data.totalDamage || 0
      totalGoldEarned.value = data.totalGoldEarned || 0
      totalDrawCount.value = data.totalDrawCount || 0
      totalSacrificeCount.value = data.totalSacrificeCount || 0
      legendaryCount.value = data.legendaryCount || 0
      epicCount.value = data.epicCount || 0
      maxWeaponLevel.value = data.maxWeaponLevel || 0
      treeDefeatedCount.value = data.treeDefeatedCount || 0
      
      // 恢復成就狀態
      if (data.achievements && Array.isArray(data.achievements)) {
        data.achievements.forEach(savedAchievement => {
          const achievement = achievements.value.find(a => a.id === savedAchievement.id)
          if (achievement) {
            achievement.unlocked = savedAchievement.unlocked || false
            achievement.progress = savedAchievement.progress || 0
          }
        })
      }
      
      // 如果有背包數據，自動裝備第一把武器（如果沒有當前武器）
      if (inventory.value.length > 0 && currentAxeIndex.value === null) {
        currentAxeIndex.value = 0
        startCurrentAttackTimer()
      } else if (currentAxeIndex.value !== null && inventory.value[currentAxeIndex.value]) {
        startCurrentAttackTimer()
      }
      
      console.log('✓ 遊戲資料已從 Firestore 加載')
    }
  } catch (error) {
    console.error('加載遊戲資料失敗:', error)
  }
}

// 檢查成就
const checkAchievement = async (achievementId) => {
  const achievement = achievements.value.find(a => a.id === achievementId)
  if (!achievement || achievement.unlocked) return
  
  achievement.unlocked = true
  showNotification(`🏆 達成成就：${achievement.name}！`, 'success')
  
  // 立即保存（達成成就時）
  saveGameDataToFirestore(true)
  
  // 發送成就公告（管理員不發送）
  if (!props.user.isAdmin && isMultiplayerReady.value) {
    const userName = props.user.displayName || props.user.email || '未知玩家'
    const userId = props.user.uid
    try {
      await sendAchievementAnnouncement(userId, userName, achievement.name)
    } catch (error) {
      console.error('發送成就公告失敗:', error)
    }
  }
  // 測試玩家不發送成就公告到聊天室
}

// 更新成就進度
const updateAchievementProgress = () => {
  // 武器數量成就
  const weaponCount = inventory.value.length
  updateAchievement('first_weapon', weaponCount)
  updateAchievement('weapon_collector', weaponCount)
  
  // 傳說級武器數量
  const legendaryWeapons = inventory.value.filter(w => w.rarity === 'LEGENDARY').length
  legendaryCount.value = legendaryWeapons
  updateAchievement('legendary_owner', legendaryWeapons)
  
  // 史詩級武器數量
  const epicWeapons = inventory.value.filter(w => w.rarity === 'EPIC').length
  epicCount.value = epicWeapons
  updateAchievement('epic_collector', epicWeapons)
  
  // 最高武器等級
  const maxLevel = Math.max(...inventory.value.map(w => w.level || 1), 0)
  maxWeaponLevel.value = maxLevel
  updateAchievement('upgrade_master', maxLevel)
  
  // 總傷害
  updateAchievement('damage_dealer', totalDamage.value)
  
  // 總金錢
  updateAchievement('rich_player', totalGoldEarned.value)
  
  // 抽卡次數
  updateAchievement('card_drawer', totalDrawCount.value)
  
  // 獻祭次數
  updateAchievement('sacrifice_expert', totalSacrificeCount.value)
  
  // 擊敗樹的次數
  updateAchievement('tree_defeated', treeDefeatedCount.value)
}

// 更新單個成就進度
const updateAchievement = async (achievementId, progress) => {
  const achievement = achievements.value.find(a => a.id === achievementId)
  if (!achievement) return
  
  // 如果成就已經解鎖，只更新進度值，不再次觸發解鎖
  if (achievement.unlocked) {
    achievement.progress = progress
    return
  }
  
  achievement.progress = progress
  // 只有在進度達到目標且尚未解鎖時才觸發解鎖
  if (progress >= achievement.target) {
    await checkAchievement(achievementId)
  }
  
  // 如果是 Firebase 用戶（非管理員），同步到服務器
  if (!props.user.isAdmin && props.user.uid) {
    try {
      await updateAchievementInFirestore(
        props.user.uid,
        achievementId,
        achievement.unlocked,
        progress
      )
    } catch (error) {
      console.error('更新成就到服務器失敗:', error)
    }
  }
}

// 計算成就完成度
const achievementProgress = computed(() => {
  const unlocked = achievements.value.filter(a => a.unlocked).length
  return {
    unlocked,
    total: achievements.value.length,
    percent: Math.round((unlocked / achievements.value.length) * 100)
  }
})

// 初始化多人遊戲（必須成功，不允許單人模式）
const initMultiplayer = async () => {
  // 管理員可以跳過多人遊戲初始化
  if (props.user.isAdmin || (props.user.uid && (props.user.uid.startsWith('test-') || props.user.uid.startsWith('admin-')))) {
    console.log('跳過多人遊戲初始化：用戶是管理員或測試用戶')
    isMultiplayerReady.value = true // 管理員視為已連接
    multiplayerError.value = null
    return
  }
  
  // 檢查是否有有效的 UID（非管理員必須有 UID）
  if (!props.user.uid) {
    const errorMsg = '無法初始化多人模式：用戶沒有有效的 UID'
    console.error('❌', errorMsg)
    multiplayerError.value = errorMsg
    isMultiplayerReady.value = false
    showNotification(errorMsg, 'error')
    return
  }
  
  try {
    console.log('開始初始化多人遊戲...')
    
    // 初始化遊戲狀態
    await initGameState()
    console.log('✓ 遊戲狀態初始化成功')
    
    // 標記玩家在線
    await setUserOnline(props.user.uid, {
      userName: props.user.displayName || props.user.email,
      userEmail: props.user.email,
      photoURL: props.user.photoURL || null,
      currentWeapon: currentAxe.value?.name || '無',
      totalDamage: totalDamage.value
    })
    console.log('✓ 玩家在線狀態設置成功')
    
    // 監聽遊戲狀態變化
    let previousHealth = treeHealth.value
    let isInitialLoad = true // 標記是否為初始載入
    gameStateUnsubscribe.value = subscribeGameState(async (state) => {
      // 跳過第一次載入（初始狀態），避免誤判
      if (isInitialLoad) {
        previousHealth = state.treeHealth
        treeHealth.value = state.treeHealth
        maxTreeHealth.value = state.maxTreeHealth
        isInitialLoad = false
        return
      }
      
      const wasDefeated = previousHealth > 0 && state.treeHealth === state.maxTreeHealth
      previousHealth = state.treeHealth
      
      treeHealth.value = state.treeHealth
      maxTreeHealth.value = state.maxTreeHealth
      
      // 如果樹被擊敗（血量從非0變為滿血，表示被重置）
      if (wasDefeated) {
        treeDefeatedCount.value++
        await checkAchievement('tree_defeated')
        showNotification('🎉 樹大招風被擊敗了！所有玩家共同努力的成果！', 'success')
      }
    })
    console.log('✓ 遊戲狀態監聽器設置成功')
    
    // 監聽最近的攻擊記錄
    attacksUnsubscribe.value = subscribeRecentAttacks((attacks) => {
      recentAttacks.value = attacks
    }, 10)
    console.log('✓ 攻擊記錄監聽器設置成功')
    
    // 監聽在線玩家列表
    usersUnsubscribe.value = subscribeOnlineUsers((users) => {
      onlineUsers.value = users.filter(user => user.id !== props.user.uid)
    })
    console.log('✓ 在線玩家監聽器設置成功')
    
    isMultiplayerReady.value = true
    multiplayerError.value = null
    console.log('✅ 多人遊戲初始化完成！')
    showNotification('✅ 多人模式連接成功！', 'success')
  } catch (error) {
    console.error('❌ 多人遊戲初始化失敗:', error)
    console.error('錯誤詳情:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    })
    isMultiplayerReady.value = false
    
    // 構建詳細的錯誤訊息
    let errorMessage = '無法連接多人模式：'
    if (error.code === 'permission-denied') {
      errorMessage = '無法連接多人模式：權限不足。請確認 Firestore 規則已正確設置。'
    } else if (error.code === 'unavailable') {
      errorMessage = '無法連接多人模式：Firebase 服務暫時不可用，請稍後再試。'
    } else if (error.code === 'failed-precondition') {
      errorMessage = '無法連接多人模式：Firestore 規則驗證失敗。請檢查規則設置。'
    } else if (error.message) {
      errorMessage = '無法連接多人模式：' + error.message
    } else {
      errorMessage = '無法連接多人模式：未知錯誤，請檢查網絡連接和 Firebase 配置。'
    }
    
    multiplayerError.value = errorMessage
    showNotification(errorMessage, 'error')
    
    // 阻止遊戲繼續（不允許單人模式）
    throw error // 重新拋出錯誤，讓調用者知道初始化失敗
  }
}

// 初始化成就進度
onMounted(async () => {
  // 從 Firestore 加載武器數據
  try {
    const weapons = await getAllWeapons()
    if (weapons && weapons.length > 0) {
      cardDatabase.value = weapons
      console.log('✓ 武器數據加載成功:', weapons.length, '把武器')
    } else {
      console.warn('⚠ Firestore 中沒有武器數據，使用備用數據')
      cardDatabase.value = fallbackWeaponDatabase
    }
  } catch (error) {
    console.error('❌ 加載武器數據失敗，使用備用數據:', error)
    cardDatabase.value = fallbackWeaponDatabase
  }
  
  // 加載玩家遊戲資料
  await loadGameDataFromFirestore()
  
  // 檢查並應用離線收益（管理員不需要）
  // 注意：不依賴 currentAxe.value，因為離線狀態已經保存在 Firestore 中
  if (!props.user.isAdmin && props.user.uid) {
    try {
      console.log('開始檢查離線收益...')
      const rewards = await calculateOfflineRewards(props.user.uid)
      console.log('離線收益計算結果:', rewards)
      
      if (rewards && rewards.attackCount > 0) {
        console.log('應用離線收益:', rewards)
        const result = await applyOfflineRewards(props.user.uid, rewards)
        
        // 更新本地狀態
        gold.value = result.newGold
        totalDamage.value = result.newTotalDamage
        totalGoldEarned.value = result.newTotalGoldEarned
        
        // 顯示離線收益通知
        showNotification(
          `💰 離線收益：${rewards.offlineHours}小時內攻擊 ${rewards.attackCount} 次，造成 ${rewards.totalDamage} 傷害，獲得 ${rewards.totalGoldEarned} 金錢！`,
          'success'
        )
        console.log('✓ 離線收益已應用並顯示')
      } else {
        console.log('沒有離線收益（可能是首次登入或離線時間太短）')
      }
    } catch (error) {
      console.error('處理離線收益失敗:', error)
      // 即使失敗也不影響遊戲繼續
    }
  }
  
  updateAchievementProgress()
  
  // 初始化多人遊戲（必須成功，不允許單人模式）
  try {
    await initMultiplayer()
    // 只有多人模式連接成功後才初始化聊天室
    await initChat()
  } catch (error) {
    // 多人模式初始化失敗，阻止遊戲繼續
    console.error('❌ 多人模式初始化失敗，遊戲無法繼續:', error)
    // 錯誤已在 initMultiplayer 中顯示給用戶
    // 不繼續執行後續初始化（如聊天室）
    return
  }
  
  // 啟動自動保存（每30秒保存一次，管理員不需要）
  if (!props.user.isAdmin && props.user.uid) {
    saveTimer.value = setInterval(() => {
      saveGameDataToFirestore(false)
    }, 30000) // 30秒
  }
  
  // 啟動活動檢查計時器（每10秒檢查一次，如果1分鐘沒有活動，保存離線狀態）
  if (!props.user.isAdmin && props.user.uid) {
    activityCheckInterval.value = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityTime.value
      const INACTIVE_THRESHOLD = 60 * 1000 // 1分鐘
      
      // 如果1分鐘沒有活動，且當前有裝備武器，保存離線狀態
      if (timeSinceActivity >= INACTIVE_THRESHOLD && currentAxe.value && isMultiplayerReady.value) {
        const weaponId = currentAxe.value.baseId || currentAxe.value.id
        const weaponLevel = currentAxe.value.level || 1
        const attackInterval = currentAxe.value.attackInterval || 2000
        
        // 記錄停止活動的時間（1分鐘前）
        const inactiveStartTime = new Date(lastActivityTime.value + INACTIVE_THRESHOLD)
        
        saveOfflineState(props.user.uid, weaponId, weaponLevel, attackInterval, inactiveStartTime)
          .then(() => {
            console.log('✓ 離線狀態已保存（1分鐘無活動）')
          })
          .catch(err => {
            console.error('保存離線狀態失敗:', err)
          })
      }
    }, 10000) // 每10秒檢查一次
  }
  
  // 註：已移除金錢批量同步定時器，現在所有數據都直接從後端返回
  
  // 啟動離線收益定期檢查定時器（每1分鐘檢查一次，用於掛機時自動計算收益）
  if (!props.user.isAdmin && props.user.uid) {
    offlineRewardCheckTimer.value = setInterval(() => {
      checkAndApplyOfflineRewards()
    }, OFFLINE_REWARD_CHECK_INTERVAL)
    console.log('✓ 離線收益定期檢查已啟動（每1分鐘檢查一次）')
  }
  
  // 監聽頁面可見性變化（用於離線掛機，管理員不需要）
  if (!props.user.isAdmin && props.user.uid) {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
  }
})

// 處理頁面可見性變化（用於離線掛機）
const handleVisibilityChange = async () => {
  if (document.hidden) {
    // 頁面隱藏時，如果1分鐘內有活動，則從活動時間開始計算；否則立即保存離線狀態
    if (currentAxe.value && !props.user.isAdmin && props.user.uid) {
      try {
        const weaponId = currentAxe.value.baseId || currentAxe.value.id
        const weaponLevel = currentAxe.value.level || 1
        const attackInterval = currentAxe.value.attackInterval || 2000
        
        // 計算不活動開始時間：如果最後活動時間在1分鐘內，則從1分鐘後開始計算
        const timeSinceActivity = Date.now() - lastActivityTime.value
        const INACTIVE_THRESHOLD = 60 * 1000 // 1分鐘
        const inactiveStartTime = timeSinceActivity < INACTIVE_THRESHOLD
          ? new Date(lastActivityTime.value + INACTIVE_THRESHOLD)
          : new Date(lastActivityTime.value + INACTIVE_THRESHOLD)
        
        await saveOfflineState(props.user.uid, weaponId, weaponLevel, attackInterval, inactiveStartTime)
        console.log('✓ 離線狀態已保存（頁面隱藏）')
      } catch (error) {
        console.error('保存離線狀態失敗:', error)
      }
    }
  } else {
    // 頁面顯示時，先檢查並應用離線收益，然後清除離線狀態
    // 注意：不要在 onMounted 之前清除，因為 onMounted 需要讀取離線狀態
    // 這裡只清除，離線收益應該在 onMounted 中處理
    if (!props.user.isAdmin && props.user.uid) {
      // 延遲清除，確保 onMounted 中的離線收益檢查已經完成
      setTimeout(async () => {
        try {
          await clearOfflineState(props.user.uid)
          console.log('✓ 離線狀態已清除（頁面顯示後）')
        } catch (error) {
          console.error('清除離線狀態失敗:', error)
        }
      }, 5000) // 5秒後清除，確保離線收益已經處理
    }
  }
}

// 處理頁面卸載前（用於離線掛機）
const handleBeforeUnload = async () => {
  if (currentAxe.value && !props.user.isAdmin && props.user.uid) {
    try {
      const weaponId = currentAxe.value.baseId || currentAxe.value.id
      const weaponLevel = currentAxe.value.level || 1
      const attackInterval = currentAxe.value.attackInterval || 2000
      
      // 計算不活動開始時間：如果最後活動時間在1分鐘內，則從1分鐘後開始計算
      const timeSinceActivity = Date.now() - lastActivityTime.value
      const INACTIVE_THRESHOLD = 60 * 1000 // 1分鐘
      const inactiveStartTime = timeSinceActivity < INACTIVE_THRESHOLD
        ? new Date(lastActivityTime.value + INACTIVE_THRESHOLD)
        : new Date(lastActivityTime.value + INACTIVE_THRESHOLD)
      
      // 使用 sendBeacon 或同步方式保存（因為頁面即將關閉）
      await saveOfflineState(props.user.uid, weaponId, weaponLevel, attackInterval, inactiveStartTime)
    } catch (error) {
      console.error('保存離線狀態失敗:', error)
    }
  }
}

// 清理攻擊計時器和通知計時器
onUnmounted(async () => {
  stopCurrentAttackTimer()
  hideNotification()
  
  // 清理自動保存計時器
  if (saveTimer.value) {
    clearInterval(saveTimer.value)
    saveTimer.value = null
  }
  
  // 清理活動檢查計時器
  if (activityCheckInterval.value) {
    clearInterval(activityCheckInterval.value)
    activityCheckInterval.value = null
  }
  
  // 清理離線收益檢查定時器
  if (offlineRewardCheckTimer.value) {
    clearInterval(offlineRewardCheckTimer.value)
    offlineRewardCheckTimer.value = null
  }
  
  // 註：已移除金錢同步邏輯，現在所有數據都直接從後端返回
  
  // 保存離線狀態
  if (currentAxe.value && !props.user.isAdmin && props.user.uid) {
    try {
      const weaponId = currentAxe.value.baseId || currentAxe.value.id
      const weaponLevel = currentAxe.value.level || 1
      const attackInterval = currentAxe.value.attackInterval || 2000
      
      // 計算不活動開始時間：如果最後活動時間在1分鐘內，則從1分鐘後開始計算
      const timeSinceActivity = Date.now() - lastActivityTime.value
      const INACTIVE_THRESHOLD = 60 * 1000 // 1分鐘
      const inactiveStartTime = timeSinceActivity < INACTIVE_THRESHOLD
        ? new Date(lastActivityTime.value + INACTIVE_THRESHOLD)
        : new Date(lastActivityTime.value + INACTIVE_THRESHOLD)
      
      await saveOfflineState(props.user.uid, weaponId, weaponLevel, attackInterval, inactiveStartTime)
    } catch (error) {
      console.error('保存離線狀態失敗:', error)
    }
  }
  
  // 移除事件監聽器
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  
  // 最後一次保存遊戲資料
  await saveGameDataToFirestore(true)
  
  // 清理多人遊戲監聽器
  if (gameStateUnsubscribe.value) {
    gameStateUnsubscribe.value()
  }
  if (attacksUnsubscribe.value) {
    attacksUnsubscribe.value()
  }
  if (usersUnsubscribe.value) {
    usersUnsubscribe.value()
  }
  
  // 清理聊天室監聽器
  if (chatUnsubscribe.value) {
    chatUnsubscribe.value()
  }
  
  // 標記玩家離線
  if (isMultiplayerReady.value) {
    try {
      await setUserOffline(props.user.uid)
    } catch (error) {
      console.error('標記離線失敗:', error)
    }
  }
})

// 監聽相關數據變化，更新成就進度
watch([inventory, totalDamage, totalGoldEarned, totalDrawCount, totalSacrificeCount, treeDefeatedCount], () => {
  updateAchievementProgress()
}, { deep: true })

// 監聽頁面切換，切換到聊天室時滾動到底部
watch(currentPage, (newPage) => {
  if (newPage === 'chat') {
    scrollChatToBottom()
  }
})

// 監聽聊天消息變化，自動滾動到底部
watch(chatMessages, () => {
  scrollChatToBottom()
}, { deep: true })

// 清除所有玩家資料（僅管理員模式）
const handleClearAllPlayersData = async () => {
  if (!props.user.isAdmin) {
    showNotification('此功能僅限系統管理員使用', 'error')
    return
  }
  
  // 確認對話框
  const confirmed = confirm('⚠️ 警告：此操作將清除 Firestore 中所有玩家的資料！\n\n這包括：\n- 所有玩家的金錢、背包、成就\n- 所有玩家的遊戲進度\n\n此操作無法復原！\n\n確定要繼續嗎？')
  
  if (!confirmed) {
    return
  }
  
  // 二次確認
  const confirmedAgain = confirm('⚠️ 最後確認：\n\n你真的要清除所有玩家的資料嗎？\n\n此操作無法復原！')
  
  if (!confirmedAgain) {
    return
  }
  
  try {
    isClearingData.value = true
    const result = await clearAllPlayersData()
    showNotification(`✅ 成功清除 ${result.deletedCount} 個玩家的資料！遊戲已重置！`, 'success')
    
    // 延遲一下讓用戶看到通知
    setTimeout(() => {
      // 重新加載頁面以刷新狀態
      window.location.reload()
    }, 2000)
  } catch (error) {
    console.error('清除所有玩家資料失敗:', error)
    showNotification('清除資料失敗：' + (error.message || '未知錯誤'), 'error')
    isClearingData.value = false
  }
}
</script>

<template>
  <div class="game-container">
    <header class="game-header">
      <h1>砍倒大樹</h1>
      <div class="user-info">
        <div class="user-avatar">
          <img v-if="user.photoURL" :src="user.photoURL" :alt="user.displayName" />
          <div v-else class="avatar-placeholder">{{ user.displayName?.charAt(0) || 'U' }}</div>
        </div>
        <div class="user-details">
          <div class="user-name">{{ user.displayName || user.email }}</div>
          <div class="user-role" :class="'role-' + userRole">
            {{ userRole === 'admin' ? '👑 管理員' : '🎮 玩家' }}
          </div>
        </div>
      </div>
      <div class="stats">
        <div class="gold-display">
          <span class="label">金錢：</span>
          <span class="value">{{ Math.floor(gold) }}</span>
          <span class="gps">(預估 {{ Math.floor(estimatedGoldPerSecond) }}/秒)</span>
        </div>
        <div class="damage-display">
          <span class="label">總傷害：</span>
          <span class="value">{{ totalDamage }}</span>
        </div>
        <div class="attack-display">
          <span class="label">攻擊力：</span>
          <span class="value">{{ totalAttack }}</span>
        </div>
      </div>
      <!-- 系統管理員專用：清除所有玩家資料按鈕 -->
      <div v-if="user.isAdmin" class="admin-panel">
        <button 
          class="clear-all-data-btn"
          @click="handleClearAllPlayersData"
          :disabled="isClearingData"
        >
          {{ isClearingData ? '清除中...' : '🗑️ 清除所有玩家資料' }}
        </button>
      </div>
    </header>

    <!-- 主要內容區域 -->
    <div class="game-content" :class="{ 'with-bottom-nav': true }">
      <!-- 主頁面 -->
      <div v-if="currentPage === 'game'" class="page-content">
        <!-- 樹大招風 -->
        <div class="tree-section">
          <div class="tree-header">
            <h2>樹大招風</h2>
            <div class="multiplayer-status" :class="{ 'online': isMultiplayerReady, 'offline': !isMultiplayerReady }">
              <span class="status-dot"></span>
              <span>{{ isMultiplayerReady ? '多人模式' : '連接中...' }}</span>
              <span v-if="isMultiplayerReady && onlineUsers.length > 0" class="online-count">
                ({{ onlineUsers.length }} 人在線)
              </span>
            </div>
            <div v-if="multiplayerError" class="multiplayer-error">
              <span class="error-icon">⚠️</span>
              <span>{{ multiplayerError }}</span>
            </div>
          </div>
          <div class="tree-container">
            <div class="tree-visual">🌳</div>
            <div class="health-bar-container">
              <div class="health-bar-label">
                血量：{{ Math.ceil(treeHealth) }} / {{ maxTreeHealth }}
                <span class="percent">({{ treeHealthPercent.toFixed(2) }}%)</span>
              </div>
              <div class="health-bar">
                <div 
                  class="health-bar-fill" 
                  :style="{ width: treeHealthPercent + '%' }"
                ></div>
              </div>
              <div class="health-percent-display">
                {{ treeHealthPercent.toFixed(2) }}%
              </div>
            </div>
          </div>
          
          <!-- 多人遊戲信息 -->
          <div v-if="isMultiplayerReady" class="multiplayer-info">
            <!-- 在線玩家列表 -->
            <div v-if="onlineUsers.length > 0" class="online-players">
              <h3>在線玩家 ({{ onlineUsers.length }})</h3>
              <div class="players-list">
                <div 
                  v-for="user in onlineUsers.slice(0, 5)" 
                  :key="user.id"
                  class="player-item"
                >
                  <img 
                    v-if="user.photoURL" 
                    :src="user.photoURL" 
                    :alt="user.userName"
                    class="player-avatar"
                  />
                  <div v-else class="player-avatar-placeholder">
                    {{ user.userName?.charAt(0) || '?' }}
                  </div>
                  <div class="player-info">
                    <div class="player-name">{{ user.userName }}</div>
                    <div class="player-weapon">{{ user.currentWeapon || '無武器' }}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 最近的攻擊記錄 -->
            <div v-if="recentAttacks.length > 0" class="recent-attacks">
              <h3>最近攻擊</h3>
              <div class="attacks-list">
                <div 
                  v-for="attack in recentAttacks.slice(0, 5)" 
                  :key="attack.id"
                  class="attack-item"
                  :class="{ 'own-attack': attack.userId === user.uid }"
                >
                  <span class="attack-player">{{ attack.userName }}</span>
                  <span class="attack-damage">-{{ attack.damage }}</span>
                  <span class="attack-weapon">{{ attack.weaponName }}</span>
                  <span class="attack-time">{{ formatTime(attack.timestamp) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 抽卡區域 -->
        <div class="draw-section">
          <div class="card-count">背包：{{ inventory.length }} 把斧頭{{ currentAxe ? ' | 已裝備：' + currentAxe.name : '' }}</div>
        </div>

        <!-- 當前斧頭顯示區域 -->
        <div class="cards-section">
          <h2>當前斧頭</h2>
          <div v-if="!currentAxe" class="no-cards">
            還沒有斧頭，快來抽卡吧！
          </div>
          <div v-else class="current-axe-container">
            <div class="card current-axe-card" :class="'rarity-' + (currentAxe.rarity || 'COMMON')">
              <div class="card-level-badge" v-if="currentAxe.level > 1">Lv.{{ currentAxe.level }}</div>
              <div class="card-rarity-badge" :style="{ backgroundColor: RARITY[currentAxe.rarity || 'COMMON'].color }">
                {{ RARITY[currentAxe.rarity || 'COMMON'].name }}
              </div>
              <div class="card-icon">{{ currentAxe.icon || '🪓' }}</div>
              <div class="card-name">{{ currentAxe.name }}</div>
              <div class="card-description">{{ currentAxe.description }}</div>
              <div class="card-stats">
                <div class="stat">
                  <span class="stat-label">攻擊力：</span>
                  <span class="stat-value">{{ currentAxe.attack }}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">攻擊間隔：</span>
                  <span class="stat-value">{{ (currentAxe.attackInterval / 1000).toFixed(1) }}秒</span>
                </div>
                <div class="stat">
                  <span class="stat-label">金錢機率：</span>
                  <span class="stat-value">{{ (currentAxe.goldChance * 100).toFixed(0) }}%</span>
                </div>
                <div class="stat">
                  <span class="stat-label">金錢範圍：</span>
                  <span class="stat-value">{{ currentAxe.goldMin }}-{{ currentAxe.goldMax }}</span>
                </div>
              </div>
              <div v-if="currentAxe.lastGoldGained > 0" class="gold-gain-indicator">
                +{{ currentAxe.lastGoldGained }} 金錢
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 背包頁面 -->
      <div v-if="currentPage === 'inventory'" class="page-content inventory-page">
        <div class="inventory-section-full">
          <div class="inventory-header">
            <h2>背包 ({{ inventory.length }})</h2>
            <div class="inventory-actions">
              <button 
                v-if="!upgradeMode"
                class="btn-upgrade-mode"
                @click="enterUpgradeMode"
                :disabled="inventory.length < 2"
              >
                獻祭升級
              </button>
              <div v-else class="upgrade-mode-controls">
                <button class="btn-cancel-upgrade" @click="cancelUpgradeMode">取消</button>
                <button 
                  class="btn-confirm-upgrade"
                  @click="sacrificeUpgrade"
                  :disabled="selectedUpgradeAxeIndex === null || selectedSacrificeAxeIndices.length === 0"
                >
                  確認獻祭 ({{ selectedSacrificeAxeIndices.length }})
                </button>
              </div>
            </div>
          </div>
          
          <div v-if="upgradeMode" class="upgrade-mode-hint">
            <div class="sacrifice-explanation">
              <h3>🔥 獻祭升級說明</h3>
              <p>獻祭其他武器來提升選中武器的攻擊速度！</p>
              <ul>
                <li v-if="selectedUpgradeAxeIndex !== null">
                  要升級的武器：<strong class="hint-upgrade">{{ inventory[selectedUpgradeAxeIndex]?.name }}</strong>
                  <span v-if="selectedUpgradeAxeIndex === currentAxeIndex" class="current-weapon-note">（使用中）</span>
                </li>
                <li v-else>選擇一把要<strong class="hint-upgrade">升級的武器</strong>（預設為使用中的武器）</li>
                <li>選擇要<strong class="hint-sacrifice">獻祭的武器</strong>（可多選，使用中的武器不可獻祭）</li>
                <li>獻祭的武器等級越高，提升效果越好</li>
                <li>多把武器獻祭會有遞減效果（第一把100%，第二把75%，第三把56.25%...）</li>
                <li>攻擊間隔最多減少60%，最低間隔為500ms或基礎間隔的40%</li>
              </ul>
            </div>
            <p class="hint-text">選擇要<strong class="hint-upgrade">升級的斧頭</strong>和要<strong class="hint-sacrifice">獻祭的斧頭</strong>（可多選）</p>
            <p v-if="selectedUpgradeAxeIndex === null" class="selected-info hint-text">
              提示：使用中的武器已預設為升級目標，可直接選擇要獻祭的武器
            </p>
            <p v-if="selectedSacrificeAxeIndices.length > 0" class="selected-info">
              要獻祭：{{ selectedSacrificeAxeIndices.length }} 把武器
            </p>
            
            <!-- 按稀有度批量選擇 -->
            <div class="rarity-batch-select">
              <p class="batch-select-title">快速選擇：</p>
              <div class="rarity-buttons">
                <button
                  v-for="(rarityInfo, rarity) in RARITY"
                  :key="rarity"
                  class="rarity-select-btn"
                  :class="{ 
                    'all-selected': isRarityAllSelected(rarity),
                    'partially-selected': getRaritySelectedCount(rarity) > 0 && !isRarityAllSelected(rarity)
                  }"
                  :style="{ 
                    borderColor: rarityInfo.color,
                    backgroundColor: isRarityAllSelected(rarity) 
                      ? rarityInfo.color 
                      : getRaritySelectedCount(rarity) > 0 
                        ? rarityInfo.color + '40' 
                        : 'transparent'
                  }"
                  @click.stop="toggleSacrificeByRarity(rarity, $event)"
                  :disabled="getRarityTotalCount(rarity) === 0"
                >
                  <span class="rarity-btn-icon">{{ rarityInfo.name }}</span>
                  <span class="rarity-btn-count">
                    {{ getRaritySelectedCount(rarity) }} / {{ getRarityTotalCount(rarity) }}
                  </span>
                </button>
              </div>
            </div>
          </div>
          
          <div v-if="inventory.length === 0" class="no-cards">
            背包是空的，快來抽卡吧！
          </div>
          <div v-else class="inventory-grid-compact">
          <div 
            v-for="(axe, index) in inventory" 
            :key="axe.instanceId"
            class="inventory-card-compact"
            :class="{ 
              'active': currentAxeIndex === index, 
              'upgrade-mode': upgradeMode,
              'selected-upgrade': upgradeMode && selectedUpgradeAxeIndex === index,
              'selected-sacrifice': upgradeMode && selectedSacrificeAxeIndices.includes(index),
              ['rarity-' + (axe.rarity || 'COMMON')]: true 
            }"
            @click="!upgradeMode && showWeaponDetails(index)"
          >
            <div class="card-level-badge-compact" v-if="axe.level > 1">Lv.{{ axe.level }}</div>
            <div class="card-rarity-badge-compact" :style="{ backgroundColor: RARITY[axe.rarity || 'COMMON'].color }">
              {{ RARITY[axe.rarity || 'COMMON'].name }}
            </div>
            
            <div v-if="upgradeMode && selectedUpgradeAxeIndex === index" class="selection-badge-compact upgrade-badge">
              升級
            </div>
            <div v-if="upgradeMode && selectedSacrificeAxeIndices.includes(index)" class="selection-badge-compact sacrifice-badge">
              獻祭
            </div>
            
            <div v-if="currentAxeIndex === index" class="equipped-badge-compact">使用中</div>
            
            <div class="card-icon-compact">{{ axe.icon || '🪓' }}</div>
            <div class="card-name-compact">{{ axe.name }}</div>
            
            <!-- 升級模式下的按鈕（使用中的武器不顯示） -->
            <div v-if="upgradeMode && currentAxeIndex !== index" class="card-actions-compact" @click.stop>
              <button 
                class="btn-select-upgrade-compact"
                :class="{ 'selected': selectedUpgradeAxeIndex === index }"
                @click="selectUpgradeAxe(index)"
              >
                {{ selectedUpgradeAxeIndex === index ? '✓' : '升級' }}
              </button>
              <button 
                class="btn-select-sacrifice-compact"
                :class="{ 'selected': selectedSacrificeAxeIndices.includes(index) }"
                @click="toggleSacrificeAxe(index)"
              >
                {{ selectedSacrificeAxeIndices.includes(index) ? '✓' : '獻祭' }}
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>

      <!-- 聊天室頁面 -->
      <div v-if="currentPage === 'chat'" class="page-content chat-page">
        <div class="chat-page-content">
          <h2>聊天室</h2>
          
          <div class="chat-messages-container" ref="chatContainer">
            <div 
              v-for="message in filteredChatMessages" 
              :key="message.id"
              class="chat-message"
              :class="{
                'message-legendary': message.type === 'legendary',
                'message-achievement': message.type === 'achievement',
                'own-message': message.userId === user.uid
              }"
            >
              <div class="message-header">
                <span class="message-user">{{ message.userName }}</span>
                <span class="message-time">{{ formatTime(message.timestamp || message.createdAt) }}</span>
              </div>
              <div class="message-content">{{ message.message }}</div>
            </div>
            <div v-if="filteredChatMessages.length === 0" class="no-messages">
              還沒有消息，快來發送第一條消息吧！
            </div>
          </div>
          
          <div class="chat-input-container">
            <input
              v-model="chatInput"
              type="text"
              class="chat-input"
              placeholder="輸入消息..."
              @keypress="(e) => e.key === 'Enter' && sendChatMessage()"
              :disabled="!isChatReady || user.isAdmin"
            />
            <button 
              class="chat-send-button"
              @click="sendChatMessage"
              :disabled="!isChatReady || !chatInput.trim() || user.isAdmin"
            >
              發送
            </button>
          </div>
        </div>
      </div>

      <!-- 成就頁面 -->
      <div v-if="currentPage === 'achievements'" class="page-content achievements-page">
        <div class="achievements-page-content">
          <h2>成就系統</h2>
          <div class="achievement-summary">
            <div class="achievement-progress-bar">
              <div class="progress-bar-bg">
                <div 
                  class="progress-bar-fill" 
                  :style="{ width: achievementProgress.percent + '%' }"
                ></div>
              </div>
              <div class="achievement-progress-text">
                {{ achievementProgress.unlocked }} / {{ achievementProgress.total }} 成就達成 ({{ achievementProgress.percent }}%)
              </div>
            </div>
          </div>
          <div class="achievements-grid">
            <div 
              v-for="achievement in achievements" 
              :key="achievement.id"
              class="achievement-card"
              :class="{ 'unlocked': achievement.unlocked }"
            >
              <div class="achievement-icon">{{ achievement.icon }}</div>
              <div class="achievement-info">
                <div class="achievement-name">{{ achievement.name }}</div>
                <div class="achievement-description">{{ achievement.description }}</div>
                <div class="achievement-progress">
                  <div class="progress-bar-mini">
                    <div 
                      class="progress-fill-mini" 
                      :style="{ width: Math.min(100, (achievement.progress / achievement.target) * 100) + '%' }"
                    ></div>
                  </div>
                  <div class="progress-text-mini">
                    {{ achievement.progress }} / {{ achievement.target }}
                  </div>
                </div>
              </div>
              <div v-if="achievement.unlocked" class="achievement-badge">✓</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 抽武器頁面 -->
      <div v-if="currentPage === 'draw'" class="page-content draw-page">
        <div class="draw-page-content">
          <h2>抽武器</h2>
          <div class="gold-display-draw">
            <span class="gold-label">當前金錢：</span>
            <span class="gold-value">{{ Math.floor(gold) }} 💰</span>
          </div>
          
          <div class="draw-options">
            <div 
              v-for="(price, rarity) in drawCardPrices" 
              :key="rarity"
              class="draw-option-card"
              :class="'rarity-' + rarity"
              :style="{ borderColor: RARITY[rarity].color }"
            >
              <div class="draw-option-header" :style="{ backgroundColor: RARITY[rarity].color }">
                <span class="rarity-name-draw">{{ RARITY[rarity].name }}</span>
                <span class="rarity-price">{{ price.toLocaleString() }} 💰</span>
              </div>
              
              <div class="draw-option-content">
                <div class="draw-option-description">
                  <p v-if="rarity === 'COMMON'">只能抽取到普通級武器</p>
                  <p v-else-if="rarity === 'RARE'">可抽取稀有級及以下武器</p>
                  <p v-else-if="rarity === 'EPIC'">可抽取史詩級及以下武器</p>
                  <p v-else-if="rarity === 'LEGENDARY'">可抽取所有等級武器</p>
                </div>
                
                <div class="draw-option-cards-preview">
                  <div 
                    v-for="card in cardsByRarity[rarity]?.slice(0, 5)" 
                    :key="card.id"
                    class="preview-card"
                  >
                    <div class="preview-icon">{{ card.icon }}</div>
                    <div class="preview-name">{{ card.name }}</div>
                  </div>
                  <div v-if="cardsByRarity[rarity]?.length > 5" class="preview-more">
                    +{{ cardsByRarity[rarity].length - 5 }} 更多
                  </div>
                </div>
                
                <button 
                  class="draw-option-button"
                  :class="'button-' + rarity.toLowerCase()"
                  :disabled="gold < price"
                  @click="drawCard(rarity)"
                >
                  <span class="button-icon">🎴</span>
                  <span class="button-text">抽取武器</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 機率頁面 -->
      <div v-if="currentPage === 'probability'" class="page-content probability-page">
        <div class="probability-page-content">
          <h2>抽取機率</h2>
          <div class="probability-carousel-container">
            <div 
              v-for="(cards, rarity) in cardsByRarity" 
              :key="rarity" 
              class="rarity-carousel-card"
              :style="{ borderColor: RARITY[rarity].color }"
            >
              <!-- 稀有度標題 -->
              <div class="rarity-header-carousel" :style="{ backgroundColor: RARITY[rarity].color }">
                <span class="rarity-name-carousel">{{ RARITY[rarity].name }}</span>
                <span class="rarity-percent-carousel">{{ getRarityTotalProbability(rarity) }}%</span>
              </div>
              
              <!-- 輪播內容區域 -->
              <div class="carousel-content" v-if="getCurrentCard(rarity)">
                <div class="carousel-card-display clickable-card" @click="showBaseWeaponDetails(getCurrentCard(rarity))">
                  <div class="carousel-card-icon">{{ getCurrentCard(rarity).icon }}</div>
                  <div class="carousel-card-name">{{ getCurrentCard(rarity).name }}</div>
                  <div class="carousel-card-description">{{ getCurrentCard(rarity).description }}</div>
                  <div class="carousel-card-probability">
                    抽取機率：{{ getCardProbability(getCurrentCard(rarity)) }}%
                  </div>
                  <div class="carousel-card-index">
                    {{ (carouselIndices[rarity] || 0) + 1 }} / {{ cards.length }}
                  </div>
                  <div class="carousel-card-hint" style="margin-top: 8px; font-size: 0.85em; color: rgba(255, 255, 255, 0.7);">
                    點擊查看詳細屬性
                  </div>
                </div>
                
                <!-- 輪播控制按鈕 -->
                <div class="carousel-controls">
                  <button 
                    class="carousel-btn carousel-btn-prev"
                    @click="prevCard(rarity)"
                    :disabled="cards.length <= 1"
                  >
                    ‹
                  </button>
                  <button 
                    class="carousel-btn carousel-btn-next"
                    @click="nextCard(rarity)"
                    :disabled="cards.length <= 1"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 通知提示 -->
    <transition name="notification-slide">
      <div 
        v-if="notification" 
        class="notification"
        :class="'notification-' + notification.type"
        @click="hideNotification"
      >
        <div class="notification-content">
          <div class="notification-icon">
            <span v-if="notification.type === 'success'">✓</span>
            <span v-else-if="notification.type === 'error'">✗</span>
            <span v-else>ℹ</span>
          </div>
          <div class="notification-message">{{ notification.message }}</div>
          <button class="notification-close" @click.stop="hideNotification">×</button>
        </div>
      </div>
    </transition>

    <!-- 底部導航欄 -->
    <div class="bottom-nav">
      <button 
        class="nav-item" 
        :class="{ 'active': currentPage === 'game' }"
        @click="switchPage('game')"
      >
        <div class="nav-icon">🎮</div>
        <div class="nav-label">遊戲</div>
      </button>
      <button 
        class="nav-item" 
        :class="{ 'active': currentPage === 'probability' }"
        @click="switchPage('probability')"
      >
        <div class="nav-icon">🎲</div>
        <div class="nav-label">機率</div>
      </button>
      <button 
        class="nav-item" 
        :class="{ 'active': currentPage === 'inventory' }"
        @click="switchPage('inventory')"
      >
        <div class="nav-icon">🎒</div>
        <div class="nav-label">背包</div>
        <div v-if="inventory.length > 0" class="nav-badge">{{ inventory.length }}</div>
      </button>
      <button 
        class="nav-item" 
        :class="{ 'active': currentPage === 'draw' }"
        @click="switchPage('draw')"
      >
        <div class="nav-icon">🎴</div>
        <div class="nav-label">抽武器</div>
      </button>
      <button 
        class="nav-item" 
        :class="{ 'active': currentPage === 'chat' }"
        @click="switchPage('chat')"
      >
        <div class="nav-icon">💬</div>
        <div class="nav-label">聊天</div>
      </button>
      <button 
        class="nav-item" 
        :class="{ 'active': currentPage === 'achievements' }"
        @click="switchPage('achievements')"
      >
        <div class="nav-icon">🏆</div>
        <div class="nav-label">成就</div>
        <div v-if="achievementProgress.unlocked > 0" class="nav-badge">{{ achievementProgress.unlocked }}</div>
      </button>
    </div>

    <!-- 武器詳情彈窗（背包中的武器） -->
    <transition name="modal-fade">
      <div v-if="showWeaponModal && selectedWeaponIndex !== null" class="modal-overlay" @click="closeWeaponModal">
        <div class="modal-content-weapon" @click.stop>
          <div class="modal-header-weapon">
            <h2>武器詳情</h2>
            <button class="modal-close-weapon" @click="closeWeaponModal">×</button>
          </div>
          <div class="modal-body-weapon" v-if="inventory[selectedWeaponIndex]">
            <div class="weapon-detail-card" :class="'rarity-' + (inventory[selectedWeaponIndex].rarity || 'COMMON')">
              <div class="card-level-badge" v-if="inventory[selectedWeaponIndex].level > 1">Lv.{{ inventory[selectedWeaponIndex].level }}</div>
              <div class="card-rarity-badge" :style="{ backgroundColor: RARITY[inventory[selectedWeaponIndex].rarity || 'COMMON'].color }">
                {{ RARITY[inventory[selectedWeaponIndex].rarity || 'COMMON'].name }}
              </div>
              <div class="card-icon">{{ inventory[selectedWeaponIndex].icon || '🪓' }}</div>
              <div class="card-name">{{ inventory[selectedWeaponIndex].name }}</div>
              <div class="card-description">{{ inventory[selectedWeaponIndex].description }}</div>
              <div class="card-stats">
                <div class="stat">
                  <span class="stat-label">攻擊力：</span>
                  <span class="stat-value">{{ inventory[selectedWeaponIndex].attack }}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">攻擊間隔：</span>
                  <span class="stat-value">{{ (inventory[selectedWeaponIndex].attackInterval / 1000).toFixed(1) }}秒</span>
                </div>
                <div class="stat">
                  <span class="stat-label">金錢機率：</span>
                  <span class="stat-value">{{ (inventory[selectedWeaponIndex].goldChance * 100).toFixed(0) }}%</span>
                </div>
                <div class="stat">
                  <span class="stat-label">金錢範圍：</span>
                  <span class="stat-value">{{ inventory[selectedWeaponIndex].goldMin }}-{{ inventory[selectedWeaponIndex].goldMax }}</span>
                </div>
              </div>
              <div class="weapon-modal-actions">
                <button 
                  v-if="currentAxeIndex !== selectedWeaponIndex"
                  class="btn-equip-modal"
                  @click="switchAxe(selectedWeaponIndex); closeWeaponModal(); switchPage('game')"
                >
                  裝備
                </button>
                <div v-else class="equipped-badge-modal">使用中</div>
                <button 
                  class="btn-sell-modal"
                  :disabled="inventory.length === 1 && currentAxeIndex === selectedWeaponIndex"
                  @click="sellAxe(selectedWeaponIndex, $event); closeWeaponModal()"
                >
                  賣出 {{ getSellPrice(inventory[selectedWeaponIndex]) }}💰
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 基礎武器詳情彈窗（概率頁面） -->
    <transition name="modal-fade">
      <div v-if="showBaseWeaponModal && selectedBaseWeapon" class="modal-overlay" @click="closeBaseWeaponModal">
        <div class="modal-content-weapon" @click.stop>
          <div class="modal-header-weapon">
            <h2>武器屬性</h2>
            <button class="modal-close-weapon" @click="closeBaseWeaponModal">×</button>
          </div>
          <div class="modal-body-weapon">
            <div class="weapon-detail-card" :class="'rarity-' + (selectedBaseWeapon.rarity || 'COMMON')">
              <div class="card-rarity-badge" :style="{ backgroundColor: RARITY[selectedBaseWeapon.rarity || 'COMMON'].color }">
                {{ RARITY[selectedBaseWeapon.rarity || 'COMMON'].name }}
              </div>
              <div class="card-icon">{{ selectedBaseWeapon.icon || '🪓' }}</div>
              <div class="card-name">{{ selectedBaseWeapon.name }}</div>
              <div class="card-description">{{ selectedBaseWeapon.description }}</div>
              <div class="card-stats">
                <div class="stat">
                  <span class="stat-label">攻擊力：</span>
                  <span class="stat-value">{{ selectedBaseWeapon.attack }}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">攻擊間隔：</span>
                  <span class="stat-value">{{ (selectedBaseWeapon.attackInterval / 1000).toFixed(1) }}秒</span>
                </div>
                <div class="stat">
                  <span class="stat-label">金錢機率：</span>
                  <span class="stat-value">{{ (selectedBaseWeapon.goldChance * 100).toFixed(0) }}%</span>
                </div>
                <div class="stat">
                  <span class="stat-label">金錢範圍：</span>
                  <span class="stat-value">{{ selectedBaseWeapon.goldMin }}-{{ selectedBaseWeapon.goldMax }}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">抽取機率：</span>
                  <span class="stat-value">{{ getCardProbability(selectedBaseWeapon) }}%</span>
                </div>
              </div>
              <div class="weapon-modal-actions">
                <button class="btn-close-modal" @click="closeBaseWeaponModal">
                  關閉
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.game-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 15px;
  padding-bottom: 85px; /* 為底部導航欄留出空間 */
  color: #fff;
  display: flex;
  flex-direction: column;
}

.game-header {
  text-align: center;
  margin-bottom: 20px;
  position: relative;
}

.game-header h1 {
  font-size: 1.8em;
  margin-bottom: 15px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  font-weight: bold;
}

.admin-panel {
  margin-top: 15px;
  display: flex;
  justify-content: center;
}

.clear-all-data-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.95em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);
}

.clear-all-data-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 107, 107, 0.6);
  background: linear-gradient(135deg, #ff5252, #e53935);
}

.clear-all-data-btn:active:not(:disabled) {
  transform: translateY(0);
}

.clear-all-data-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.user-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 15px;
  background: rgba(255, 255, 255, 0.1);
  padding: 12px 15px;
  border-radius: 12px;
  backdrop-filter: blur(10px);
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
}

.user-avatar {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5em;
  font-weight: bold;
}

.user-details {
  text-align: left;
}

.user-name {
  font-weight: bold;
  font-size: 0.95em;
  margin-bottom: 4px;
  word-break: break-word;
}

.user-role {
  font-size: 0.9em;
  padding: 3px 10px;
  border-radius: 12px;
  display: inline-block;
}

.role-admin {
  background: rgba(255, 215, 0, 0.3);
  color: #ffd700;
  border: 1px solid #ffd700;
}

.role-player {
  background: rgba(78, 205, 196, 0.3);
  color: #4ecdc4;
  border: 1px solid #4ecdc4;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 15px;
}

.gold-display,
.damage-display,
.attack-display {
  background: rgba(255, 255, 255, 0.2);
  padding: 10px 8px;
  border-radius: 10px;
  backdrop-filter: blur(10px);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gold-display .label,
.damage-display .label,
.attack-display .label {
  font-size: 0.75em;
  opacity: 0.9;
}

.gold-display .value {
  color: #ffd700;
  font-weight: bold;
  font-size: 1.1em;
}

.gps {
  color: #90ee90;
  font-size: 0.7em;
  margin-top: 2px;
}

.damage-display .value {
  color: #4ecdc4;
  font-weight: bold;
  font-size: 1.1em;
}

.attack-display .value {
  color: #ff6b6b;
  font-weight: bold;
  font-size: 1.1em;
}

.game-content {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overflow-x: hidden;
}

.tree-section {
  background: rgba(255, 255, 255, 0.1);
  padding: 20px 15px;
  border-radius: 15px;
  margin-bottom: 20px;
  backdrop-filter: blur(10px);
}

.tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 10px;
}

.tree-section h2 {
  margin: 0;
  font-size: 1.3em;
}

.multiplayer-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  padding: 6px 12px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9e9e9e;
  animation: pulse-dot 2s ease-in-out infinite;
}

.multiplayer-status.online .status-dot {
  background: #4caf50;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.6);
}

.multiplayer-status.offline .status-dot {
  background: #9e9e9e;
}

.online-count {
  color: #4ecdc4;
  font-weight: bold;
}

.multiplayer-error {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
  padding: 8px 12px;
  margin-top: 8px;
  border-radius: 8px;
  background: rgba(244, 67, 54, 0.2);
  border: 1px solid rgba(244, 67, 54, 0.5);
  color: #ff5252;
  backdrop-filter: blur(10px);
}

.multiplayer-error .error-icon {
  font-size: 1.2em;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.multiplayer-info {
  margin-top: 20px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.online-players,
.recent-attacks {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 12px;
  backdrop-filter: blur(10px);
}

.online-players h3,
.recent-attacks h3 {
  font-size: 0.9em;
  margin: 0 0 10px 0;
  color: rgba(255, 255, 255, 0.9);
  font-weight: bold;
}

.players-list,
.attacks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  transition: background 0.2s;
}

.player-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.player-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.player-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.9em;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.player-info {
  flex: 1;
  min-width: 0;
}

.player-name {
  font-size: 0.85em;
  font-weight: bold;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-weapon {
  font-size: 0.75em;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attack-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 0.85em;
  transition: all 0.2s;
  animation: slideIn 0.3s ease-out;
}

.attack-item.own-attack {
  background: rgba(78, 205, 196, 0.2);
  border-left: 3px solid #4ecdc4;
}

.attack-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.attack-player {
  font-weight: bold;
  color: #fff;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attack-damage {
  color: #ff6b6b;
  font-weight: bold;
  font-size: 1.1em;
}

.attack-weapon {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.attack-time {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75em;
  margin-left: auto;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.tree-container {
  text-align: center;
}

.tree-visual {
  font-size: 5em;
  margin-bottom: 15px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.health-bar-container {
  max-width: 100%;
  margin: 0 auto;
}

.health-bar-label {
  margin-bottom: 8px;
  font-size: 0.9em;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.health-bar-label .percent {
  font-size: 0.85em;
}

.percent {
  color: #ffd700;
  font-size: 0.9em;
  margin-left: 10px;
}

.health-bar {
  width: 100%;
  height: 24px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.3);
  position: relative;
}

.health-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4ecdc4, #44a08d);
  transition: width 0.3s ease;
  box-shadow: 0 0 10px rgba(78, 205, 196, 0.5);
}

.health-percent-display {
  margin-top: 8px;
  font-size: 1.3em;
  font-weight: bold;
  color: #ffd700;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.draw-section {
  text-align: center;
  margin-bottom: 20px;
}

.draw-button {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  border: none;
  color: white;
  padding: 16px 30px;
  font-size: 1.1em;
  border-radius: 50px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  font-weight: bold;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  min-height: 48px; /* 觸摸友好 */
  width: 100%;
  max-width: 100%;
  touch-action: manipulation; /* 移動設備優化 */
}

.draw-button:active:not(:disabled) {
  transform: scale(0.98);
}

.draw-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card-count {
  margin-top: 12px;
  font-size: 0.9em;
  line-height: 1.4;
}

.cards-section {
  background: rgba(255, 255, 255, 0.1);
  padding: 20px 15px;
  border-radius: 15px;
  backdrop-filter: blur(10px);
  margin-bottom: 20px;
}

.cards-section h2 {
  text-align: center;
  margin-bottom: 15px;
  font-size: 1.2em;
}

.no-cards {
  text-align: center;
  padding: 40px;
  font-size: 1.2em;
  color: rgba(255, 255, 255, 0.7);
}

.current-axe-container {
  display: flex;
  justify-content: center;
  max-width: 100%;
  margin: 0 auto;
}

.current-axe-card {
  width: 100%;
}

.card-level-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  background: linear-gradient(135deg, #ffd700, #ffb347);
  color: #000;
  padding: 5px 12px;
  border-radius: 15px;
  font-weight: bold;
  font-size: 0.9em;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.card {
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.3), rgba(255, 193, 7, 0.3));
  border-radius: 15px;
  padding: 18px 15px;
  backdrop-filter: blur(10px);
  transition: transform 0.2s, box-shadow 0.2s;
  border: 2px solid #ff9800;
  box-shadow: 0 0 20px rgba(255, 152, 0, 0.5);
  position: relative;
}

.card:active {
  transform: scale(0.98);
}

.card-icon {
  font-size: 2.5em;
  text-align: center;
  margin-bottom: 8px;
}

.card-name {
  font-size: 1.3em;
  font-weight: bold;
  margin-bottom: 8px;
  text-align: center;
  color: #ffd700;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.card-description {
  font-size: 0.85em;
  text-align: center;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-style: italic;
  line-height: 1.4;
}

.card-stats {
  margin-bottom: 10px;
}

.stat {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.9em;
}

.stat-value {
  font-weight: bold;
  color: #ffd700;
}

.gold-gain-indicator {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255, 215, 0, 0.9);
  color: #000;
  padding: 5px 10px;
  border-radius: 15px;
  font-weight: bold;
  font-size: 0.9em;
  animation: fadeUp 1s ease-out forwards;
}

@keyframes fadeUp {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-20px);
  }
}


.page-content {
  flex: 1;
  width: 100%;
}

.inventory-section {
  background: rgba(255, 255, 255, 0.1);
  padding: 30px;
  border-radius: 15px;
  backdrop-filter: blur(10px);
  margin-top: 30px;
}

.inventory-section h2 {
  text-align: center;
  margin-bottom: 20px;
}

.inventory-page {
  padding-bottom: 20px;
}

.inventory-section-full {
  width: 100%;
  padding: 20px 0;
}

.inventory-section-full h2 {
  text-align: center;
  margin-bottom: 20px;
  font-size: 1.8em;
}

.inventory-grid-full {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  padding: 0 10px;
}

.inventory-grid-compact {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
  padding: 0 10px;
}

.inventory-card-full {
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.3), rgba(255, 193, 7, 0.3));
  border-radius: 15px;
  padding: 18px 15px;
  backdrop-filter: blur(10px);
  transition: all 0.2s;
  border: 2px solid #ff9800;
  box-shadow: 0 0 20px rgba(255, 152, 0, 0.5);
  position: relative;
  touch-action: manipulation;
}

.inventory-card-compact {
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.3), rgba(255, 193, 7, 0.3));
  border-radius: 12px;
  padding: 12px 8px;
  backdrop-filter: blur(10px);
  transition: all 0.2s;
  border: 2px solid #ff9800;
  box-shadow: 0 0 15px rgba(255, 152, 0, 0.4);
  position: relative;
  touch-action: manipulation;
  cursor: pointer;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}

.inventory-card-compact:active {
  transform: scale(0.95);
}

.inventory-card-compact.active {
  border: 3px solid #4ecdc4;
  box-shadow: 0 0 20px rgba(78, 205, 196, 0.6);
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.3), rgba(68, 160, 141, 0.3));
}

.inventory-card-compact.upgrade-mode {
  border: 2px dashed rgba(156, 39, 176, 0.5);
}

.inventory-card-compact.selected-upgrade {
  border: 3px solid #4caf50;
  box-shadow: 0 0 20px rgba(76, 175, 80, 0.6);
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(56, 142, 60, 0.3));
}

.inventory-card-compact.selected-sacrifice {
  border: 3px solid #ff6b6b;
  box-shadow: 0 0 20px rgba(255, 107, 107, 0.6);
  background: linear-gradient(135deg, rgba(255, 107, 107, 0.3), rgba(238, 90, 111, 0.3));
}

.inventory-card-full.active {
  border: 3px solid #4ecdc4;
  box-shadow: 0 0 25px rgba(78, 205, 196, 0.7);
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.3), rgba(68, 160, 141, 0.3));
}

.card-level-badge-inventory {
  position: absolute;
  top: 10px;
  left: 10px;
  background: linear-gradient(135deg, #ffd700, #ffb347);
  color: #000;
  padding: 5px 12px;
  border-radius: 15px;
  font-weight: bold;
  font-size: 0.9em;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.card-level-badge-compact {
  position: absolute;
  top: 4px;
  left: 4px;
  background: linear-gradient(135deg, #ffd700, #ffb347);
  color: #000;
  padding: 2px 6px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 0.7em;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.card-rarity-badge-compact {
  position: absolute;
  top: 4px;
  right: 4px;
  color: white;
  padding: 2px 6px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 0.65em;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.card-icon-compact {
  font-size: 2.5em;
  text-align: center;
  margin-bottom: 6px;
  margin-top: 8px;
}

.card-name-compact {
  font-size: 0.85em;
  font-weight: bold;
  text-align: center;
  color: #ffd700;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  line-height: 1.2;
  word-break: break-word;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.equipped-badge-compact {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(78, 205, 196, 0.9);
  color: white;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 0.65em;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.selection-badge-compact {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 4px 8px;
  border-radius: 10px;
  font-size: 0.7em;
  font-weight: bold;
  z-index: 15;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.card-actions-compact {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  width: 100%;
  padding: 0 4px;
}

.btn-select-upgrade-compact,
.btn-select-sacrifice-compact {
  flex: 1;
  background: linear-gradient(135deg, #4caf50, #388e3c);
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 0.7em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  touch-action: manipulation;
}

.btn-select-sacrifice-compact {
  background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
}

.btn-select-upgrade-compact:active,
.btn-select-sacrifice-compact:active:not(:disabled) {
  transform: scale(0.95);
}

.btn-select-upgrade-compact.selected {
  background: linear-gradient(135deg, #81c784, #66bb6a);
  box-shadow: 0 0 10px rgba(76, 175, 80, 0.8);
}

.btn-select-sacrifice-compact.selected {
  background: linear-gradient(135deg, #ff8a80, #ff5252);
  box-shadow: 0 0 10px rgba(255, 107, 107, 0.8);
}

.btn-select-sacrifice-compact:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(135deg, #9e9e9e, #757575);
}

.card-icon-inventory {
  font-size: 3em;
  text-align: center;
  margin-bottom: 10px;
}

.card-name-inventory {
  font-size: 1.3em;
  font-weight: bold;
  margin-bottom: 8px;
  text-align: center;
  color: #ffd700;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.card-description-inventory {
  font-size: 0.85em;
  text-align: center;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-style: italic;
}

.card-stats-inventory {
  margin-top: 10px;
}

.stat-inventory {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.9em;
}

.stat-label-inventory {
  color: rgba(255, 255, 255, 0.8);
}

.stat-value-inventory {
  font-weight: bold;
  color: #ffd700;
}

.equipped-badge-full {
  background: rgba(78, 205, 196, 0.9);
  color: white;
  padding: 8px 16px;
  border-radius: 12px;
  font-size: 0.9em;
  font-weight: bold;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
  text-align: center;
  flex: 1;
}

.card-actions-inventory {
  display: flex;
  gap: 10px;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-equip-inventory {
  flex: 1;
  background: linear-gradient(135deg, #4ecdc4, #44a08d);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 8px rgba(78, 205, 196, 0.4);
  touch-action: manipulation;
}

.btn-equip-inventory:active {
  transform: scale(0.95);
  box-shadow: 0 2px 4px rgba(78, 205, 196, 0.3);
}

.btn-sell-inventory {
  flex: 1;
  background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 8px rgba(255, 107, 107, 0.4);
  touch-action: manipulation;
}

.btn-sell-inventory:active:not(:disabled) {
  transform: scale(0.95);
  box-shadow: 0 2px 4px rgba(255, 107, 107, 0.3);
}

.btn-sell-inventory:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(135deg, #9e9e9e, #757575);
  box-shadow: none;
}

/* 升級模式樣式 */
.inventory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 0 10px;
}

.inventory-header h2 {
  margin: 0;
}

.inventory-actions {
  display: flex;
  gap: 10px;
}

.btn-upgrade-mode {
  background: linear-gradient(135deg, #9c27b0, #7b1fa2);
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 10px;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 8px rgba(156, 39, 176, 0.4);
  touch-action: manipulation;
}

.btn-upgrade-mode:active:not(:disabled) {
  transform: scale(0.95);
  box-shadow: 0 2px 4px rgba(156, 39, 176, 0.3);
}

.btn-upgrade-mode:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(135deg, #9e9e9e, #757575);
  box-shadow: none;
}

.upgrade-mode-controls {
  display: flex;
  gap: 8px;
}

.btn-cancel-upgrade {
  background: linear-gradient(135deg, #9e9e9e, #757575);
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 10px;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  touch-action: manipulation;
}

.btn-cancel-upgrade:active {
  transform: scale(0.95);
}

.btn-confirm-upgrade {
  background: linear-gradient(135deg, #4caf50, #388e3c);
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 10px;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 8px rgba(76, 175, 80, 0.4);
  touch-action: manipulation;
}

.btn-confirm-upgrade:active:not(:disabled) {
  transform: scale(0.95);
  box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
}

.btn-confirm-upgrade:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(135deg, #9e9e9e, #757575);
  box-shadow: none;
}

.upgrade-mode-hint {
  background: rgba(156, 39, 176, 0.2);
  border: 2px solid #9c27b0;
  border-radius: 12px;
  padding: 15px;
  margin: 0 10px 20px 10px;
  text-align: left;
}

.upgrade-mode-hint p {
  margin: 5px 0;
  color: rgba(255, 255, 255, 0.9);
}

.sacrifice-explanation {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 15px;
}

.sacrifice-explanation h3 {
  margin: 0 0 10px 0;
  color: #fff;
  font-size: 1.1em;
  font-weight: bold;
}

.sacrifice-explanation p {
  margin: 5px 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.95em;
}

.sacrifice-explanation ul {
  margin: 10px 0;
  padding-left: 20px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.9em;
}

.sacrifice-explanation li {
  margin: 6px 0;
  line-height: 1.5;
}

.hint-text {
  text-align: center;
  margin-top: 10px !important;
  font-weight: bold;
}

.hint-upgrade {
  color: #4caf50;
  font-weight: bold;
}

.hint-sacrifice {
  color: #ff6b6b;
  font-weight: bold;
}

.current-weapon-note {
  color: #4ecdc4;
  font-size: 0.9em;
  font-style: italic;
}

.selected-info {
  font-weight: bold;
  margin-top: 10px !important;
}

.rarity-batch-select {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.batch-select-title {
  font-size: 0.9em;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 12px;
  font-weight: 500;
}

.rarity-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.rarity-select-btn {
  padding: 10px 16px;
  border: 2px solid;
  border-radius: 10px;
  background: transparent;
  color: white;
  font-size: 0.9em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(10px);
  min-width: 100px;
  justify-content: center;
}

.rarity-select-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.rarity-select-btn:active:not(:disabled) {
  transform: translateY(0);
}

.rarity-select-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.rarity-select-btn.all-selected {
  color: white;
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
}

.rarity-select-btn.partially-selected {
  color: white;
}

.rarity-btn-icon {
  font-size: 1em;
}

.rarity-btn-count {
  font-size: 0.85em;
  opacity: 0.9;
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 8px;
  border-radius: 10px;
}

.inventory-card-full.upgrade-mode {
  border: 2px dashed rgba(156, 39, 176, 0.5);
}

.inventory-card-full.selected-upgrade {
  border: 3px solid #4caf50;
  box-shadow: 0 0 20px rgba(76, 175, 80, 0.6);
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(56, 142, 60, 0.3));
}

.inventory-card-full.selected-sacrifice {
  border: 3px solid #ff6b6b;
  box-shadow: 0 0 20px rgba(255, 107, 107, 0.6);
  background: linear-gradient(135deg, rgba(255, 107, 107, 0.3), rgba(238, 90, 111, 0.3));
}

.selection-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 5px 12px;
  border-radius: 15px;
  font-size: 0.8em;
  font-weight: bold;
  z-index: 10;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}

.upgrade-badge {
  background: linear-gradient(135deg, #4caf50, #388e3c);
  color: white;
}

.sacrifice-badge {
  background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
  color: white;
}

.btn-select-upgrade {
  flex: 1;
  background: linear-gradient(135deg, #4caf50, #388e3c);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 8px rgba(76, 175, 80, 0.4);
  touch-action: manipulation;
}

.btn-select-upgrade:active {
  transform: scale(0.95);
  box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
}

.btn-select-upgrade.selected {
  background: linear-gradient(135deg, #81c784, #66bb6a);
  box-shadow: 0 0 15px rgba(76, 175, 80, 0.8);
}

.btn-select-sacrifice {
  flex: 1;
  background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 8px rgba(255, 107, 107, 0.4);
  touch-action: manipulation;
}

.btn-select-sacrifice:active:not(:disabled) {
  transform: scale(0.95);
  box-shadow: 0 2px 4px rgba(255, 107, 107, 0.3);
}

.btn-select-sacrifice.selected {
  background: linear-gradient(135deg, #ff8a80, #ff5252);
  box-shadow: 0 0 15px rgba(255, 107, 107, 0.8);
}

.btn-select-sacrifice:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(135deg, #9e9e9e, #757575);
  box-shadow: none;
}

/* 背包卡片稀有度邊框 */
.inventory-card-full.rarity-COMMON,
.inventory-card-compact.rarity-COMMON {
  border-color: #9e9e9e;
}

.inventory-card-full.rarity-RARE,
.inventory-card-compact.rarity-RARE {
  border-color: #2196f3;
  box-shadow: 0 0 20px rgba(33, 150, 243, 0.4);
}

.inventory-card-full.rarity-EPIC,
.inventory-card-compact.rarity-EPIC {
  border-color: #9c27b0;
  box-shadow: 0 0 25px rgba(156, 39, 176, 0.5);
}

.inventory-card-full.rarity-LEGENDARY,
.inventory-card-compact.rarity-LEGENDARY {
  border-color: #ff9800;
  box-shadow: 0 0 30px rgba(255, 152, 0, 0.6);
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.4), rgba(255, 193, 7, 0.4));
}

/* 當前斧頭卡片稀有度邊框 */
.card.rarity-COMMON {
  border-color: #9e9e9e;
}

.card.rarity-RARE {
  border-color: #2196f3;
  box-shadow: 0 0 20px rgba(33, 150, 243, 0.4);
}

.card.rarity-EPIC {
  border-color: #9c27b0;
  box-shadow: 0 0 25px rgba(156, 39, 176, 0.5);
}

.card.rarity-LEGENDARY {
  border-color: #ff9800;
  box-shadow: 0 0 30px rgba(255, 152, 0, 0.6);
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.4), rgba(255, 193, 7, 0.4));
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 15px;
}

.inventory-card {
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.2), rgba(255, 193, 7, 0.2));
  border-radius: 12px;
  padding: 12px;
  backdrop-filter: blur(10px);
  transition: all 0.2s;
  border: 2px solid rgba(255, 152, 0, 0.5);
  box-shadow: 0 0 15px rgba(255, 152, 0, 0.3);
  position: relative;
  cursor: pointer;
  touch-action: manipulation;
}

.inventory-card:active {
  transform: scale(0.95);
}

.inventory-card.active {
  border: 3px solid #4ecdc4;
  box-shadow: 0 0 20px rgba(78, 205, 196, 0.6);
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.3), rgba(68, 160, 141, 0.3));
}

.card-level-badge-small {
  position: absolute;
  top: 5px;
  left: 5px;
  background: linear-gradient(135deg, #ffd700, #ffb347);
  color: #000;
  padding: 3px 8px;
  border-radius: 10px;
  font-weight: bold;
  font-size: 0.75em;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.card-icon-small {
  font-size: 2em;
  text-align: center;
  margin-bottom: 8px;
}

.card-name-small {
  font-size: 1em;
  font-weight: bold;
  text-align: center;
  margin-bottom: 8px;
  color: #ffd700;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

.card-stats-small {
  margin-top: 8px;
}

.stat-small {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.8em;
}

.stat-label-small {
  color: rgba(255, 255, 255, 0.8);
}

.stat-value-small {
  font-weight: bold;
  color: #ffd700;
}

.equipped-badge {
  position: absolute;
  bottom: 5px;
  right: 5px;
  background: rgba(78, 205, 196, 0.9);
  color: white;
  padding: 3px 8px;
  border-radius: 10px;
  font-size: 0.7em;
  font-weight: bold;
}

/* 底部導航欄 */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 8px 0;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  z-index: 1000;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  min-height: 56px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.nav-item:active {
  transform: scale(0.95);
}

.nav-item.active {
  color: #4ecdc4;
}

.nav-item.active .nav-icon {
  transform: scale(1.1);
}

.nav-icon {
  font-size: 1.6em;
  margin-bottom: 3px;
  transition: transform 0.2s;
  line-height: 1;
}

.nav-label {
  font-size: 0.7em;
  font-weight: 500;
  line-height: 1.2;
}

.nav-badge {
  position: absolute;
  top: 4px;
  right: calc(50% - 25px);
  background: #ff6b6b;
  color: white;
  border-radius: 10px;
  padding: 2px 5px;
  font-size: 0.65em;
  font-weight: bold;
  min-width: 16px;
  text-align: center;
  line-height: 1.2;
}

/* 機率頁面輪播樣式 */
.probability-page {
  padding: 20px 10px;
  padding-bottom: 90px;
}

.probability-page-content {
  width: 100%;
}

.probability-page-content h2 {
  text-align: center;
  font-size: 2em;
  margin-bottom: 30px;
  color: #fff;
}

.probability-carousel-container {
  display: flex;
  flex-direction: column;
  gap: 25px;
  padding: 0 10px;
}

.rarity-carousel-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  border-radius: 20px;
  border: 3px solid;
  overflow: hidden;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: all 0.3s;
}

.rarity-header-carousel {
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
  font-weight: bold;
  font-size: 1.2em;
}

.rarity-name-carousel {
  font-size: 1.3em;
}

.rarity-percent-carousel {
  font-size: 1.1em;
  opacity: 0.9;
}

.carousel-content {
  position: relative;
  padding: 30px 20px;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.carousel-card-display {
  text-align: center;
  width: 100%;
  animation: fadeIn 0.3s ease-in;
}

.clickable-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border-radius: 12px;
  padding: 8px;
  margin: -8px;
}

.clickable-card:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.05);
}

.clickable-card:active {
  transform: translateY(0);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.carousel-card-icon {
  font-size: 5em;
  margin-bottom: 15px;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
}

.carousel-card-name {
  font-size: 1.8em;
  font-weight: bold;
  color: #fff;
  margin-bottom: 10px;
}

.carousel-card-description {
  font-size: 1em;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 15px;
  padding: 0 10px;
  line-height: 1.5;
}

.carousel-card-probability {
  font-size: 1.3em;
  font-weight: bold;
  color: #ffd700;
  margin-bottom: 10px;
  padding: 10px 20px;
  background: rgba(255, 215, 0, 0.2);
  border-radius: 15px;
  display: inline-block;
}

.carousel-card-index {
  font-size: 0.9em;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 10px;
}

.carousel-controls {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 100%;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
  padding: 0 10px;
}

.carousel-btn {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  font-size: 2.5em;
  font-weight: bold;
  color: #333;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.3s;
  pointer-events: all;
  touch-action: manipulation;
  line-height: 1;
  padding: 0;
}

.carousel-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 1);
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.carousel-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.carousel-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.carousel-btn-prev {
  left: 10px;
}

.carousel-btn-next {
  right: 10px;
}

/* 移動設備專用樣式 */
@media (max-width: 768px) {
  .game-container {
    padding: 12px;
    padding-bottom: 85px;
  }

  .game-header h1 {
    font-size: 1.5em;
    margin-bottom: 12px;
  }

  .user-info {
    padding: 10px 12px;
    margin-bottom: 12px;
  }

  .user-avatar {
    width: 40px;
    height: 40px;
  }

  .user-name {
    font-size: 0.9em;
  }

  .stats {
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 12px;
  }

  .gold-display,
  .damage-display,
  .attack-display {
    padding: 8px 6px;
  }

  .gold-display .label,
  .damage-display .label,
  .attack-display .label {
    font-size: 0.7em;
  }

  .gold-display .value,
  .damage-display .value,
  .attack-display .value {
    font-size: 1em;
  }

  .gps {
    font-size: 0.65em;
  }
  
  .tree-section {
    padding: 15px 12px;
    margin-bottom: 15px;
  }

  .tree-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .tree-section h2 {
    font-size: 1.1em;
    margin-bottom: 8px;
  }

  .multiplayer-status {
    font-size: 0.75em;
    padding: 4px 8px;
  }

  .multiplayer-info {
    grid-template-columns: 1fr;
    gap: 12px;
    margin-top: 15px;
  }

  .online-players,
  .recent-attacks {
    padding: 10px;
  }

  .online-players h3,
  .recent-attacks h3 {
    font-size: 0.85em;
    margin-bottom: 8px;
  }

  .player-item,
  .attack-item {
    padding: 5px;
    font-size: 0.8em;
  }

  .player-avatar,
  .player-avatar-placeholder {
    width: 28px;
    height: 28px;
    font-size: 0.8em;
  }

  .attack-weapon {
    max-width: 80px;
  }

  .tree-visual {
    font-size: 4em;
    margin-bottom: 12px;
  }

  .health-bar-label {
    font-size: 0.85em;
  }

  .health-bar {
    height: 20px;
  }

  .health-percent-display {
    font-size: 1.1em;
    margin-top: 6px;
  }

  .draw-section {
    margin-bottom: 15px;
  }

  .draw-button {
    padding: 14px 20px;
    font-size: 1em;
  }

  .card-count {
    font-size: 0.85em;
    margin-top: 10px;
  }

  .cards-section {
    padding: 15px 12px;
    margin-bottom: 15px;
  }

  .cards-section h2 {
    font-size: 1.1em;
    margin-bottom: 12px;
  }

  .card {
    padding: 15px 12px;
  }

  .card-icon {
    font-size: 2em;
  }

  .card-name {
    font-size: 1.2em;
  }

  .card-description {
    font-size: 0.8em;
  }

  .stat {
    font-size: 0.85em;
  }

  .inventory-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
  }

  .inventory-grid-full {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 0 5px;
  }

  .inventory-section-full h2 {
    font-size: 1.3em;
    margin-bottom: 15px;
  }

  .inventory-card-full {
    padding: 15px 12px;
  }

  /* 機率頁面輪播移動設備樣式 */
  .probability-page-content h2 {
    font-size: 1.5em;
    margin-bottom: 20px;
  }

  .probability-carousel-container {
    gap: 20px;
    padding: 0 5px;
  }

  .rarity-header-carousel {
    padding: 12px 15px;
    font-size: 1em;
  }

  .rarity-name-carousel {
    font-size: 1.1em;
  }

  .rarity-percent-carousel {
    font-size: 0.95em;
  }

  .carousel-content {
    padding: 20px 15px;
    min-height: 250px;
  }

  .carousel-card-icon {
    font-size: 4em;
    margin-bottom: 12px;
  }

  .carousel-card-name {
    font-size: 1.5em;
    margin-bottom: 8px;
  }

  .carousel-card-description {
    font-size: 0.9em;
    margin-bottom: 12px;
  }

  .carousel-card-probability {
    font-size: 1.1em;
    padding: 8px 16px;
  }

  .carousel-card-index {
    font-size: 0.85em;
  }

  .carousel-btn {
    width: 45px;
    height: 45px;
    font-size: 2em;
  }

  .modal-content {
    max-width: 95%;
    max-height: 85vh;
  }

  .modal-header {
    padding: 15px 20px;
  }

  .modal-header h2 {
    font-size: 1.3em;
  }

  .modal-close {
    width: 36px;
    height: 36px;
    font-size: 1.8em;
  }

  .modal-body {
    padding: 15px 20px;
  }

  .rarity-group-modal {
    margin-bottom: 20px;
  }

  .rarity-header-modal {
    font-size: 1em;
    padding: 8px 12px;
  }

  .probability-item-modal {
    padding: 8px 10px;
    font-size: 0.9em;
  }

  .probability-icon-modal {
    font-size: 1.3em;
  }

  .probability-percent-modal {
    font-size: 1em;
    min-width: 45px;
  }

  .card-icon-inventory {
    font-size: 2.5em;
  }

  .card-name-inventory {
    font-size: 1.2em;
  }

  .card-description-inventory {
    font-size: 0.8em;
  }
}

/* 移動設備橫屏時調整 */
@media (max-width: 768px) and (orientation: landscape) {
  .bottom-nav {
    padding: 6px 0;
    padding-bottom: calc(6px + env(safe-area-inset-bottom));
  }

  .nav-item {
    min-height: 48px;
  }

  .nav-icon {
    font-size: 1.4em;
    margin-bottom: 2px;
  }

  .nav-label {
    font-size: 0.65em;
  }
}

/* 小屏幕設備優化 */
@media (max-width: 360px) {
  .game-container {
    padding: 10px;
    padding-bottom: 80px;
  }

  .game-header h1 {
    font-size: 1.3em;
  }

  .stats {
    gap: 4px;
  }

  .gold-display,
  .damage-display,
  .attack-display {
    padding: 6px 4px;
  }

  .gold-display .value,
  .damage-display .value,
  .attack-display .value {
    font-size: 0.95em;
  }

  .draw-button {
    font-size: 0.95em;
    padding: 12px 18px;
  }

  .bottom-nav {
    padding: 6px 0;
    padding-bottom: calc(6px + env(safe-area-inset-bottom));
  }

  .nav-item {
    min-height: 52px;
    padding: 5px 6px;
  }

  .nav-icon {
    font-size: 1.4em;
  }

  .nav-label {
    font-size: 0.65em;
  }
}

/* 通知提示樣式 */
.notification {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  max-width: 90%;
  width: auto;
  min-width: 280px;
  animation: notification-show 0.3s ease-out;
}

.notification-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 12px;
  backdrop-filter: blur(20px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.notification-success {
  background: rgba(76, 175, 80, 0.95);
  border-color: rgba(76, 175, 80, 0.5);
}

.notification-error {
  background: rgba(244, 67, 54, 0.95);
  border-color: rgba(244, 67, 54, 0.5);
}

.notification-info {
  background: rgba(33, 150, 243, 0.95);
  border-color: rgba(33, 150, 243, 0.5);
}

.notification-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  font-weight: bold;
  font-size: 1.1em;
  color: white;
}

.notification-message {
  flex: 1;
  color: white;
  font-size: 0.95em;
  font-weight: 500;
  line-height: 1.4;
  word-break: break-word;
}

.notification-close {
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: white;
  font-size: 1.5em;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
  touch-action: manipulation;
}

.notification-close:active {
  background: rgba(255, 255, 255, 0.2);
}

/* 通知動畫 */
.notification-slide-enter-active,
.notification-slide-leave-active {
  transition: all 0.3s ease;
}

.notification-slide-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

.notification-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

@keyframes notification-show {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px);
  }
  100% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 移動設備通知優化 */
@media (max-width: 768px) {
  .notification {
    top: 15px;
    max-width: calc(100% - 30px);
    min-width: 260px;
  }

  .notification-content {
    padding: 12px 15px;
    gap: 10px;
  }

  .notification-icon {
    width: 22px;
    height: 22px;
    font-size: 1em;
  }

  .notification-message {
    font-size: 0.9em;
  }

  .notification-close {
    width: 22px;
    height: 22px;
    font-size: 1.3em;
  }
}

/* 武器詳情彈窗樣式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(5px);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-content-weapon {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.95), rgba(118, 75, 162, 0.95));
  border-radius: 20px;
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  position: relative;
}

.modal-header-weapon {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
}

.modal-header-weapon h2 {
  margin: 0;
  color: #fff;
  font-size: 1.5em;
}

.modal-close-weapon {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 2em;
  cursor: pointer;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
  line-height: 1;
  padding: 0;
}

.modal-close-weapon:active {
  background: rgba(255, 255, 255, 0.2);
}

.modal-body-weapon {
  padding: 20px;
}

.weapon-detail-card {
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.3), rgba(255, 193, 7, 0.3));
  border-radius: 15px;
  padding: 20px;
  backdrop-filter: blur(10px);
  border: 2px solid #ff9800;
  box-shadow: 0 0 20px rgba(255, 152, 0, 0.5);
  position: relative;
}

.weapon-modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-equip-modal {
  flex: 1;
  background: linear-gradient(135deg, #4ecdc4, #44a08d);
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 8px rgba(78, 205, 196, 0.4);
  touch-action: manipulation;
}

.btn-equip-modal:active {
  transform: scale(0.95);
}

.btn-sell-modal {
  flex: 1;
  background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 8px rgba(255, 107, 107, 0.4);
  touch-action: manipulation;
}

.btn-sell-modal:active:not(:disabled) {
  transform: scale(0.95);
}

.btn-sell-modal:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(135deg, #9e9e9e, #757575);
  box-shadow: none;
}

.equipped-badge-modal {
  flex: 1;
  background: rgba(78, 205, 196, 0.9);
  color: white;
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 1em;
  font-weight: bold;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}

.btn-close-modal {
  flex: 1;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
  touch-action: manipulation;
}

.btn-close-modal:active {
  transform: scale(0.95);
}

/* 彈窗動畫 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-active .modal-content-weapon,
.modal-fade-leave-active .modal-content-weapon {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.modal-fade-enter-from {
  opacity: 0;
}

.modal-fade-enter-from .modal-content-weapon {
  transform: scale(0.9) translateY(-20px);
  opacity: 0;
}

.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-leave-to .modal-content-weapon {
  transform: scale(0.9) translateY(-20px);
  opacity: 0;
}

/* 移動設備彈窗優化 */
@media (max-width: 768px) {
  .modal-overlay {
    padding: 10px;
  }

  .modal-content-weapon {
    max-width: 100%;
    max-height: 95vh;
  }

  .modal-header-weapon {
    padding: 15px;
  }

  .modal-header-weapon h2 {
    font-size: 1.2em;
  }

  .modal-close-weapon {
    width: 36px;
    height: 36px;
    font-size: 1.8em;
  }

  .modal-body-weapon {
    padding: 15px;
  }

  .inventory-grid-compact {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 10px;
  }

  .inventory-card-compact {
    min-height: 100px;
    padding: 8px 6px;
  }

  .card-icon-compact {
    font-size: 2em;
  }

  .card-name-compact {
    font-size: 0.75em;
  }
}

/* 抽卡頁面樣式 */
.draw-page {
  padding: 20px 10px;
  padding-bottom: 90px;
}

.draw-page-content {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.draw-page-content h2 {
  text-align: center;
  font-size: 2em;
  margin-bottom: 20px;
  color: #fff;
}

.gold-display-draw {
  text-align: center;
  margin-bottom: 30px;
  padding: 15px 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  backdrop-filter: blur(10px);
  display: inline-block;
}

.gold-label {
  font-size: 1.1em;
  color: rgba(255, 255, 255, 0.9);
  margin-right: 10px;
}

.gold-value {
  font-size: 1.5em;
  font-weight: bold;
  color: #ffd700;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
}

.draw-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  padding: 0 10px;
}

.draw-option-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  border-radius: 20px;
  border: 3px solid;
  overflow: hidden;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: all 0.3s;
}

.draw-option-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.draw-option-header {
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
  font-weight: bold;
}

.rarity-name-draw {
  font-size: 1.5em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.rarity-price {
  font-size: 1.3em;
  background: rgba(255, 255, 255, 0.2);
  padding: 8px 16px;
  border-radius: 20px;
  backdrop-filter: blur(10px);
}

.draw-option-content {
  padding: 20px;
}

.draw-option-description {
  margin-bottom: 20px;
  text-align: center;
}

.draw-option-description p {
  margin: 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 1em;
  line-height: 1.6;
}

.draw-option-cards-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-bottom: 20px;
  padding: 15px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
}

.preview-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  min-width: 60px;
  transition: transform 0.2s;
}

.preview-card:hover {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.2);
}

.preview-icon {
  font-size: 2em;
}

.preview-name {
  font-size: 0.75em;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  word-break: break-word;
  max-width: 60px;
}

.preview-more {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9em;
  font-weight: bold;
}

.draw-option-button {
  width: 100%;
  padding: 16px 20px;
  border: none;
  border-radius: 12px;
  font-size: 1.2em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.draw-option-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}

.draw-option-button:active:not(:disabled) {
  transform: translateY(0);
}

.draw-option-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #9e9e9e !important;
}

.button-icon {
  font-size: 1.3em;
}

.button-text {
  font-size: 1em;
}

.button-common {
  background: linear-gradient(135deg, #9e9e9e, #757575);
  color: white;
}

.button-rare {
  background: linear-gradient(135deg, #2196f3, #1976d2);
  color: white;
}

.button-epic {
  background: linear-gradient(135deg, #9c27b0, #7b1fa2);
  color: white;
}

.button-legendary {
  background: linear-gradient(135deg, #ff9800, #f57c00);
  color: white;
}

/* 抽卡頁面移動設備優化 */
@media (max-width: 768px) {
  .draw-page {
    padding: 15px 5px;
    padding-bottom: 90px;
  }

  .draw-page-content h2 {
    font-size: 1.5em;
    margin-bottom: 15px;
  }

  .gold-display-draw {
    padding: 12px 16px;
    margin-bottom: 20px;
  }

  .gold-label {
    font-size: 1em;
  }

  .gold-value {
    font-size: 1.3em;
  }

  .draw-options {
    grid-template-columns: 1fr;
    gap: 15px;
    padding: 0 5px;
  }

  .draw-option-header {
    padding: 15px;
  }

  .rarity-name-draw {
    font-size: 1.2em;
  }

  .rarity-price {
    font-size: 1.1em;
    padding: 6px 12px;
  }

  .draw-option-content {
    padding: 15px;
  }

  .draw-option-cards-preview {
    gap: 8px;
    padding: 12px;
  }

  .preview-card {
    min-width: 50px;
    padding: 8px;
  }

  .preview-icon {
    font-size: 1.5em;
  }

  .preview-name {
    font-size: 0.7em;
    max-width: 50px;
  }

  .draw-option-button {
    padding: 14px 18px;
    font-size: 1.1em;
  }
}

/* 聊天室頁面樣式 */
.chat-page {
  padding: 20px 10px;
  padding-bottom: 90px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 200px);
  max-height: calc(100vh - 200px);
}

.chat-page-content {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-page-content h2 {
  text-align: center;
  font-size: 2em;
  margin-bottom: 20px;
  color: #fff;
}

.chat-messages-container {
  flex: 1;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 15px;
  margin-bottom: 15px;
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 300px;
  max-height: calc(100vh - 350px);
}

.chat-message {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 12px 15px;
  backdrop-filter: blur(10px);
  border-left: 4px solid rgba(255, 255, 255, 0.3);
  animation: slideInMessage 0.3s ease-out;
}

.chat-message.own-message {
  background: rgba(78, 205, 196, 0.2);
  border-left-color: #4ecdc4;
}

.chat-message.message-legendary {
  background: rgba(255, 152, 0, 0.3);
  border-left-color: #ff9800;
  box-shadow: 0 0 15px rgba(255, 152, 0, 0.4);
}

.chat-message.message-achievement {
  background: rgba(255, 215, 0, 0.3);
  border-left-color: #ffd700;
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.4);
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  flex-wrap: wrap;
  gap: 8px;
}

.message-user {
  font-weight: bold;
  color: #fff;
  font-size: 0.95em;
}

.message-time {
  font-size: 0.75em;
  color: rgba(255, 255, 255, 0.6);
}

.message-content {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1em;
  line-height: 1.5;
  word-break: break-word;
}

.no-messages {
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  padding: 40px 20px;
  font-size: 1.1em;
}

.chat-input-container {
  display: flex;
  gap: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 12px;
  backdrop-filter: blur(10px);
}

.chat-input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1em;
  outline: none;
  transition: all 0.2s;
}

.chat-input:focus {
  border-color: #4ecdc4;
  box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.2);
}

.chat-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.chat-send-button {
  padding: 12px 24px;
  background: linear-gradient(135deg, #4ecdc4, #44a08d);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(78, 205, 196, 0.4);
  white-space: nowrap;
}

.chat-send-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(78, 205, 196, 0.5);
}

.chat-send-button:active:not(:disabled) {
  transform: translateY(0);
}

.chat-send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

@keyframes slideInMessage {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 聊天室頁面移動設備優化 */
@media (max-width: 768px) {
  .chat-page {
    padding: 15px 5px;
    padding-bottom: 90px;
    height: calc(100vh - 150px);
  }

  .chat-page-content h2 {
    font-size: 1.5em;
    margin-bottom: 15px;
  }

  .chat-messages-container {
    padding: 12px;
    gap: 10px;
    min-height: 200px;
    max-height: calc(100vh - 300px);
  }

  .chat-message {
    padding: 10px 12px;
  }

  .message-user {
    font-size: 0.9em;
  }

  .message-time {
    font-size: 0.7em;
  }

  .message-content {
    font-size: 0.95em;
  }

  .chat-input-container {
    padding: 10px;
    gap: 8px;
  }

  .chat-input {
    padding: 10px 14px;
    font-size: 0.95em;
  }

  .chat-send-button {
    padding: 10px 20px;
    font-size: 0.95em;
  }
}

/* 成就頁面樣式 */
.achievements-page {
  padding: 20px 10px;
  padding-bottom: 90px;
}

.achievements-page-content {
  width: 100%;
}

.achievements-page-content h2 {
  text-align: center;
  font-size: 2em;
  margin-bottom: 20px;
  color: #fff;
}

.achievement-summary {
  margin-bottom: 30px;
  padding: 0 10px;
}

.achievement-progress-bar {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 20px;
  backdrop-filter: blur(10px);
}

.progress-bar-bg {
  width: 100%;
  height: 30px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 15px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.3);
  margin-bottom: 10px;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4ecdc4, #44a08d);
  transition: width 0.5s ease;
  box-shadow: 0 0 10px rgba(78, 205, 196, 0.5);
}

.achievement-progress-text {
  text-align: center;
  font-size: 1.1em;
  font-weight: bold;
  color: #ffd700;
}

.achievements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 15px;
  padding: 0 10px;
}

.achievement-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  border-radius: 15px;
  padding: 15px;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  gap: 15px;
  transition: all 0.3s;
  position: relative;
  opacity: 0.6;
}

.achievement-card.unlocked {
  opacity: 1;
  border-color: #ffd700;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 193, 7, 0.1));
}

.achievement-icon {
  font-size: 3em;
  flex-shrink: 0;
  filter: grayscale(100%);
  transition: filter 0.3s;
}

.achievement-card.unlocked .achievement-icon {
  filter: grayscale(0%);
}

.achievement-info {
  flex: 1;
  min-width: 0;
}

.achievement-name {
  font-size: 1.2em;
  font-weight: bold;
  color: #fff;
  margin-bottom: 5px;
}

.achievement-description {
  font-size: 0.9em;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 10px;
}

.achievement-progress {
  margin-top: 8px;
}

.progress-bar-mini {
  width: 100%;
  height: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 5px;
}

.progress-fill-mini {
  height: 100%;
  background: linear-gradient(90deg, #4ecdc4, #44a08d);
  transition: width 0.3s ease;
}

.achievement-card.unlocked .progress-fill-mini {
  background: linear-gradient(90deg, #ffd700, #ffb347);
}

.progress-text-mini {
  font-size: 0.8em;
  color: rgba(255, 255, 255, 0.7);
  text-align: right;
}

.achievement-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  background: linear-gradient(135deg, #ffd700, #ffb347);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5em;
  font-weight: bold;
  color: #000;
  box-shadow: 0 2px 8px rgba(255, 215, 0, 0.5);
  flex-shrink: 0;
}

/* 移動設備成就頁面優化 */
@media (max-width: 768px) {
  .achievements-page {
    padding: 15px 5px;
    padding-bottom: 90px;
  }

  .achievements-page-content h2 {
    font-size: 1.5em;
    margin-bottom: 15px;
  }

  .achievement-summary {
    margin-bottom: 20px;
    padding: 0 5px;
  }

  .achievement-progress-bar {
    padding: 15px;
  }

  .progress-bar-bg {
    height: 25px;
  }

  .achievement-progress-text {
    font-size: 0.95em;
  }

  .achievements-grid {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 0 5px;
  }

  .achievement-card {
    padding: 12px;
    gap: 12px;
  }

  .achievement-icon {
    font-size: 2.5em;
  }

  .achievement-name {
    font-size: 1.1em;
  }

  .achievement-description {
    font-size: 0.85em;
  }

  .achievement-badge {
    width: 25px;
    height: 25px;
    font-size: 1.2em;
  }

  .rarity-batch-select {
    margin-top: 15px;
    padding-top: 12px;
  }

  .batch-select-title {
    font-size: 0.85em;
    margin-bottom: 10px;
  }

  .rarity-buttons {
    gap: 8px;
  }

  .rarity-select-btn {
    padding: 8px 12px;
    font-size: 0.85em;
    min-width: 80px;
    gap: 6px;
  }

  .rarity-btn-count {
    font-size: 0.8em;
    padding: 2px 6px;
  }
}
</style>

