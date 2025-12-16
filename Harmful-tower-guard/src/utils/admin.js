// 管理員 Email 列表
// 請將管理員的 Google Email 加入此陣列
const ADMIN_EMAILS = [
  'admin@example.com', // 範例：請替換為實際的管理員 Email
  // 可以在這裡添加更多管理員 Email
]

/**
 * 檢查使用者是否為管理員
 * @param {string} email - 使用者的 Email
 * @returns {boolean} 是否為管理員
 */
export const isAdmin = (email) => {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

/**
 * 獲取使用者角色
 * @param {string} email - 使用者的 Email
 * @returns {'admin' | 'player'} 使用者角色
 */
export const getUserRole = (email) => {
  return isAdmin(email) ? 'admin' : 'player'
}

