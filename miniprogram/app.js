App({
  globalData: {
    userInfo: null,
    merchantInfo: null,
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
      traceUser: true
    })

    this._getSystemInfo()
    this._getMenuButtonInfo()
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
  }
})
