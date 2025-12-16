# 🚀 快速部署指南

## 步驟 1：設置環境變量

### 獲取 Firebase 配置

1. 前往：https://console.firebase.google.com/project/tree-game-fc972/settings/general
2. 滾動到「你的應用程式」部分
3. 如果還沒有 Web 應用程式，點擊「新增應用程式」→「</>」
4. 複製配置信息

### 創建 .env 文件

在專案根目錄創建 `.env` 文件：

```env
VITE_FIREBASE_API_KEY=你的-api-key
VITE_FIREBASE_AUTH_DOMAIN=tree-game-fc972.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tree-game-fc972
VITE_FIREBASE_STORAGE_BUCKET=tree-game-fc972.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=你的-messaging-sender-id
VITE_FIREBASE_APP_ID=你的-app-id
```

**快速獲取配置信息**：
```bash
npm run get-config
```

## 步驟 2：構建專案

```bash
npm run build
```

## 步驟 3：部署

### 方法 A：一鍵部署（推薦）

```bash
npm run deploy
```

這會自動構建並部署到 Firebase Hosting。

### 方法 B：分步部署

```bash
# 1. 構建
npm run build

# 2. 部署
firebase deploy --only hosting
```

## 步驟 4：訪問你的網站

部署成功後，訪問：
- **主要網址**: https://tree-game-fc972.web.app
- **備用網址**: https://tree-game-fc972.firebaseapp.com

## 🔄 更新部署

當你需要更新網站時，只需運行：

```bash
npm run deploy
```

## ⚠️ 重要提醒

1. **確保 Firestore Rules 已設置**：參考 `FIRESTORE_RULES.md`
2. **確保武器數據已導入**：如果還沒導入，運行 `npm run init-weapons`
3. **不要提交 .env 文件**：已添加到 `.gitignore`

## 🐛 遇到問題？

查看 `DEPLOYMENT.md` 獲取詳細的故障排除指南。

