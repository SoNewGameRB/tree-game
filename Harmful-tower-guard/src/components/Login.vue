<script setup>
import { ref, onMounted } from 'vue'
import { initUsersCollection, setUserAsAdminByName } from '../utils/userService'

const emit = defineEmits(['login'])

const loading = ref(false)
const error = ref('')
const playerName = ref('')
const password = ref('')
const nameInput = ref(null)
const passwordInput = ref(null)
const isRegisterMode = ref(false) // 註冊模式

// 管理員登入相關
const showAdminLogin = ref(false)
const adminPassword = ref('')
const adminPasswordInput = ref(null)

// 管理員密碼（可以從環境變量讀取，或使用簡單的哈希）
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123' // 默認密碼，建議在生產環境設置環境變量

// 從 localStorage 讀取上次登入的用戶名
const LAST_LOGIN_KEY = 'lastLoginUsername'

// 初始化用戶資料表（可選，如果 Firebase 未設置會失敗但不影響測試模式）
onMounted(async () => {
  try {
    await initUsersCollection()
  } catch (err) {
    // Firebase 未設置時會失敗，但不影響測試模式
    console.log('Firebase 未設置，將使用測試模式')
  }
  
  // 從 localStorage 讀取上次登入的用戶名
  const lastUsername = localStorage.getItem(LAST_LOGIN_KEY)
  if (lastUsername) {
    playerName.value = lastUsername
  }
  
  // 聚焦到輸入框
  if (nameInput.value) {
    nameInput.value.focus()
  }
})

// 聚焦到密碼輸入框
const focusPasswordInput = () => {
  if (passwordInput.value) {
    setTimeout(() => {
      passwordInput.value.focus()
    }, 100)
  }
}

// 驗證名稱格式
const validateName = (name) => {
  if (!name) {
    return '請輸入玩家名稱'
  }
  
  if (name.length < 2) {
    return '名稱至少需要 2 個字元'
  }
  
  if (name.length > 20) {
    return '名稱不能超過 20 個字元'
  }
  
  // 檢查是否包含特殊字符
  const namePattern = /^[a-zA-Z0-9\u4e00-\u9fa5\s]+$/
  if (!namePattern.test(name)) {
    return '名稱只能包含中文、英文、數字和空格'
  }
  
  return null
}

// 名稱登入（需要密碼，只驗證資料庫，不自動註冊）
const loginWithName = async () => {
  const name = playerName.value.trim()
  const pwd = password.value
  
  // 驗證名稱格式
  const validationError = validateName(name)
  if (validationError) {
    error.value = validationError
    return
  }
  
  // 驗證密碼
  if (!pwd) {
    error.value = '請輸入密碼'
    if (passwordInput.value) {
      passwordInput.value.focus()
    }
    return
  }
  
  try {
    loading.value = true
    error.value = ''
    
    // 直接使用 loginUserWithName，它會驗證帳號和密碼，不會自動註冊
    const { loginUserWithName } = await import('../utils/userService')
    const user = await loginUserWithName(name, pwd)
    
    console.log('✅ 登入函數返回的用戶 UID:', user.uid)
    console.log('   這個 UID 應該是原有用戶的 UID，不是新的匿名 UID')
    
    // 保存用戶名到 localStorage
    localStorage.setItem(LAST_LOGIN_KEY, name)
    
    emit('login', user)
  } catch (err) {
    console.error('登入錯誤:', err)
    error.value = err.message || '登入失敗，請重試'
  } finally {
    loading.value = false
  }
}

