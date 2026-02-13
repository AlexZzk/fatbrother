const app = getApp()

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
  },

  onApplyTap() {
    wx.navigateTo({ url: '/pages/merchant/apply/index' })
  },

  onCheckStatusTap() {
    wx.navigateTo({ url: '/pages/merchant/pending/index' })
  }
})
