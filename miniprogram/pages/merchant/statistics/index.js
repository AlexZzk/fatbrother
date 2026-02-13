const app = getApp()

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0
  },

  onLoad(options) {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
  }
})
