const orderService = require('../../../services/order')
const format = require('../../../utils/format')
const { ORDER_STATUS, ORDER_STATUS_TEXT } = require('../../../utils/constants')

Page({
  data: {
    activeTab: 0,
    isOnline: false,
    // 抢单大厅
    dispatchingOrders: [],
    loading: true,
    // 我的配送
    myOrders: [],
    myLoading: false
  },

  _pollTimer: null,

  onLoad() {},

  onShow() {
    this._checkOnlineStatus()
    this._loadTab()
    this._startPolling()
  },

  onHide() {
    this._stopPolling()
  },

  onUnload() {
    this._stopPolling()
  },

  onPullDownRefresh() {
    this._loadTab().then(() => wx.stopPullDownRefresh())
  },

  _startPolling() {
    this._stopPolling()
    // 每15秒刷新抢单大厅
    this._pollTimer = setInterval(() => {
      if (this.data.activeTab === 0) this._loadDispatching()
    }, 15000)
  },

  _stopPolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null }
  },

  async _checkOnlineStatus() {
    const app = getApp()
    const riderInfo = app.globalData.riderInfo
    if (riderInfo) {
      this.setData({ isOnline: !!riderInfo.is_online })
      return
    }
    // Fallback: check via rider service
    try {
      const riderService = require('../../../services/rider')
      const res = await riderService.getRiderInfo()
      if (res.riderInfo) {
        app.globalData.riderInfo = res.riderInfo
        this.setData({ isOnline: !!res.riderInfo.is_online })
      }
    } catch (e) { /* silent */ }
  },

  onTabTap(e) {
    const { index } = e.currentTarget.dataset
    if (index === this.data.activeTab) return
    this.setData({ activeTab: index })
    this._loadTab()
  },

  _loadTab() {
    if (this.data.activeTab === 0) {
      return this._loadDispatching()
    } else {
      return this._loadMyOrders()
    }
  },

  async _loadDispatching() {
    this.setData({ loading: true })
    try {
      const res = await orderService.getDispatchingOrders({ page: 1, pageSize: 20 })
      const list = (res.list || []).map(order => ({
        ...order,
        _itemSummary: (order.items || []).map(i => `${i.name}x${i.quantity}`).join(' / '),
        _createTime: order.dispatching_at ? format.dateTime(order.dispatching_at) : ''
      }))
      this.setData({ dispatchingOrders: list, loading: false })
    } catch (err) {
      this.setData({ loading: false })
      if (err && err.message) {
        wx.showToast({ title: err.message, icon: 'none' })
      }
    }
  },

  async _loadMyOrders() {
    this.setData({ myLoading: true })
    try {
      // 查询骑手已接或已完成的配送订单
      const res = await orderService.getList({
        status: [ORDER_STATUS.DELIVERING, ORDER_STATUS.COMPLETED],
        page: 1,
        pageSize: 30
      })
      const list = (res.list || [])
        .filter(o => o.delivery_type === 'delivery')
        .map(order => ({
          ...order,
          _statusText: ORDER_STATUS_TEXT[order.status] || order.status,
          _createTime: order.created_at ? format.dateTime(order.created_at) : ''
        }))
      this.setData({ myOrders: list, myLoading: false })
    } catch (err) {
      this.setData({ myLoading: false })
    }
  },

  async onAccept(e) {
    if (!this.data.isOnline) {
      wx.showToast({ title: '请先上线后再接单', icon: 'none' })
      return
    }
    const { id } = e.currentTarget.dataset
    wx.showLoading({ title: '接单中...' })
    try {
      await orderService.riderAccept(id)
      wx.hideLoading()
      wx.showToast({ title: '接单成功', icon: 'success' })
      this._loadDispatching()
      // 切换到我的配送 tab 查看
      this.setData({ activeTab: 1 })
      this._loadMyOrders()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '接单失败', icon: 'none' })
    }
  },

  onOrderTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/order-detail/index?orderId=${id}` })
  },

  onGoStatus() {
    wx.navigateTo({ url: '/pages/rider/status/index' })
  }
})
