# 武器數據安全設置指南

## 概述

為了防止玩家通過修改客戶端代碼來篡改武器數據，我們已經將武器數據遷移到 Firestore，並實施了服務器端驗證。

## 設置步驟

### 1. 安裝依賴

```bash
npm install firebase-admin
```

### 2. 初始化武器數據到 Firestore

運行初始化腳本將武器數據導入 Firestore：

```bash
npm run init-weapons
```

或者直接運行：

```bash
node scripts/initWeapons.js
```

腳本會：
- 讀取 Firebase Admin SDK 金鑰文件
- 將所有 22 把武器的數據寫入 Firestore 的 `weapons` 集合
- 每個武器的文檔 ID 為其武器 ID（1, 2, 3...）

### 3. 更新 Firestore Security Rules

在 Firebase Console → Firestore Database → Rules 中，更新規則以保護武器數據：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 武器數據 - 所有人可讀，但不可寫
    match /weapons/{weaponId} {
      allow read: if true;
      allow write: if false; // 禁止直接寫入，只能通過管理員或腳本
    }
    
    // 其他規則...
  }
}
```

完整規則請參考 `FIRESTORE_RULES.md` 文件。

### 4. 驗證設置

1. 在 Firebase Console 中檢查 `weapons` 集合是否已創建
2. 確認所有 22 把武器都已成功導入
3. 測試遊戲是否能正常從 Firestore 加載武器數據

## 安全機制

### 服務器端驗證

1. **武器數據驗證**：
   - 攻擊時只發送武器 ID 和等級
   - 服務器端從 Firestore 獲取真實的武器數據
   - 根據武器數據和等級計算實際傷害

2. **傷害範圍驗證**：
   - 傷害值必須在 1-1000 之間
   - 超出範圍的攻擊會被拒絕

3. **武器存在性驗證**：
   - 如果武器 ID 不存在，攻擊會被拒絕
   - 防止使用不存在的武器

### 客戶端備用機制

如果 Firestore 加載失敗，客戶端會使用備用的武器數據（`fallbackWeaponDatabase`），但攻擊仍會通過服務器端驗證。

## 文件結構

- `scripts/initWeapons.js` - 初始化腳本
- `src/utils/weaponService.js` - 武器數據服務
- `src/utils/multiplayer.js` - 更新後的攻擊邏輯（使用武器 ID）
- `src/components/Game.vue` - 從 Firestore 加載武器數據

## 注意事項

1. **Firebase Admin SDK 金鑰**：
   - 確保 `tree-game-fc972-firebase-adminsdk-fbsvc-bf73fee52b.json` 文件安全
   - 不要將此文件提交到公開的 Git 倉庫
   - 建議添加到 `.gitignore`

2. **權限設置**：
   - 只有管理員可以修改武器數據
   - 普通玩家只能讀取武器數據

3. **數據一致性**：
   - 如果修改了武器數據，需要重新運行初始化腳本
   - 或者通過 Firebase Console 手動更新

## 故障排除

### 問題：初始化腳本失敗

**解決方案**：
- 檢查 Firebase Admin SDK 金鑰文件是否存在
- 確認金鑰文件的 JSON 格式正確
- 檢查 Firebase 項目 ID 是否匹配

### 問題：遊戲無法加載武器數據

**解決方案**：
- 檢查 Firestore 中是否存在 `weapons` 集合
- 確認 Firestore Security Rules 允許讀取
- 檢查瀏覽器控制台的錯誤信息

### 問題：攻擊被拒絕

**解決方案**：
- 檢查武器 ID 是否有效
- 確認傷害值在合理範圍內
- 查看服務器端日誌了解具體錯誤

## 後續優化建議

1. **使用 Cloud Functions**：
   - 將攻擊邏輯移到 Cloud Functions
   - 進一步加強安全驗證

2. **用戶背包驗證**：
   - 將用戶背包數據也存儲在 Firestore
   - 驗證用戶是否真的擁有該武器

3. **攻擊頻率限制**：
   - 實施攻擊頻率限制，防止刷攻擊

4. **日誌記錄**：
   - 記錄所有攻擊嘗試
   - 監控異常攻擊模式

