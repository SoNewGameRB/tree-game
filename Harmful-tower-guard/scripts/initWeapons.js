// 初始化武器數據到 Firestore
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

// 武器數據庫
const weaponDatabase = [
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
  { id: 21, name: '可疑斧', icon: '😳', rarity: 'LEGENDARY', attack: 90, attackInterval: 620, goldChance: 0.89, goldMin: 67, goldMax: 112, description: '有點可疑但超強，真的假的' },
  { id: 22, name: '認真斧', icon: '🎯', rarity: 'LEGENDARY', attack: 98, attackInterval: 590, goldChance: 0.91, goldMin: 73, goldMax: 125, description: '不騙你，真的強，認真的' }
]

async function initWeapons() {
  console.log('開始初始化武器數據到 Firestore...')
  
  try {
    for (const weapon of weaponDatabase) {
      const weaponRef = db.collection('weapons').doc(weapon.id.toString())
      await weaponRef.set(weapon)
      console.log(`✓ 已創建武器: ${weapon.name} (ID: ${weapon.id}, 稀有度: ${weapon.rarity})`)
    }
    
    console.log(`\n✅ 武器數據初始化完成！共 ${weaponDatabase.length} 把武器`)
    process.exit(0)
  } catch (error) {
    console.error('❌ 初始化失敗:', error)
    process.exit(1)
  }
}

initWeapons()

