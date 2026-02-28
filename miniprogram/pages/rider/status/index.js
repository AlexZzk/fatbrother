const riderService = require('../../../services/rider')
const { RIDER_STATUS_TEXT, RIDER_VEHICLE_TYPE } = require('../../../utils/constants')

const STATUS_DESC = {
  pending: '您的申请正在审核中，请耐心等待',
  active: '您已通过骑手认证，可以开始接单',
  suspended: '您的骑手账号已被暂停，请联系客服'
}

Page({
  data: {
    loading: true,
    riderInfo: null,
    statusText: '',
    statusDesc: '',
    vehicleTypeText: '',
    earningsYuan: '0.00'
  },

  onShow() {
    this._load()
  },

  async _load() {
    try {
      const res = await riderService.getRiderInfo()
      if (!res.hasApplied) {
        wx.redirectTo({ url: '/pages/rider/apply/index' })
        return
      }
      const riderInfo = res.riderInfo
      this.setData({
        loading: false,
        riderInfo,
        statusText: RIDER_STATUS_TEXT[riderInfo.status] || riderInfo.status,
        statusDesc: STATUS_DESC[riderInfo.status] || '',
        vehicleTypeText: RIDER_VEHICLE_TYPE[riderInfo.vehicle_type] || riderInfo.vehicle_type,
        earningsYuan: ((riderInfo.total_earnings_cents || 0) / 100).toFixed(2)
      })
    } catch (err) {
      this.setData({ loading: false })
      this.selectComponent('#toast').showToast({ message: '加载失败', type: 'error' })
    }
  },

  onReApply() {
    wx.navigateTo({ url: '/pages/rider/apply/index' })
  },

  async onToggleOnline() {
    const { riderInfo } = this.data
    if (!riderInfo || riderInfo.status !== 'active') return

    const newStatus = !riderInfo.is_online
    try {
      await riderService.updateOnlineStatus(newStatus)
      const app = getApp()
      if (app.globalData.riderInfo) app.globalData.riderInfo.is_online = newStatus
      this.setData({ 'riderInfo.is_online': newStatus })
      wx.showToast({
        title: newStatus ? '已切换为在线' : '已切换为离线',
        icon: 'success'
      })
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: err.message || '操作失败', type: 'error' })
    }
  },

  onGoOrders() {
    wx.navigateTo({ url: '/pages/rider/orders/index' })
  }
})
