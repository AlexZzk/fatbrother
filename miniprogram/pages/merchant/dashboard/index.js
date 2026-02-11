const app = getApp()
const merchantService = require('../../../services/merchant')
const location = require('../../../utils/location')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    merchantInfo: null,
    isOpen: false,
    todayStats: { orderCount: 0, revenue: 0, refund: 0 },
    pendingOrders: { pendingAccept: 0, pendingReady: 0 },
    loading: true
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
  },

  onShow() {
    this._loadMerchantInfo()
  },

  async _loadMerchantInfo() {
    try {
      const data = await merchantService.getMerchantInfo()
      const info = data.merchantInfo
      app.globalData.merchantInfo = info
      this.setData({
        merchantInfo: info,
        isOpen: info.is_open,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  async onToggleStatus() {
    const newStatus = !this.data.isOpen

    if (newStatus) {
      // 开店需要获取位置
      wx.showModal({
        title: '确认开始营业',
        content: '将获取当前位置作为店铺定位',
        success: async (res) => {
          if (!res.confirm) return
          try {
            const loc = await location.getLocation(false)
            await merchantService.toggleStatus(true, loc)
            this.setData({ isOpen: true })
            this.selectComponent('#toast').showToast({ message: '已开始营业', type: 'success' })
          } catch (err) {
            this.selectComponent('#toast').showToast({ message: err.message || '操作失败', type: 'error' })
          }
        }
      })
    } else {
      wx.showModal({
        title: '确认结束营业',
        content: '结束后顾客将无法看到您的店铺',
        success: async (res) => {
          if (!res.confirm) return
          try {
            await merchantService.toggleStatus(false)
            this.setData({ isOpen: false })
            this.selectComponent('#toast').showToast({ message: '已结束营业', type: 'success' })
          } catch (err) {
            this.selectComponent('#toast').showToast({ message: err.message || '操作失败', type: 'error' })
          }
        }
      })
    }
  },

  onBackToC() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onNavTo(e) {
    const page = e.currentTarget.dataset.page
    wx.navigateTo({ url: `/pages/merchant/${page}/index` })
  }
})