// 名稱註冊（需要密碼）
const registerWithName = async () => {
  const name = playerName.value.trim()
  const pwd = password.value
  
  // 驗證名稱格式
  const validationError = validateName(name)
  if (validationError) {
    error.value = validationError
    return
  }
  
  // 驗證密碼
  if (!pwd) {
    error.value = '請輸入密碼'
    if (passwordInput.value) {
      passwordInput.value.focus()
    }
    return
  }
  
  if (pwd.length < 4) {
    error.value = '密碼至少需要 4 個字元'
    if (passwordInput.value) {
      passwordInput.value.focus()
    }
    return
  }
  
  // 檢查名稱是否已存在（大小寫不敏感）
  try {
    const { checkNameExists, createUserWithName } = await import('../utils/userService')
    const nameExists = await checkNameExists(name)
    
    if (nameExists) {
      error.value = `帳號 "${name}" 已被使用（不區分大小寫），請選擇其他帳號或使用登入功能`
      return
    }
    
    // 名稱不存在，進行註冊
    loading.value = true
    error.value = ''
    
    const user = await createUserWithName(name, pwd)
    
    // 保存用戶名到 localStorage
    localStorage.setItem(LAST_LOGIN_KEY, name)
    
    emit('login', user)
  } catch (err) {
    console.error('註冊錯誤:', err)
    error.value = err.message || '註冊失敗，請重試'
  } finally {
    loading.value = false
  }
}

// 處理 Enter 鍵（名稱輸入框）
const handleNameKeyPress = (event) => {
  if (event.key === 'Enter' && !loading.value) {
    focusPasswordInput()
  }
}

// 處理 Enter 鍵（密碼輸入框）
const handlePasswordKeyPress = (event) => {
  if (event.key === 'Enter' && !loading.value) {
    if (isRegisterMode.value) {
      registerWithName()
    } else {
      loginWithName()
    }
  }
}

// 切換登入/註冊模式
const toggleMode = () => {
  isRegisterMode.value = !isRegisterMode.value
  error.value = '' // 清除錯誤訊息
  password.value = '' // 清除密碼
}

// 切換管理員登入模式
const toggleAdminLogin = () => {
  showAdminLogin.value = !showAdminLogin.value
  if (showAdminLogin.value && adminPasswordInput.value) {
    setTimeout(() => {
      adminPasswordInput.value.focus()
    }, 100)
  }
}

