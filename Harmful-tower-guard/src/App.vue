<script setup>
import { ref, onMounted } from 'vue'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase/config'
import Login from './components/Login.vue'
import Game from './components/Game.vue'
import { getUserRole } from './utils/admin'

const user = ref(null)
const loading = ref(true)

// localStorage 鍵名
const USER_STORAGE_KEY = 'game_user_session'

// 從 localStorage 恢復用戶狀態
const restoreUserFromStorage = async () => {
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY)
    if (stored) {
      const storedUser = JSON.parse(stored)
      // 驗證存儲的用戶數據是否有效
      if (storedUser && storedUser.uid && storedUser.displayName) {
        // 如果是 Firebase 用戶（非管理員），重新加載遊戲資料
        if (!storedUser.isAdmin && storedUser.uid) {
          try {
            const { getUserData } = await import('./utils/userService')
            const userData = await getUserData(storedUser.uid)
            if (userData) {
              storedUser.gameData = {
                gold: userData.gold || storedUser.initialGold || 500,
                inventory: userData.inventory || [],
                currentAxeIndex: userData.currentAxeIndex || null,
                totalDamage: userData.totalDamage || 0,
                totalGoldEarned: userData.totalGoldEarned || 0,
                totalDrawCount: userData.totalDrawCount || 0,
                totalSacrificeCount: userData.totalSacrificeCount || 0,
                legendaryCount: userData.legendaryCount || 0,
                epicCount: userData.epicCount || 0,
                maxWeaponLevel: userData.maxWeaponLevel || 0,
                treeDefeatedCount: userData.treeDefeatedCount || 0,
                achievements: userData.achievements || []
              }
              storedUser.initialGold = userData.gold || storedUser.initialGold || 500
            }
          } catch (error) {
            console.error('恢復用戶資料失敗:', error)
            // 如果恢復失敗，清除存儲的用戶狀態
            localStorage.removeItem(USER_STORAGE_KEY)
            return null
          }
        }
        return storedUser
      }
    }
  } catch (error) {
    console.error('從 localStorage 恢復用戶狀態失敗:', error)
    localStorage.removeItem(USER_STORAGE_KEY)
  }
  return null
}

// 保存用戶狀態到 localStorage
const saveUserToStorage = (userData) => {
  try {
    if (userData) {
      // 只保存必要的用戶信息，不保存 gameData（會從 Firestore 重新加載）
      const userToSave = {
        uid: userData.uid,
        displayName: userData.displayName,
        email: userData.email,
        photoURL: userData.photoURL,
        isAdmin: userData.isAdmin,
        originalUid: userData.originalUid,
        initialGold: userData.initialGold
      }
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userToSave))
    } else {
      localStorage.removeItem(USER_STORAGE_KEY)
    }
  } catch (error) {
    console.error('保存用戶狀態到 localStorage 失敗:', error)
  }
}

// 監聽認證狀態變化
onMounted(async () => {
  // 首先嘗試從 localStorage 恢復用戶狀態
  const restoredUser = await restoreUserFromStorage()
  if (restoredUser) {
    user.value = restoredUser
    loading.value = false
    console.log('從 localStorage 恢復用戶狀態:', restoredUser.uid)
    return
  }

  // 如果沒有存儲的用戶狀態，監聽 Firebase Auth 狀態
  onAuthStateChanged(auth, async (firebaseUser) => {
    // 重要：如果已經通過 handleLogin 設置了用戶，完全忽略 onAuthStateChanged
    // 因為 handleLogin 中的 UID 是原有用戶的 UID，而 firebaseUser.uid 是新的匿名 UID
    if (user.value && user.value.uid && user.value.originalUid) {
      // 已經通過 handleLogin 設置，保持原有用戶的 UID，完全忽略新的匿名認證
      console.log('已通過 handleLogin 設置用戶，忽略 onAuthStateChanged，保持 UID:', user.value.uid)
      loading.value = false
      return
    }
    
    // 如果已經有用戶但沒有 originalUid，檢查是否是原有用戶的 UID
    if (user.value && user.value.uid) {
      // 如果新的匿名 UID 與當前 UID 不同，保持當前 UID（應該是原有用戶的）
      if (firebaseUser && firebaseUser.isAnonymous && firebaseUser.uid !== user.value.uid) {
        console.log('保持原有用戶 UID:', user.value.uid, '忽略新的匿名 UID:', firebaseUser.uid)
        loading.value = false
        return
      }
      if (!firebaseUser) {
        // Firebase Auth 狀態被清除，但保持當前用戶狀態（不登出）
        console.log('Firebase Auth 狀態被清除，但保持用戶登入狀態')
        loading.value = false
        return
      }
    }
    
    // 只有在沒有已登入用戶時，才處理 Firebase Auth 狀態
    // 但由於我們現在不使用 signInAnonymously，這裡應該不會觸發
    if (firebaseUser && !user.value) {
      // 如果是匿名用戶，這不應該發生（因為我們不使用 signInAnonymously）
      // 但為了安全，還是處理一下
      if (firebaseUser.isAnonymous) {
        console.warn('檢測到匿名用戶，但我們應該通過 handleLogin 設置用戶')
        // 不處理匿名用戶，因為我們不使用它們
      } else {
        user.value = firebaseUser
      }
    } else if (!firebaseUser && !user.value) {
      // 只有在沒有用戶時才清除
      user.value = null
    }
    loading.value = false
  })
})

