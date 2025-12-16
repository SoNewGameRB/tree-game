# Firebase 設置說明

## 1. 創建 Firebase 專案

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 點擊「新增專案」
3. 輸入專案名稱
4. 按照指示完成專案創建

## 2. 啟用 Google 登入

1. 在 Firebase Console 中，進入「Authentication」（身份驗證）
2. 點擊「Sign-in method」（登入方式）
3. 啟用「Google」登入方式
4. 輸入支援的電子郵件（專案支援的網域）或保持預設
5. 儲存設定

## 3. 獲取 Firebase 配置資訊

1. 在 Firebase Console 中，進入「Project Settings」（專案設定）
2. 在「Your apps」區塊中，點擊 Web 圖示（</>）
3. 註冊應用程式（如果尚未註冊）
4. 複製 Firebase 配置物件中的值

## 4. 設置環境變數

在專案根目錄創建 `.env` 檔案（如果不存在），並填入以下內容：

```env
VITE_FIREBASE_API_KEY=你的-api-key
VITE_FIREBASE_AUTH_DOMAIN=你的專案.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=你的專案-id
VITE_FIREBASE_STORAGE_BUCKET=你的專案.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=你的-sender-id
VITE_FIREBASE_APP_ID=你的-app-id
```

## 5. 設置管理員 Email

編輯 `src/utils/admin.js` 檔案，將管理員的 Google Email 加入到 `ADMIN_EMAILS` 陣列中：

```javascript
const ADMIN_EMAILS = [
  'admin@example.com', // 替換為實際的管理員 Email
  // 可以添加更多管理員 Email
]
```

## 6. 測試

1. 執行 `npm run dev`
2. 點擊「使用 Google 登入」
3. 使用你的 Google 帳號登入
4. 如果 Email 在管理員列表中，會顯示「👑 管理員」標籤
5. 否則會顯示「🎮 玩家」標籤

## 注意事項

- `.env` 檔案不應提交到版本控制系統（已在 .gitignore 中）
- 確保 Firebase 專案的 Authentication 已正確設置
- 管理員 Email 列表區分大小寫，但程式碼中會轉換為小寫比較

