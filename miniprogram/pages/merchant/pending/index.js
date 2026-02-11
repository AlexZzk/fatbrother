const app = getApp()
const merchantService = require('../../../services/merchant')
const format = require('../../../utils/format')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    merchantInfo: null,
    loading: true
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
    this._loadStatus()
  },

  async _loadStatus() {
    try {
      const data = await merchantService.getApplyStatus()
      if (data.hasApplied && data.merchantInfo) {
        const info = data.merchantInfo
        if (info.status === 'active') {
          wx.redirectTo({ url: '/pages/merchant/dashboard/index' })
          return
        }
        this.setData({
          merchantInfo: {
            ...info,
            created_at_text: format.dateTime(info.created_at, 'datetime')
          },
          loading: false
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (err) {
      this.setData({ loading: false })
    }
  }
})
