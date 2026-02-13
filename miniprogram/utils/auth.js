/**
 * 登录态管理工具
 */
const app = getApp()

const auth = {
  /**
   * Check if user is logged in
   * @returns {boolean}
   */
  isLoggedIn() {
    return !!app.globalData.isLoggedIn
  },

  /**
   * Get current user's openid
   * @returns {string|null}
   */
  getOpenid() {
    return app.globalData.openid || null
  },

  /**
   * Get current user info
   * @returns {Object|null}
   */
  getUserInfo() {
    return app.globalData.userInfo || null
  },

  /**
   * Get current merchant info (if user is a merchant)
   * @returns {Object|null}
   */
  getMerchantInfo() {
    return app.globalData.merchantInfo || null
  },

  /**
   * Check if current user is a merchant
   * @returns {boolean}
   */
  isMerchant() {
    const info = app.globalData.merchantInfo
    return info && info.status === 'active'
  },

  /**
   * Login interception - check login state, redirect if needed
   * Used for actions that require login (ordering, etc.)
   * Browsing does NOT require login.
   * @returns {boolean} true if logged in, false if redirected
   */
  checkLoginAndRedirect() {
    if (this.isLoggedIn()) {
      return true
    }
    // Store current page for return after login
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    if (currentPage) {
      const url = `/${currentPage.route}`
      wx.setStorageSync('login_redirect', url)
    }
    // Trigger login popup or navigate to login
    // In WeChat Mini Program, login is typically a popup, not a separate page
    // The page component should listen for this event
    app.globalData.showLoginPopup = true
    return false
  },

  /**
   * Save login state after successful login
   * @param {Object} userInfo - User info from server
   * @param {string} openid - User's openid
   */
  setLoginState(userInfo, openid) {
    app.globalData.isLoggedIn = true
    app.globalData.userInfo = userInfo
    app.globalData.openid = openid
    // Persist to storage
    wx.setStorageSync('userInfo', userInfo)
    wx.setStorageSync('openid', openid)
  },

  /**
   * Clear login state (logout)
   */
  clearLoginState() {
    app.globalData.isLoggedIn = false
    app.globalData.userInfo = null
    app.globalData.openid = null
    app.globalData.merchantInfo = null
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('openid')
  },

  /**
   * Restore login state from storage (called on app launch)
   */
  restoreLoginState() {
    const userInfo = wx.getStorageSync('userInfo')
    const openid = wx.getStorageSync('openid')
    if (userInfo && openid) {
      app.globalData.isLoggedIn = true
      app.globalData.userInfo = userInfo
      app.globalData.openid = openid
    }
  }
}

module.exports = auth
