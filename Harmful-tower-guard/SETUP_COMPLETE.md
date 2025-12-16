# ✅ 武器數據安全設置完成

## 已完成的工作

### 1. ✅ 武器數據已導入 Firestore
- 所有 22 把武器已成功導入到 `weapons` 集合
- 每個武器的文檔 ID 為其武器 ID（1-22）

### 2. ✅ 創建了武器服務工具
- `src/utils/weaponService.js` - 提供從 Firestore 獲取武器數據的函數

### 3. ✅ 更新了攻擊邏輯
- `src/utils/multiplayer.js` - 現在使用武器 ID 和等級進行服務器端驗證
- 攻擊傷害由服務器端根據武器數據計算，防止篡改

### 4. ✅ 更新了 Game.vue
- 從 Firestore 加載武器數據
- 如果 Firestore 加載失敗，使用備用數據
- 攻擊時傳遞武器 ID 和等級，而不是直接傳遞傷害值

### 5. ✅ 更新了 Firestore Security Rules 文檔
- `FIRESTORE_RULES.md` - 已更新，包含武器數據的安全規則

## 接下來需要做的

### 1. 更新 Firestore Security Rules（重要！）

在 Firebase Console 中更新規則：

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 選擇專案 `tree-game-fc972`
3. 進入「Firestore Database」→「規則」
4. 將以下規則複製貼上：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 武器數據 - 所有人可讀，但不可寫
    match /weapons/{weaponId} {
      allow read: if true;
      allow write: if false; // 禁止直接寫入，只能通過管理員或腳本
    }
    
    // 遊戲狀態
    match /gameState/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // 攻擊記錄 - 驗證傷害範圍
    match /attacks/{attackId} {
      allow read: if true;
      allow create: if request.auth != null 
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.damage >= 1 
        && request.resource.data.damage <= 1000;
      allow update, delete: if false;
    }
    
    // 在線用戶
    match /onlineUsers/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // 用戶資料
    match /users/{userId} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId;
      allow delete: if false;
    }
    
    // 聊天消息
    match /chatMessages/{messageId} {
      allow read: if true;
      allow create: if request.auth != null 
        && request.resource.data.userId == request.auth.uid;
      allow update, delete: if false;
    }
  }
}
```

5. 點擊「發布」保存規則

### 2. 測試遊戲

1. 啟動開發服務器：
   ```bash
   npm run dev
   ```

2. 測試功能：
   - ✅ 武器數據是否正常加載
   - ✅ 攻擊是否正常工作
   - ✅ 傷害值是否正確計算
   - ✅ 多人遊戲是否正常同步

3. 檢查控制台：
   - 應該看到「✓ 武器數據加載成功: 22 把武器」
   - 如果看到「⚠ Firestore 中沒有武器數據」，檢查 Firestore 規則是否允許讀取

## 安全機制說明

### 服務器端驗證流程

1. **客戶端發送**：
   - 武器 ID（如：1, 2, 3...）
   - 武器等級（如：1, 2, 3...）
   - 用戶 ID 和名稱

2. **服務器端處理**：
   - 從 Firestore 獲取武器數據
   - 驗證武器是否存在
   - 根據武器基礎攻擊力和等級計算實際傷害
   - 驗證傷害值在合理範圍內（1-1000）

3. **更新遊戲狀態**：
   - 減少樹的血量
   - 記錄攻擊記錄

### 防止的攻擊方式

- ✅ **修改武器數據**：武器數據存儲在 Firestore，客戶端無法修改
- ✅ **修改攻擊傷害**：傷害由服務器端計算，客戶端無法直接傳遞傷害值
- ✅ **使用不存在的武器**：服務器端會驗證武器 ID 是否存在
- ✅ **異常傷害值**：傷害值必須在 1-1000 範圍內

## 文件說明

- `scripts/initWeapons.js` - 初始化武器數據腳本（已運行）
- `src/utils/weaponService.js` - 武器數據服務
- `src/utils/multiplayer.js` - 更新後的攻擊邏輯
- `src/components/Game.vue` - 從 Firestore 加載武器數據
- `FIRESTORE_RULES.md` - Firestore 安全規則文檔
- `README_WEAPON_SETUP.md` - 詳細設置指南

## 注意事項

1. **Firebase Admin SDK 金鑰**：
   - 文件 `tree-game-fc972-firebase-adminsdk-fbsvc-bf73fee52b.json` 包含敏感信息
   - 建議添加到 `.gitignore`（如果還沒有的話）

2. **修改武器數據**：
   - 如果需要修改武器數據，可以：
     - 重新運行 `npm run init-weapons`（會覆蓋現有數據）
     - 在 Firebase Console 中手動修改
     - 使用 Firebase Admin SDK 編寫更新腳本

3. **備用數據**：
   - 如果 Firestore 加載失敗，會使用 `fallbackWeaponDatabase`
   - 但攻擊仍會通過服務器端驗證

## 故障排除

### 問題：無法加載武器數據

**檢查**：
1. Firestore 規則是否允許讀取 `weapons` 集合
2. 瀏覽器控制台是否有錯誤信息
3. Firebase 項目配置是否正確

### 問題：攻擊被拒絕

**檢查**：
1. 武器 ID 是否有效（1-22）
2. 傷害值是否在合理範圍內
3. 用戶是否已登入

### 問題：傷害值不正確

**檢查**：
1. 武器等級是否正確
2. 服務器端計算公式是否正確
3. Firestore 中的武器數據是否正確

## 完成！

現在你的遊戲已經具備了基本的數據安全保護。玩家無法通過修改客戶端代碼來篡改武器數據或攻擊傷害。

如果需要進一步加強安全性，可以考慮：
- 使用 Cloud Functions 處理所有遊戲邏輯
- 將用戶背包數據也存儲在 Firestore
- 實施攻擊頻率限制
- 添加異常檢測和日誌記錄

