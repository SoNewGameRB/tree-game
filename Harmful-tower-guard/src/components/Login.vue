<script setup>
import { ref, onMounted } from 'vue'
import { loginOrRegister, initUsersCollection } from '../utils/userService'

const emit = defineEmits(['login'])

const loading = ref(false)
const error = ref('')
const playerName = ref('')
const nameInput = ref(null)

// 初始化用戶資料表（可選，如果 Firebase 未設置會失敗但不影響測試模式）
onMounted(async () => {
  try {
    await initUsersCollection()
  } catch (err) {
    // Firebase 未設置時會失敗，但不影響測試模式
    console.log('Firebase 未設置，將使用測試模式')
  }
  // 聚焦到輸入框
  if (nameInput.value) {
    nameInput.value.focus()
  }
})

// 名稱登入/註冊
const loginWithName = async () => {
  const name = playerName.value.trim()
  
  // 驗證名稱
  if (!name) {
    error.value = '請輸入玩家名稱'
    return
  }
  
  if (name.length < 2) {
    error.value = '名稱至少需要 2 個字元'
    return
  }
  
  if (name.length > 20) {
    error.value = '名稱不能超過 20 個字元'
    return
  }
  
  // 檢查是否包含特殊字符（可選）
  const namePattern = /^[a-zA-Z0-9\u4e00-\u9fa5\s]+$/
  if (!namePattern.test(name)) {
    error.value = '名稱只能包含中文、英文、數字和空格'
    return
  }
  
  try {
    loading.value = true
    error.value = ''
    
    const user = await loginOrRegister(name)
    emit('login', user)
  } catch (err) {
    console.error('登入錯誤:', err)
    error.value = err.message || '登入失敗，請重試'
  } finally {
    loading.value = false
  }
}

// 處理 Enter 鍵
const handleKeyPress = (event) => {
  if (event.key === 'Enter' && !loading.value) {
    loginWithName()
  }
}

// 測試登入（無需 Firebase）
const loginAsTest = () => {
  const testName = playerName.value.trim() || '測試玩家'
  const testUser = {
    uid: 'test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    displayName: testName,
    email: null,
    photoURL: null,
    isTest: true,
    initialGold: 999999 // 測試帳號初始金錢
  }
  emit('login', testUser)
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
          <label for="player-name">玩家名稱</label>
          <input
            id="player-name"
            ref="nameInput"
            v-model="playerName"
            type="text"
            class="name-input"
            placeholder="請輸入你的名稱（2-20字元）"
            :disabled="loading"
            @keypress="handleKeyPress"
            maxlength="20"
          />
        </div>
        
        <button 
          class="login-button" 
          @click="loginWithName"
          :disabled="loading || !playerName.trim()"
        >
          <span v-if="loading" class="button-loading">
            <span class="spinner"></span>
            處理中...
          </span>
          <span v-else>開始遊戲</span>
        </button>

        <p v-if="error" class="error-message">{{ error }}</p>
      </div>
      
      <div class="login-info">
        <p>💡 提示：</p>
        <ul>
          <li>首次輸入名稱會自動註冊</li>
          <li>之後輸入相同名稱即可登入</li>
          <li>無需密碼，簡單方便</li>
        </ul>
      </div>
      
      <!-- 測試模式按鈕 -->
      <div class="test-section">
        <div class="divider">
          <span>或</span>
        </div>
        <button 
          class="test-login-button" 
          @click="loginAsTest"
          :disabled="loading"
        >
          🧪 測試模式（無需 Firebase）
        </button>
        <p class="test-info">點擊此按鈕可直接進入遊戲測試，無需設置 Firebase</p>
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

.test-section {
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

  .login-button {
    font-size: 1.1em;
    padding: 12px 20px;
  }

  .test-login-button {
    font-size: 0.95em;
    padding: 10px 18px;
  }

  .test-info {
    font-size: 0.75em;
  }
}
</style>

