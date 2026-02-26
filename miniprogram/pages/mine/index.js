const app = getApp()
const userService = require('../../services/user')
const merchantService = require('../../services/merchant')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    isLoggedIn: false,
    userInfo: null,
    merchantInfo: null,
    showLoginPopup: false,
    loginLoading: false
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
  },

  onShow() {
    this._refreshUserState()
  },

  /**
   * 刷新用户状态
   */
  async _refreshUserState() {
    const isLoggedIn = app.globalData.isLoggedIn
    // 先从 globalData 同步（快速路径，避免闪烁）
    this.setData({
      isLoggedIn,
      userInfo: app.globalData.userInfo,
      merchantInfo: app.globalData.merchantInfo
    })

    if (!isLoggedIn) return

    // 从服务端刷新商户状态（捕获状态变更，如 pending → active）
    try {
      const data = await merchantService.getApplyStatus()
      const merchantInfo = data.hasApplied ? data.merchantInfo : null
      app.globalData.merchantInfo = merchantInfo
      if (merchantInfo) {
        wx.setStorageSync('merchantInfo', merchantInfo)
      } else {
        wx.removeStorageSync('merchantInfo')
      }
      this.setData({ merchantInfo })
    } catch (err) {
      console.error('[mine] _refreshUserState getApplyStatus failed:', err)
    }
  },

  /**
   * 点击用户头像区域
   */
  onUserInfoTap() {
    if (this.data.isLoggedIn) {
      wx.navigateTo({ url: '/pages/profile/index' })
    } else {
      this.setData({ showLoginPopup: true })
    }
  },

  /**
   * 确认登录
   */
  async onConfirmLogin() {
    if (this.data.loginLoading) return
    this.setData({ loginLoading: true })
    try {
      await app.login()
      this.setData({ showLoginPopup: false })
      this._refreshUserState()
      this.selectComponent('#toast').showToast({
        message: '登录成功',
        type: 'success'
      })
    } catch (err) {
      this.selectComponent('#toast').showToast({
        message: '登录失败，请重试',
        type: 'error'
      })
    } finally {
      this.setData({ loginLoading: false })
    }
  },

  /**
   * 取消登录
   */
  onCancelLogin() {
    this.setData({ showLoginPopup: false })
  },

  /**
   * 关闭弹窗（点击遮罩）
   */
  onMaskTap() {
    this.setData({ showLoginPopup: false })
  },

  /**
   * 阻止弹窗内容区冒泡
   */
  preventTap() {},

  /**
   * 导航到我的订单
   */
  onOrdersTap() {
    wx.switchTab({ url: '/pages/order-list/index' })
  },

  /**
   * 导航到优惠券/红包
   */
  onCouponsTap() {
    if (!this.data.isLoggedIn) {
      this.setData({ showLoginPopup: true })
      return
    }
    wx.navigateTo({ url: '/pages/user-coupons/index' })
  },

  /**
   * 导航到账单统计
   */
  onBillTap() {
    this.selectComponent('#toast').showToast({
      message: '该功能即将上线',
      type: 'info'
    })
  },

  /**
   * 收货地址（暂未开放）
   */
  onAddressTap() {
    this.selectComponent('#toast').showToast({
      message: '该功能即将上线',
      type: 'info'
    })
  },

  /**
   * 商户管理入口
   */
  onMerchantTap() {
    if (!this.data.isLoggedIn) {
      this.setData({ showLoginPopup: true })
      return
    }
    const merchantInfo = this.data.merchantInfo
    if (merchantInfo) {
      if (merchantInfo.status === 'active') {
        wx.navigateTo({ url: '/pages/merchant/dashboard/index' })
      } else if (merchantInfo.status === 'pending') {
        wx.navigateTo({ url: '/pages/merchant/pending/index' })
      } else {
        wx.navigateTo({ url: '/pages/merchant/guide/index' })
      }
    } else {
      wx.navigateTo({ url: '/pages/merchant/guide/index' })
    }
  },

  /**
   * 退出登录
   */
  onLogoutTap() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          app.logout()
          this._refreshUserState()
        }
      }
    })
  },

  /**
   * 关于我们
   */
  onAboutTap() {
    this.selectComponent('#toast').showToast({
      message: '胖兄弟外卖 v1.0.0',
      type: 'info'
    })
  }
})
