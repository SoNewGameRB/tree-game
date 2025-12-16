// 從 Firebase Console 獲取配置信息的輔助腳本
// 這個腳本會幫助你快速獲取 Firebase Web App 配置

console.log(`
╔══════════════════════════════════════════════════════════════╗
║          Firebase 配置信息獲取指南                           ║
╚══════════════════════════════════════════════════════════════╝

請按照以下步驟獲取 Firebase 配置信息：

1. 前往 Firebase Console:
   https://console.firebase.google.com/project/tree-game-fc972/settings/general

2. 滾動到「你的應用程式」部分

3. 如果還沒有 Web 應用程式：
   - 點擊「新增應用程式」按鈕
   - 選擇「</>」圖標（Web 應用程式）
   - 輸入應用程式暱稱（例如：tree-game-web）
   - 點擊「註冊應用程式」

4. 複製配置信息，格式如下：

   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "tree-game-fc972.firebaseapp.com",
     projectId: "tree-game-fc972",
     storageBucket: "tree-game-fc972.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };

5. 將這些值填入 .env 文件：

   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=tree-game-fc972.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=tree-game-fc972
   VITE_FIREBASE_STORAGE_BUCKET=tree-game-fc972.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

6. 保存 .env 文件並重新構建專案

═══════════════════════════════════════════════════════════════
`)