// 登出功能
const handleLogout = async () => {
  try {
    // 如果是管理員，直接清除狀態
    if (user.value && (user.value.isAdmin || (user.value.uid && (user.value.uid.startsWith('test-') || user.value.uid.startsWith('admin-'))))) {
      user.value = null
      saveUserToStorage(null) // 清除 localStorage
      return
    }
    // Firebase 用戶需要調用 signOut
    await signOut(auth)
    user.value = null
    saveUserToStorage(null) // 清除 localStorage
  } catch (error) {
    console.error('登出錯誤:', error)
    // 即使 Firebase signOut 失敗，也清除用戶狀態（測試用）
    user.value = null
    saveUserToStorage(null) // 清除 localStorage
  }
}

// 處理登入
const handleLogin = async (loginUser) => {
  // 重要：loginUser.uid 應該是原有用戶的 UID（從 loginUserWithName 返回的）
  // 不要被後續的 Firebase Auth 狀態覆蓋
  
  // 如果是 Firebase 用戶（非管理員），加載遊戲資料
  if (!loginUser.isAdmin && loginUser.uid) {
    try {
      const { getUserData } = await import('./utils/userService')
      const userData = await getUserData(loginUser.uid)
      if (userData) {
        // 將遊戲資料附加到用戶對象
        loginUser.gameData = {
          gold: userData.gold || loginUser.initialGold || 500,
          inventory: userData.inventory || [],
          currentAxeIndex: userData.currentAxeIndex || null,
          totalDamage: userData.totalDamage || 0,
          totalGoldEarned: userData.totalGoldEarned || 0,
          totalDrawCount: userData.totalDrawCount || 0,
          totalSacrificeCount: userData.totalSacrificeCount || 0,
          legendaryCount: userData.legendaryCount || 0,
          epicCount: userData.epicCount || 0,
          maxWeaponLevel: userData.maxWeaponLevel || 0,
          treeDefeatedCount: userData.treeDefeatedCount || 0,
          achievements: userData.achievements || []
        }
        loginUser.initialGold = userData.gold || loginUser.initialGold || 500
      }
    } catch (error) {
      console.error('加載用戶資料失敗:', error)
    }
  }
  
  // 保存原有用戶的 UID，防止被 onAuthStateChanged 覆蓋
  const originalUid = loginUser.uid
  loginUser.originalUid = originalUid // 保存原始 UID 作為備份
  
  user.value = loginUser
  loading.value = false
  
  // 保存用戶狀態到 localStorage，防止刷新頁面時丟失
  saveUserToStorage(loginUser)
  
  console.log('登入成功，使用 UID:', originalUid)
  
  // 注意：onAuthStateChanged 可能會在 signInAnonymously 後觸發
  // 但我們已經設置了 user.value，onAuthStateChanged 應該不會覆蓋它
}
</script>

<template>
  <div class="app-container">
    <!-- 登入畫面 -->
    <Login v-if="!user && !loading" @login="handleLogin" />
    
    <!-- 載入中 -->
    <div v-if="loading" class="loading-screen">
      <div class="loading-spinner"></div>
      <p>載入中...</p>
    </div>
    
    <!-- 遊戲畫面 -->
    <div v-if="user && !loading" class="game-wrapper">
      <div class="top-bar">
        <div class="user-info-bar">
          <div class="user-avatar-small">
            <img v-if="user.photoURL" :src="user.photoURL" :alt="user.displayName" />
            <div v-else class="avatar-placeholder-small">{{ user.displayName?.charAt(0) || 'U' }}</div>
          </div>
          <div class="user-info-text">
            <div class="user-name-small">{{ user.displayName || user.email }}</div>
            <div class="user-role-small" :class="'role-' + getUserRole(user.email)">
              {{ getUserRole(user.email) === 'admin' ? '👑 管理員' : '🎮 玩家' }}
            </div>
          </div>
        </div>
        <button class="logout-button" @click="handleLogout">
          登出
        </button>
      </div>
      <Game :user="user" />
    </div>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
}

.loading-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 5px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.game-wrapper {
  min-height: 100vh;
}

.top-bar {
  background: rgba(0, 0, 0, 0.3);
  padding: 12px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-wrap: wrap;
  gap: 8px;
}

.user-info-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar-small {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.user-avatar-small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder-small {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2em;
  font-weight: bold;
  color: white;
}

.user-info-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-name-small {
  font-weight: bold;
  color: white;
  font-size: 0.95em;
}

.user-role-small {
  font-size: 0.75em;
  padding: 2px 8px;
  border-radius: 10px;
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

.logout-button {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.85em;
  touch-action: manipulation;
  min-height: 36px;
  white-space: nowrap;
}

.logout-button:active {
  transform: scale(0.95);
  background: rgba(255, 255, 255, 0.3);
}

@media (max-width: 768px) {
  .top-bar {
    padding: 10px 12px;
  }

  .user-avatar-small {
    width: 36px;
    height: 36px;
  }

  .user-name-small {
    font-size: 0.85em;
  }

  .user-role-small {
    font-size: 0.7em;
    padding: 2px 6px;
  }
  
  .user-info-bar {
    flex: 1;
    min-width: 0;
  }

  .logout-button {
    font-size: 0.8em;
    padding: 7px 14px;
  }
}
</style>