// 管理員登入（需要密碼）
const loginAsAdmin = async () => {
  const adminName = playerName.value.trim() || '系統管理員'
  const password = adminPassword.value.trim()
  
  if (!password) {
    error.value = '請輸入管理員密碼'
    return
  }
  
  // 驗證密碼
  if (password !== ADMIN_PASSWORD) {
    error.value = '管理員密碼錯誤'
    adminPassword.value = ''
    if (adminPasswordInput.value) {
      adminPasswordInput.value.focus()
    }
    return
  }
  
  try {
    loading.value = true
    error.value = ''
    
      // 如果管理員輸入了名稱，使用該名稱進行正常登入（這樣才能獲得 Firebase 認證）
      if (adminName && adminName !== '系統管理員') {
        // 管理員登入：使用管理員密碼作為用戶密碼
        // 先檢查用戶是否存在
        const { findUserByName, loginUserWithName, createUserWithName } = await import('../utils/userService')
        const existingUser = await findUserByName(adminName)
        
        let user
        if (existingUser) {
          // 用戶存在，嘗試使用管理員密碼登入
          // 如果密碼不匹配，管理員可以更新密碼為管理員密碼（特殊權限）
          try {
            user = await loginUserWithName(adminName, password)
          } catch (err) {
            // 如果密碼錯誤，管理員可以使用 Admin SDK 腳本重置密碼
            // 這裡先拋出錯誤提示
            throw new Error('帳號已存在但密碼不匹配。請使用正確的密碼登入，或使用管理腳本重置密碼。')
          }
        } else {
          // 用戶不存在，使用管理員密碼創建新用戶
          user = await createUserWithName(adminName, password)
        }
        
        // 設置為管理員（使用 Admin SDK 腳本或這裡設置）
        try {
          await setUserAsAdminByName(adminName, true)
        } catch (err) {
          console.warn('設置管理員權限失敗，將使用腳本設置:', err)
        }
        
        // 確保用戶標記為管理員
        user.isAdmin = true
        user.initialGold = 999999
      
      error.value = ''
      adminPassword.value = ''
      showAdminLogin.value = false
      emit('login', user)
    } else {
      // 如果沒有輸入名稱，使用舊的本地管理員對象（但無法通過 Firestore 規則）
      const adminUser = {
        uid: 'admin-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        displayName: adminName,
        email: 'admin@system.local',
        photoURL: null,
        isAdmin: true,
        isTest: false,
        initialGold: 999999
      }
      
      error.value = ''
      adminPassword.value = ''
      showAdminLogin.value = false
      emit('login', adminUser)
    }
  } catch (err) {
    console.error('管理員登入失敗:', err)
    error.value = err.message || '管理員登入失敗，請重試'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <h1 class="login-title">🌳 砍倒大樹</h1>
        <p class="login-subtitle">輸入你的名稱開始遊戲</p>
      </div>
      
      <div class="login-form">
        <div class="input-group">
          <label for="player-name">帳號</label>
          <input
            id="player-name"
            ref="nameInput"
            v-model="playerName"
            type="text"
            class="name-input"
            :placeholder="isRegisterMode ? '請輸入新帳號（2-20字元，不區分大小寫）' : '請輸入帳號（2-20字元，不區分大小寫）'"
            :disabled="loading"
            @keypress="handleNameKeyPress"
            maxlength="20"
          />
        </div>
        
        <div class="input-group">
          <label for="player-password">密碼</label>
          <input
            id="player-password"
            ref="passwordInput"
            v-model="password"
            type="password"
            class="name-input"
            :placeholder="isRegisterMode ? '請輸入密碼（至少4字元）' : '請輸入密碼'"
            :disabled="loading"
            @keypress="handlePasswordKeyPress"
          />
        </div>
        
        <div class="button-group">
          <button 
            v-if="!isRegisterMode"
            class="login-button" 
            @click="loginWithName"
            :disabled="loading || !playerName.trim() || !password.trim()"
          >
            <span v-if="loading" class="button-loading">
              <span class="spinner"></span>
              登入中...
            </span>
            <span v-else>登入</span>
          </button>
          
          <button 
            v-else
            class="register-button" 
            @click="registerWithName"
            :disabled="loading || !playerName.trim() || !password.trim()"
          >
            <span v-if="loading" class="button-loading">
              <span class="spinner"></span>
              註冊中...
            </span>
            <span v-else>註冊</span>
          </button>
          
          <button 
            class="mode-toggle-button" 
            @click="toggleMode"
            :disabled="loading"
          >
            {{ isRegisterMode ? '已有帳號？點此登入' : '沒有帳號？點此註冊' }}
          </button>
        </div>

        <p v-if="error" class="error-message">{{ error }}</p>
      </div>
      
      <div class="login-info">
        <p>💡 提示：</p>
        <ul>
          <li v-if="!isRegisterMode">輸入帳號和密碼即可登入</li>
          <li v-else>輸入新帳號和密碼進行註冊（帳號不可重複）</li>
          <li>帳號不區分大小寫（例如：User 和 user 視為相同）</li>
          <li>系統會記住您上次登入的帳號</li>
          <li>密碼至少需要 4 個字元</li>
        </ul>
      </div>
      
      <!-- 管理員登入 -->
      <div class="admin-section">
        <div class="divider">
          <span>或</span>
        </div>
        <button 
          v-if="!showAdminLogin"
          class="admin-toggle-button" 
          @click="toggleAdminLogin"
          :disabled="loading"
        >
          👑 系統管理員登入
        </button>
        
        <div v-if="showAdminLogin" class="admin-login-form">
          <div class="input-group">
            <label for="admin-password">管理員密碼</label>
            <input
              id="admin-password"
              ref="adminPasswordInput"
              type="password"
              v-model="adminPassword"
              placeholder="輸入管理員密碼"
              @keypress="(e) => e.key === 'Enter' && loginAsAdmin()"
              :disabled="loading"
            />
          </div>
          <div class="admin-actions">
            <button 
              class="admin-login-button" 
              @click="loginAsAdmin"
              :disabled="loading || !adminPassword.trim()"
            >
              {{ loading ? '登入中...' : '確認登入' }}
            </button>
            <button 
              class="admin-cancel-button" 
              @click="toggleAdminLogin"
              :disabled="loading"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.login-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 50px 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 450px;
  width: 100%;
  text-align: center;
}

.login-header {
  margin-bottom: 40px;
}

.login-title {
  font-size: 2.5em;
  margin-bottom: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: bold;
}

.login-subtitle {
  color: #666;
  font-size: 1.1em;
}

.login-form {
  margin-bottom: 30px;
}

.input-group {
  margin-bottom: 20px;
  text-align: left;
}

.input-group label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
  font-size: 0.95em;
}

