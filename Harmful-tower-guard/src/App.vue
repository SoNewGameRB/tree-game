<script setup>
import { ref, onMounted } from 'vue'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase/config'
import Login from './components/Login.vue'
import Game from './components/Game.vue'
import { getUserRole } from './utils/admin'

const user = ref(null)
const loading = ref(true)

// 監聽認證狀態變化
onMounted(() => {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      // 如果是匿名用戶，從 Firestore 獲取用戶資料
      if (firebaseUser.isAnonymous) {
        try {
          const { getUserData } = await import('./utils/userService')
          const userData = await getUserData(firebaseUser.uid)
          if (userData) {
            user.value = {
              uid: firebaseUser.uid,
              displayName: userData.displayName,
              email: userData.email || null,
              photoURL: userData.photoURL || null,
              isAnonymous: true
            }
          } else {
            user.value = firebaseUser
          }
        } catch (error) {
          console.error('獲取用戶資料失敗:', error)
          user.value = firebaseUser
        }
      } else {
        user.value = firebaseUser
      }
    } else {
      user.value = null
    }
    loading.value = false
  })
})

// 登出功能
const handleLogout = async () => {
  try {
    // 如果是測試用戶，直接清除狀態
    if (user.value && (user.value.isTest || (user.value.uid && user.value.uid.startsWith('test-')))) {
      user.value = null
      return
    }
    // Firebase 用戶需要調用 signOut
    await signOut(auth)
    user.value = null
  } catch (error) {
    console.error('登出錯誤:', error)
    // 即使 Firebase signOut 失敗，也清除用戶狀態（測試用）
    user.value = null
  }
}

// 處理登入
const handleLogin = async (loginUser) => {
  user.value = loginUser
  loading.value = false
  
  // 如果是匿名用戶，等待 Firebase 認證狀態更新
  // onAuthStateChanged 會自動處理
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
