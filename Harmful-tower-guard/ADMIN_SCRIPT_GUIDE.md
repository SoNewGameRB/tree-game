# 管理員設置腳本使用指南

這個腳本使用 Firebase Admin SDK 來設置管理員權限，可以繞過 Firestore 規則限制。

## 快速開始

### 1. 查看所有用戶

```bash
npm run set-admin list
```

或者：

```bash
node scripts/setAdmin.js list
```

這會顯示所有用戶及其管理員狀態。

### 2. 通過用戶名稱設置管理員

```bash
npm run set-admin set-by-name <用戶名稱>
```

範例：

```bash
# 設置名稱為 "admin" 的用戶為管理員
npm run set-admin set-by-name admin

# 取消名稱為 "admin" 的用戶的管理員權限
npm run set-admin set-by-name admin false
```

### 3. 通過 UID 設置管理員

如果您知道用戶的 UID（可以從 Firebase Console 或 list 命令獲取）：

```bash
npm run set-admin set-by-uid <UID>
```

範例：

```bash
npm run set-admin set-by-uid abc123def456ghi789
```

### 4. 重置所有玩家的遊戲數據（保留用戶資料）

此命令會重置所有玩家的遊戲進度，但保留用戶基本信息：

```bash
npm run set-admin reset-game
```

**將清除：**
- 背包（inventory）
- 傷害記錄（totalDamage）
- 成就（achievements）
- 金錢（重置為 500）
- 其他遊戲進度

**將保留：**
- 用戶名稱
- Email
- 管理員狀態

### 5. 清除所有玩家資料（緊急情況使用）

⚠️ **警告：此操作無法復原！**

```bash
npm run set-admin clear-all
```

此命令會**完全刪除**所有用戶資料。

### 6. 重置所有數據，只保留武器和樹的資料

⚠️ **警告：此操作無法復原！**

```bash
npm run set-admin reset-all
```

**將保留：**
- ✅ 武器資料（`weapons` collection）
- ✅ 樹的資料（`gameState` collection）

**將清除：**
- ❌ 所有用戶資料（`users` collection）
- ❌ 所有攻擊記錄（`attacks` collection）
- ❌ 所有聊天消息（`chatMessages` collection）
- ❌ 所有在線用戶記錄（`onlineUsers` collection）

**適用場景：**
- 需要完全重置遊戲，但保留武器配置
- 清除所有玩家數據，但保留遊戲設定
- 測試環境重置

## 使用場景

### 場景 1：首次設置管理員

如果您還沒有管理員帳號，可以這樣做：

1. **先登入一次遊戲**（使用您想要的管理員名稱）
2. **然後運行腳本設置為管理員**：

```bash
# 假設您的用戶名稱是 "admin"
npm run set-admin set-by-name admin
```

3. **重新登入遊戲**，現在您就是管理員了！

### 場景 2：忘記管理員帳號

如果忘記了哪個帳號是管理員：

1. **查看所有用戶**：

```bash
npm run set-admin list
```

2. **找到您想要的帳號，設置為管理員**：

```bash
npm run set-admin set-by-name <您的用戶名稱>
```

### 場景 3：需要清除所有資料

如果資料庫出現問題，需要重置：

1. **清除所有玩家資料**：

```bash
npm run set-admin clear-all
```

2. **重新設置管理員**：

```bash
npm run set-admin set-by-name admin
```

## 常見問題

### Q: 為什麼找不到用戶？

**A:** 用戶必須先登入一次遊戲，才會在 Firestore 中創建用戶文檔。請先：
1. 使用該名稱登入遊戲
2. 然後再運行腳本設置管理員

### Q: 設置後還是無法清除資料？

**A:** 請確認：
1. 您已經設置為管理員（使用 `list` 命令檢查）
2. 您使用的是**名稱登入**（有 Firebase 認證），而不是密碼登入的假用戶
3. Firestore 規則已經更新並發布

### Q: 可以使用這個腳本做什麼？

**A:** 這個腳本使用 Firebase Admin SDK，可以：
- ✅ 設置任何用戶為管理員（繞過 Firestore 規則）
- ✅ 清除所有玩家資料（繞過 Firestore 規則）
- ✅ 查看所有用戶列表

但請注意：
- ❌ 這個腳本只能在**本地運行**（不能在前端使用）
- ❌ 需要 Firebase Admin SDK 金鑰文件

## 完整命令列表

```bash
# 查看使用說明
npm run set-admin

# 列出所有用戶
npm run set-admin list

# 通過名稱設置管理員
npm run set-admin set-by-name <用戶名稱>
npm run set-admin set-by-name <用戶名稱> false  # 取消管理員

# 通過 UID 設置管理員
npm run set-admin set-by-uid <UID>

# 重置所有玩家的遊戲數據（保留用戶資料）
npm run set-admin reset-game

# 清除所有玩家資料（危險操作）
npm run set-admin clear-all

# 重置所有數據，只保留武器和樹的資料（危險操作）
npm run set-admin reset-all
```

## 安全提示

1. **保護 Admin SDK 金鑰**：`tree-game-fc972-firebase-adminsdk-fbsvc-bf73fee52b.json` 文件包含服務帳號密鑰，請不要提交到公開的 Git 倉庫

2. **謹慎使用 clear-all 和 reset-all**：清除所有資料的操作無法復原，請確認後再執行

3. **reset-all vs clear-all vs reset-game**：
   - `reset-game`：只重置遊戲進度，保留用戶資料
   - `clear-all`：完全刪除所有用戶資料
   - `reset-all`：清除所有用戶相關數據，但保留武器和樹的資料

4. **僅在需要時使用**：雖然腳本可以繞過規則，但建議正常情況下還是通過正常的登入流程來設置管理員

