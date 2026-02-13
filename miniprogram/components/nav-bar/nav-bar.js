const app = getApp()

Component({
  options: {
    multipleSlots: true
  },

  properties: {
    title: { type: String, value: '' },
    leftArrow: { type: Boolean, value: true },
    rightText: { type: String, value: '' },
    rightColor: { type: String, value: '#1677FF' },
    titleColor: { type: String, value: '#222222' },
    bgColor: { type: String, value: '#FFFFFF' },
    placeholder: { type: Boolean, value: true }
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44
  },

  lifetimes: {
    attached() {
      this.setData({
        statusBarHeight: app.globalData.statusBarHeight,
        navBarHeight: app.globalData.navBarHeight
      })
    }
  },

  methods: {
    onBack() {
      this.triggerEvent('back')
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
    },

    onRight() {
      this.triggerEvent('right')
    }
  }
})
