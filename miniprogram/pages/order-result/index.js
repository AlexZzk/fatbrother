const app = getApp()

Page({
  data: {
    orderId: '',
    orderNo: ''
  },

  onLoad(options) {
    this.setData({
      orderId: options.orderId || '',
      orderNo: options.orderNo || ''
    })
  },

  onViewDetail() {
    wx.redirectTo({
      url: `/pages/order-detail/index?orderId=${this.data.orderId}`
    })
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
