# Firestore 安全規則設置

為了讓多人遊戲功能正常運作，你需要在 Firebase Console 中設置 Firestore 安全規則。

## 設置步驟

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 選擇你的專案
3. 進入「Firestore Database」
4. 點擊「規則」標籤
5. 將以下規則複製貼上：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 武器數據 - 所有人可讀，但不可寫（只能通過管理員或腳本）
    match /weapons/{weaponId} {
      allow read: if true;
      allow write: if false; // 禁止直接寫入，只能通過管理員或腳本
    }
    
    // 遊戲狀態 - 所有人可讀，但只有已登入用戶可寫
    match /gameState/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // 攻擊記錄 - 所有人可讀，已登入用戶可寫（需要驗證傷害範圍）
    match /attacks/{attackId} {
      allow read: if true;
      allow create: if request.auth != null 
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.damage >= 1 
        && request.resource.data.damage <= 1000; // 驗證傷害範圍
      allow update, delete: if false; // 只有系統可以刪除（通過 Cloud Functions）
    }
    
    // 在線用戶 - 所有人可讀，用戶只能更新自己的狀態
    match /onlineUsers/{userId} {
      allow read: if true;
      allow create: if request.auth != null 
        && request.resource.data.userId == request.auth.uid;
      allow update: if request.auth != null 
        && request.auth.uid == userId;
      allow delete: if request.auth != null 
        && request.auth.uid == userId;
    }
    
    // 用戶資料 - 所有人可讀，用戶只能創建/更新自己的資料
    match /users/{userId} {
      allow read: if true;
      allow create: if request.auth != null 
        && request.auth.uid == userId;
      allow update: if request.auth != null 
        && request.auth.uid == userId;
      allow delete: if false; // 不允許刪除用戶資料
    }
    
    // 聊天消息 - 所有人可讀，已登入用戶可寫
    match /chatMessages/{messageId} {
      allow read: if true;
      allow create: if request.auth != null 
        && request.resource.data.userId == request.auth.uid;
      allow update: if false; // 不允許修改消息
      allow delete: if false; // 不允許刪除消息（保留歷史記錄）
    }
  }
}
```

6. 點擊「發布」保存規則

## 規則說明

- **gameState**: 所有玩家可以讀取遊戲狀態（樹血量等），但只有已登入的用戶可以更新
- **attacks**: 所有玩家可以查看攻擊記錄，但只能創建自己的攻擊記錄
- **onlineUsers**: 所有玩家可以查看在線用戶列表，但只能更新自己的狀態

## 測試模式（開發階段）

如果你還在開發階段，可以使用以下測試規則（**不建議用於生產環境**）：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

⚠️ **警告**: 測試規則允許所有人讀寫所有數據，僅用於開發測試！

## 索引設置

為了優化查詢性能，建議創建以下索引：

1. **attacks 集合**
   - 欄位: `timestamp` (降序)
   - 用途: 查詢最近的攻擊記錄

2. **onlineUsers 集合**
   - 欄位: `isOnline` (升序)
   - 用途: 查詢在線用戶列表

3. **users 集合**
   - 欄位: `displayName` (升序)
   - 用途: 查詢用戶名稱是否存在

Firebase 會在首次查詢時提示你創建這些索引，點擊鏈接即可自動創建。

## 用戶資料集合

新增了 `users` 集合用於存儲用戶資料（名稱登入功能）：

- **users/{userId}**: 存儲用戶的基本信息和遊戲數據
- 所有玩家可以讀取（用於顯示在線玩家列表）
- 用戶只能創建/更新自己的資料
- 不允許刪除用戶資料（保護數據安全）

詳細設置請參考 `NAME_LOGIN_SETUP.md` 文件。

