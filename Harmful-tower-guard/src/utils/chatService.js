import { 
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase/config'

// 聊天室集合名稱
const CHAT_COLLECTION = 'chatMessages'

// 發送聊天消息
export const sendChatMessage = async (userId, userName, message, type = 'normal') => {
  try {
    const chatRef = collection(db, CHAT_COLLECTION)
    await addDoc(chatRef, {
      userId: userId || 'unknown',
      userName: userName || '未知玩家',
      message: message || '',
      type: type || 'normal', // 'normal', 'legendary', 'achievement'
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp()
    })
  } catch (error) {
    console.error('發送聊天消息失敗:', error)
    throw error
  }
}

// 發送傳說武器公告
export const sendLegendaryAnnouncement = async (userId, userName, weaponName) => {
  const message = `🎉 ${userName} 抽到了傳說級武器：${weaponName}！`
  await sendChatMessage(userId, userName, message, 'legendary')
}

// 發送成就公告
export const sendAchievementAnnouncement = async (userId, userName, achievementName) => {
  const message = `🏆 ${userName} 完成了成就：${achievementName}！`
  await sendChatMessage(userId, userName, message, 'achievement')
}

// 獲取最近的聊天記錄
export const getRecentMessages = async (limitCount = 50) => {
  try {
    const chatRef = collection(db, CHAT_COLLECTION)
    const q = query(chatRef, orderBy('timestamp', 'desc'), limit(limitCount))
    const snapshot = await getDocs(q)
    
    return snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .reverse() // 反轉順序，最新的在最後
  } catch (error) {
    console.error('獲取聊天記錄失敗:', error)
    return []
  }
}

// 監聽聊天記錄（實時更新，優化：使用節流減少讀取頻率）
let lastChatTime = 0
const CHAT_THROTTLE = 2000 // 2秒內最多觸發一次

export const subscribeChatMessages = (callback, limitCount = 50) => {
  try {
    const chatRef = collection(db, CHAT_COLLECTION)
    const q = query(chatRef, orderBy('timestamp', 'desc'), limit(limitCount))
    
    return onSnapshot(q, (snapshot) => {
      const now = Date.now()
      // 節流：2秒內最多觸發一次
      if (now - lastChatTime < CHAT_THROTTLE) {
        return
      }
      lastChatTime = now
      
      const messages = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .reverse() // 反轉順序，最新的在最後
      callback(messages)
    })
  } catch (error) {
    console.error('監聽聊天記錄失敗:', error)
    return () => {} // 返回空函數作為取消訂閱
  }
}

// 本地聊天存儲（測試模式）
const LOCAL_CHAT_KEY = 'game_chat_messages'
const MAX_LOCAL_MESSAGES = 100

// 本地模式：發送消息
export const sendLocalChatMessage = (userId, userName, message, type = 'normal') => {
  try {
    const messages = getLocalMessages()
    const newMessage = {
      id: 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      userId: userId || 'unknown',
      userName: userName || '未知玩家',
      message: message || '',
      type: type || 'normal',
      timestamp: new Date(),
      createdAt: new Date()
    }
    
    messages.push(newMessage)
    
    // 只保留最近的消息
    if (messages.length > MAX_LOCAL_MESSAGES) {
      messages.shift()
    }
    
    localStorage.setItem(LOCAL_CHAT_KEY, JSON.stringify(messages))
    return newMessage
  } catch (error) {
    console.error('發送本地聊天消息失敗:', error)
  }
}

// 本地模式：獲取消息
export const getLocalMessages = () => {
  try {
    const stored = localStorage.getItem(LOCAL_CHAT_KEY)
    if (stored) {
      return JSON.parse(stored).map(msg => ({
        ...msg,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
      }))
    }
    return []
  } catch (error) {
    console.error('獲取本地聊天記錄失敗:', error)
    return []
  }
}

// 本地模式：發送傳說武器公告
export const sendLocalLegendaryAnnouncement = (userId, userName, weaponName) => {
  const message = `🎉 ${userName} 抽到了傳說級武器：${weaponName}！`
  return sendLocalChatMessage(userId, userName, message, 'legendary')
}

// 本地模式：發送成就公告
export const sendLocalAchievementAnnouncement = (userId, userName, achievementName) => {
  const message = `🏆 ${userName} 完成了成就：${achievementName}！`
  return sendLocalChatMessage(userId, userName, message, 'achievement')
}

