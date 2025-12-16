# 名稱登入設置說明

## 功能說明

現在遊戲支持使用名稱直接登入/註冊，無需密碼：
- 首次輸入名稱會自動註冊
- 之後輸入相同名稱即可登入
- 所有用戶數據存儲在 Firestore 中

## Firebase 設置步驟

### 1. 啟用匿名認證

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 選擇你的專案
3. 進入「Authentication」（身份驗證）
4. 點擊「Sign-in method」（登入方式）標籤
5. 找到「Anonymous」（匿名）選項
6. 點擊啟用，然後保存

### 2. 設置 Firestore 安全規則

請參考 `FIRESTORE_RULES.md` 文件，確保添加了 `users` 集合的規則：

```javascript
// 用戶資料 - 所有人可讀，用戶只能創建/更新自己的資料
match /users/{userId} {
  allow read: if true;
  allow create: if request.auth != null 
    && request.auth.uid == userId;
  allow update: if request.auth != null 
    && request.auth.uid == userId;
  allow delete: if false; // 不允許刪除用戶資料
}
```

### 3. 創建 Firestore 索引

為了優化查詢性能，需要創建以下索引：

#### users 集合索引

1. **按名稱查詢索引**
   - 集合: `users`
   - 欄位: `displayName` (升序)
   - 用途: 查詢用戶名稱是否存在

Firebase 會在首次查詢時提示你創建索引，點擊鏈接即可自動創建。

或者手動創建：
1. 前往 Firestore Database
2. 點擊「索引」標籤
3. 點擊「創建索引」
4. 集合 ID: `users`
5. 欄位: `displayName` (升序)
6. 點擊「創建」

## 數據結構

### users 集合

每個用戶文檔的結構：

```javascript
{
  uid: "firebase-uid",           // Firebase 匿名認證 UID
  displayName: "玩家名稱",        // 用戶輸入的名稱
  email: null,                   // 匿名用戶沒有 email
  photoURL: null,                // 匿名用戶沒有頭像
  createdAt: Timestamp,          // 創建時間
  lastLogin: Timestamp,          // 最後登入時間
  lastUpdate: Timestamp,         // 最後更新時間
  totalDamage: 0,                // 總傷害
  totalGold: 0,                  // 總金錢
  inventory: [],                 // 背包（武器列表）
  achievements: [],              // 成就列表
  originalUserId: "uid"          // 原始用戶 ID（用於數據遷移）
}
```

## 使用方式

1. 玩家在登入頁面輸入名稱（2-20 字元）
2. 系統檢查名稱是否已存在
3. 如果不存在：創建新用戶並註冊
4. 如果存在：使用該名稱登入（繼承原有用戶數據）
5. 使用 Firebase 匿名認證作為基礎認證
6. 用戶數據存儲在 Firestore 的 `users` 集合中

## 注意事項

- 名稱不能重複（系統會檢查）
- 名稱長度限制：2-20 字元
- 名稱只能包含中文、英文、數字和空格
- 每次登入會創建新的匿名 UID，但會繼承原有用戶的遊戲數據
- 用戶數據會自動同步到 Firestore

## 故障排除

### 問題：無法登入/註冊

1. 檢查 Firebase 配置是否正確（`.env` 文件）
2. 確認已啟用匿名認證
3. 檢查 Firestore 規則是否正確設置
4. 查看瀏覽器控制台的錯誤訊息

### 問題：名稱已存在但無法登入

1. 檢查 Firestore 索引是否已創建
2. 確認 `users` 集合的規則允許讀取
3. 檢查網絡連接是否正常

### 問題：數據沒有保存

1. 確認 Firestore 規則允許用戶更新自己的數據
2. 檢查用戶是否已正確認證
3. 查看 Firestore 控制台是否有錯誤

