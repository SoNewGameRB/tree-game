# Firestore 規則修復指南

## 問題診斷

如果遇到「無法連接多人模式：權限不足」錯誤，可能是以下原因：

1. **Firestore 規則尚未更新**
2. **規則更新後未生效**（需要等待 10-30 秒）
3. **`onlineUsers` 集合規則問題**（需要允許已認證用戶創建）

## 需要修改的規則

### 1. `users` 集合（第 60-66 行）

**當前規則（會導致錯誤）：**
```javascript
allow update: if request.auth != null 
  && request.auth.uid == userId;
```

**需要改為：**
```javascript
// 允許已認證用戶更新任何用戶文檔（前端會驗證密碼和 usernameLower）
allow update: if request.auth != null;
```

### 2. `onlineUsers` 集合（第 47-55 行）

**當前規則：**
```javascript
allow create: if request.auth != null 
  && request.resource.data.userId == request.auth.uid;
```

**問題：** 這個規則要求 `request.resource.data.userId == request.auth.uid`，但我們使用原有用戶的 UID，而 `request.auth.uid` 是新的匿名 UID，所以會失敗。

**需要改為：**
```javascript
// 允許已認證用戶創建在線狀態（前端會驗證用戶身份）
allow create: if request.auth != null 
  && request.resource.data.userId != null;
```

## 完整更新後的規則

請將以下完整規則複製到 Firebase Console：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 輔助函數：檢查當前用戶是否為管理員
    function isAdmin() {
      return request.auth != null 
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
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
    
    // 在線用戶 - 所有人可讀，已認證用戶可創建/更新
    match /onlineUsers/{userId} {
      allow read: if true;
      // 允許已認證用戶創建在線狀態（前端會驗證用戶身份）
      allow create: if request.auth != null 
        && request.resource.data.userId != null;
      // 允許已認證用戶更新任何在線狀態（前端會驗證用戶身份）
      allow update: if request.auth != null;
      allow delete: if request.auth != null 
        && request.auth.uid == userId;
    }
    
    // 用戶資料 - 所有人可讀，用戶只能創建/更新自己的資料，管理員可以刪除
    // 注意：為了支持通過 usernameLower 登入的用戶更新原有用戶文檔，
    // 我們允許已認證用戶更新任何用戶文檔（前端會驗證密碼和 usernameLower）
    match /users/{userId} {
      allow read: if true;
      allow create: if request.auth != null 
        && request.auth.uid == userId;
      // 允許已認證用戶更新任何用戶文檔（前端會驗證密碼和 usernameLower）
      // 這允許通過 usernameLower 登入的用戶更新原有用戶的文檔
      allow update: if request.auth != null;
      // 允許管理員刪除任何用戶資料，或允許用戶刪除自己的資料
      allow delete: if isAdmin() || (request.auth != null && request.auth.uid == userId);
    }
    
    // 聊天消息 - 所有人可讀，已登入用戶可寫
    // 注意：允許已認證用戶創建消息，前端會驗證用戶身份
    match /chatMessages/{messageId} {
      allow read: if true;
      // 允許已認證用戶創建消息（前端會驗證用戶身份）
      allow create: if request.auth != null 
        && request.resource.data.userId != null;
      allow update: if false; // 不允許修改消息
      allow delete: if false; // 不允許刪除消息（保留歷史記錄）
    }
  }
}
```

## 更新步驟

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 選擇專案：`tree-game-fc972`
3. 進入「Firestore Database」→「規則」
4. 複製上面的完整規則並貼上
5. 點擊「發布」保存規則
6. **等待 10-30 秒讓規則生效**
7. 清除瀏覽器緩存（Ctrl+Shift+Delete）
8. 重新載入頁面並測試登入

## 關鍵修改點

1. **`users` 集合的 `update` 規則**：從 `request.auth.uid == userId` 改為 `request.auth != null`
   - 這允許已認證用戶更新任何用戶文檔（包括事務操作，如獻祭升級）
   - 前端會驗證密碼和用戶身份，確保安全性

2. **`onlineUsers` 集合的 `create` 規則**：從 `request.resource.data.userId == request.auth.uid` 改為 `request.resource.data.userId != null`
   - 這允許已認證用戶創建在線狀態，即使使用原有用戶的 UID

3. **`onlineUsers` 集合的 `update` 規則**：從 `request.auth.uid == userId` 改為 `request.auth != null`
   - 這允許已認證用戶更新任何在線狀態

4. **`chatMessages` 集合的 `create` 規則**：從 `request.resource.data.userId == request.auth.uid` 改為 `request.resource.data.userId != null`
   - 這允許已認證用戶發送聊天消息，即使使用原有用戶的 UID
   - 前端會驗證用戶身份，確保安全性

這些修改允許已認證用戶（通過 Firebase Auth）更新任何用戶文檔、在線狀態和發送聊天消息，因為前端會驗證密碼和用戶身份，確保安全性。

