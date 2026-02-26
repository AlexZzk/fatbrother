const app = getApp()
const merchantService = require('../../../services/merchant')
const format = require('../../../utils/format')
const location = require('../../../utils/location')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    merchantInfo: null,
    isOpen: false,
    todayStats: { orderCount: 0, revenue: '0.00', refund: '0.00' },
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
    this._loadTodayStats()
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

  async _loadTodayStats() {
    try {
      const data = await merchantService.getTodayStats()
      this.setData({
        todayStats: {
          orderCount: data.orderCount || 0,
          revenue: format.price(data.revenue || 0),
          refund: format.price(data.refund || 0)
        },
        pendingOrders: {
          pendingAccept: data.pendingAccept || 0,
          pendingReady: data.pendingReady || 0
        }
      })
    } catch (err) {
      // silent - keep defaults
    }
  },

  async onToggleStatus() {
    const newStatus = !this.data.isOpen

    if (newStatus) {
      // 开店：让商户在地图上确认店铺位置，chooseLocation 自带地址返回
      wx.showModal({
        title: '确认开始营业',
        content: '请在地图中确认您的店铺位置',
        confirmText: '去选位置',
        success: async (res) => {
          if (!res.confirm) return
          try {
            const loc = await location.chooseLocation()
            const locationName = loc.name || loc.address || ''
            await merchantService.toggleStatus(true, loc, locationName)
            await this._loadMerchantInfo()
            this.selectComponent('#toast').showToast({ message: '已开始营业', type: 'success' })
          } catch (err) {
            // 用户取消地图选点不弹错误
            if (err.errMsg && err.errMsg.includes('cancel')) return
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

  async onUpdateLocation() {
    try {
      const loc = await location.chooseLocation()
      const locationName = loc.name || loc.address || ''
      wx.showModal({
        title: '确认更新定位',
        content: `将店铺位置更新为：${locationName || '已选位置'}`,
        success: async (res) => {
          if (!res.confirm) return
          try {
            await merchantService.toggleStatus(true, loc, locationName)
            await this._loadMerchantInfo()
            this.selectComponent('#toast').showToast({ message: '定位已更新', type: 'success' })
          } catch (err) {
            this.selectComponent('#toast').showToast({ message: err.message || '更新失败', type: 'error' })
          }
        }
      })
    } catch (err) {
      // 用户取消地图选点，不处理
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
