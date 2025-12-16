# 🚀 部署指南

本指南將幫助你將專案部署到 Firebase Hosting。

## 📋 前置準備

### 1. 獲取 Firebase 配置信息

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 選擇專案 `tree-game-fc972`
3. 進入「專案設定」→「一般」標籤
4. 滾動到「你的應用程式」部分
5. 如果還沒有 Web 應用程式，點擊「新增應用程式」→「</>」圖標
6. 複製配置信息

### 2. 設置環境變量

創建 `.env` 文件（基於 `.env.example`）：

```bash
# 複製範例文件
cp .env.example .env
```

編輯 `.env` 文件，填入你的 Firebase 配置：

```env
VITE_FIREBASE_API_KEY=你的-api-key
VITE_FIREBASE_AUTH_DOMAIN=tree-game-fc972.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tree-game-fc972
VITE_FIREBASE_STORAGE_BUCKET=tree-game-fc972.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=你的-messaging-sender-id
VITE_FIREBASE_APP_ID=你的-app-id
```

### 3. 確認 Firebase CLI 已登入

```bash
firebase login
```

如果已經登入，可以檢查：

```bash
firebase projects:list
```

## 🔨 構建專案

### 1. 安裝依賴（如果還沒安裝）

```bash
npm install
```

### 2. 構建生產版本

```bash
npm run build
```

這會創建 `dist` 目錄，包含所有優化後的靜態文件。

### 3. 本地預覽構建結果（可選）

```bash
npm run preview
```

在瀏覽器中打開 `http://localhost:4173` 檢查構建結果。

## 🚀 部署到 Firebase Hosting

### 方法 1：使用 Firebase CLI（推薦）

```bash
# 部署到 Firebase Hosting
firebase deploy --only hosting
```

### 方法 2：分步驟部署

```bash
# 1. 初始化 Firebase（如果還沒初始化）
firebase init hosting

# 2. 構建專案
npm run build

# 3. 部署
firebase deploy --only hosting
```

### 部署後

部署成功後，你會看到類似以下的輸出：

```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/tree-game-fc972/overview
Hosting URL: https://tree-game-fc972.web.app
```

你的網站現在可以通過以下 URL 訪問：
- **主要網址**: `https://tree-game-fc972.web.app`
- **備用網址**: `https://tree-game-fc972.firebaseapp.com`

## 🔄 更新部署

當你需要更新網站時：

```bash
# 1. 構建新版本
npm run build

# 2. 部署
firebase deploy --only hosting
```

## ⚙️ 部署配置說明

### firebase.json

- `public: "dist"` - 指定構建輸出的目錄
- `rewrites` - 所有路由都重定向到 `index.html`（支持 Vue Router）
- `headers` - 設置緩存策略，優化性能

### 構建優化

- 生產環境自動移除 `console.log`
- 代碼壓縮和混淆
- 資源文件緩存優化
- 代碼分割（Vue 和 Firebase 分離）

## 🔒 安全檢查清單

部署前請確認：

- [ ] `.env` 文件已創建並配置正確
- [ ] `.env` 已添加到 `.gitignore`（不要提交到 Git）
- [ ] Firebase Admin SDK 金鑰文件已添加到 `.gitignore`
- [ ] Firestore Security Rules 已正確設置
- [ ] 武器數據已成功導入 Firestore
- [ ] 測試模式已禁用或僅用於開發

## 🐛 常見問題

### 問題 1：構建失敗

**解決方案**：
```bash
# 清除緩存並重新安裝
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 問題 2：環境變量未生效

**解決方案**：
- 確認 `.env` 文件在專案根目錄
- 確認變量名稱以 `VITE_` 開頭
- 重新構建：`npm run build`

### 問題 3：部署後無法訪問

**解決方案**：
- 檢查 Firebase Hosting 是否已啟用
- 確認 `firebase.json` 配置正確
- 檢查 Firebase Console 中的 Hosting 狀態

### 問題 4：路由 404 錯誤

**解決方案**：
- 確認 `firebase.json` 中的 `rewrites` 配置正確
- 所有路由都應重定向到 `index.html`

## 📱 自定義域名（可選）

如果你想使用自己的域名：

1. 在 Firebase Console → Hosting → 添加自定義域名
2. 按照指示完成 DNS 配置
3. 等待 SSL 證書自動配置完成

## 🔍 性能優化建議

1. **啟用 CDN**：Firebase Hosting 自動使用 CDN
2. **啟用壓縮**：Firebase Hosting 自動啟用 gzip
3. **圖片優化**：使用 WebP 格式，適當壓縮
4. **代碼分割**：已配置，Vue 和 Firebase 分離加載

## 📊 監控和分析

### Firebase Analytics（可選）

在 `src/main.js` 中添加：

```javascript
import { getAnalytics } from 'firebase/analytics'
import app from './firebase/config'

if (import.meta.env.PROD) {
  getAnalytics(app)
}
```

## 🎉 完成！

你的遊戲現在已經上線了！訪問你的網站並測試所有功能。

如有問題，請檢查：
- Firebase Console 的日誌
- 瀏覽器控制台的錯誤信息
- Firestore Security Rules 是否正確