.name-input {
  width: 100%;
  padding: 15px 20px;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  font-size: 1.1em;
  transition: all 0.2s;
  box-sizing: border-box;
  background: #fff;
}

.name-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.name-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-button {
  width: 100%;
  padding: 15px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1.2em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
}

.login-button:active:not(:disabled) {
  transform: translateY(0);
}

.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.register-button {
  width: 100%;
  padding: 15px 20px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1.2em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.register-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 87, 108, 0.5);
}

.register-button:active:not(:disabled) {
  transform: translateY(0);
}

.register-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.mode-toggle-button {
  width: 100%;
  padding: 12px 20px;
  background: transparent;
  color: #667eea;
  border: 2px solid #667eea;
  border-radius: 12px;
  font-size: 0.95em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-toggle-button:hover:not(:disabled) {
  background: rgba(102, 126, 234, 0.1);
  transform: translateY(-1px);
}

.mode-toggle-button:active:not(:disabled) {
  transform: translateY(0);
}

.mode-toggle-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-loading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  color: #ea4335;
  margin-top: 15px;
  font-size: 0.9em;
  padding: 10px;
  background: rgba(234, 67, 53, 0.1);
  border-radius: 8px;
  border-left: 3px solid #ea4335;
}

.login-info {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
  font-size: 0.9em;
  color: #666;
  line-height: 1.8;
  text-align: left;
}

.login-info p {
  margin: 0 0 10px 0;
  font-weight: 500;
  color: #333;
}

.login-info ul {
  margin: 0;
  padding-left: 20px;
}

.login-info li {
  margin-bottom: 5px;
}

.admin-section {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 20px 0;
  color: #999;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #e0e0e0;
}

.divider span {
  padding: 0 15px;
  font-size: 0.9em;
}

.test-login-button {
  width: 100%;
  padding: 12px 20px;
  background: linear-gradient(135deg, #4ecdc4 0%, #44a08d 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(78, 205, 196, 0.4);
  margin-bottom: 10px;
}

.test-login-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(78, 205, 196, 0.5);
}

.test-login-button:active:not(:disabled) {
  transform: translateY(0);
}

.test-login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-info {
  font-size: 0.8em;
  color: #999;
  margin: 0;
  text-align: center;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .login-card {
    padding: 40px 30px;
  }

  .login-title {
    font-size: 2em;
  }

  .login-subtitle {
    font-size: 1em;
  }

  .name-input {
    font-size: 1em;
    padding: 12px 16px;
  }

  .login-button,
  .register-button {
    font-size: 1.1em;
    padding: 12px 20px;
  }

  .admin-toggle-button {
    font-size: 0.95em;
    padding: 10px 18px;
  }
}

.admin-toggle-button {
  width: 100%;
  padding: 12px 20px;
  background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(246, 211, 101, 0.4);
}

.admin-toggle-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(246, 211, 101, 0.5);
}

.admin-toggle-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-login-form {
  margin-top: 20px;
}

.admin-login-button {
  width: 100%;
  padding: 12px 20px;
  background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(246, 211, 101, 0.4);
  margin-bottom: 10px;
}

.admin-login-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(246, 211, 101, 0.5);
}

.admin-login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-cancel-button {
  width: 100%;
  padding: 12px 20px;
  background: transparent;
  color: #999;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  font-size: 0.95em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.admin-cancel-button:hover:not(:disabled) {
  background: #f5f5f5;
  border-color: #ccc;
}

.admin-cancel-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

@media (max-width: 768px) {
  .admin-login-form {
    padding: 15px;
  }

  .admin-actions {
    flex-direction: column;
  }

  .admin-login-button,
  .admin-cancel-button {
    width: 100%;
  }
}
</style>

