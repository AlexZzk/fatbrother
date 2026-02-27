const userService = require('./services/user')

App({
  globalData: {
    userInfo: null,
    merchantInfo: null,
    riderInfo: null,
    openid: '',
    isLoggedIn: false,
    systemInfo: null,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuButtonInfo: null,
    location: null
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    wx.cloud.init({
      env: wx.cloud.DYNAMIC_CURRENT_ENV,
      traceUser: true
    })

    this._getSystemInfo()
    this._getMenuButtonInfo()
    this._restoreLoginState()
  },

  /**
   * 获取系统信息
   */
  _getSystemInfo() {
    try {
      const systemInfo = wx.getSystemInfoSync()
      this.globalData.systemInfo = systemInfo
      this.globalData.statusBarHeight = systemInfo.statusBarHeight || 20
    } catch (e) {
      console.error('获取系统信息失败', e)
      this.globalData.statusBarHeight = 20
    }
  },

  /**
   * 获取胶囊按钮位置信息（用于自定义导航栏）
   */
  _getMenuButtonInfo() {
    try {
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect()
      this.globalData.menuButtonInfo = menuButtonInfo
      // 导航栏高度 = 胶囊下边界 + 胶囊上边距 - 状态栏高度
      const navBarHeight = (menuButtonInfo.top - this.globalData.statusBarHeight) * 2 + menuButtonInfo.height
      this.globalData.navBarHeight = navBarHeight
    } catch (e) {
      console.error('获取胶囊按钮信息失败', e)
      this.globalData.navBarHeight = 44
    }
  },

  /**
   * 获取导航栏总高度（状态栏 + 导航栏）
   */
  getNavBarTotalHeight() {
    return this.globalData.statusBarHeight + this.globalData.navBarHeight
  },

  /**
   * 从本地缓存恢复登录态
   */
  _restoreLoginState() {
    const userInfo = wx.getStorageSync('userInfo')
    const openid = wx.getStorageSync('openid')
    if (userInfo && openid) {
      this.globalData.isLoggedIn = true
      this.globalData.userInfo = userInfo
      this.globalData.openid = openid
      const merchantInfo = wx.getStorageSync('merchantInfo')
      if (merchantInfo) {
        this.globalData.merchantInfo = merchantInfo
      }
    }
  },

  /**
   * 执行微信登录
   * @returns {Promise<Object>} { userInfo, merchantInfo, isNew }
   */
  async login() {
    try {
      const data = await userService.login()
      this.globalData.isLoggedIn = true
      this.globalData.userInfo = data.userInfo
      this.globalData.openid = data.userInfo._id
      this.globalData.merchantInfo = data.merchantInfo
      // 持久化
      wx.setStorageSync('userInfo', data.userInfo)
      wx.setStorageSync('openid', data.userInfo._id)
      if (data.merchantInfo) {
        wx.setStorageSync('merchantInfo', data.merchantInfo)
      } else {
        wx.removeStorageSync('merchantInfo')
      }
      return data
    } catch (err) {
      console.error('[app] login failed:', err)
      throw err
    }
  },

  /**
   * 退出登录
   */
  logout() {
    this.globalData.isLoggedIn = false
    this.globalData.userInfo = null
    this.globalData.openid = ''
    this.globalData.merchantInfo = null
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('openid')
    wx.removeStorageSync('merchantInfo')
  }
})
