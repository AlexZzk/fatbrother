const app = getApp()
const orderService = require('../../services/order')
const { ORDER_STATUS, PAGE_SIZE } = require('../../utils/constants')

// 配送中包含两个状态，用数组表示多状态查询
const TABS = [
  { key: '', label: '全部' },
  { key: ORDER_STATUS.PENDING_PAY, label: '待支付' },
  { key: ORDER_STATUS.PENDING_ACCEPT, label: '待接单' },
  { key: ORDER_STATUS.ACCEPTED, label: '制作中' },
  { key: ORDER_STATUS.READY, label: '待取餐' },
  { key: 'DELIVERING_GROUP', label: '配送中' },
  { key: ORDER_STATUS.COMPLETED, label: '已完成' }
]

Page({
  data: {
    tabs: TABS,
    activeTab: 0,
    orders: [],
    loading: true,
    loadingMore: false,
    hasMore: false,
    page: 1
  },

  onLoad() {},

  onShow() {
    this._loadOrders(true)
  },

  onPullDownRefresh() {
    this._loadOrders(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this._loadMore()
    }
  },

  onTabTap(e) {
    const { index } = e.currentTarget.dataset
    if (index === this.data.activeTab) return
    this.setData({ activeTab: index, orders: [], page: 1, loading: true })
    this._loadOrders(true)
  },

  async _loadOrders(reset = false) {
    const page = reset ? 1 : this.data.page
    const tabKey = TABS[this.data.activeTab].key
    // 配送中分组：同时查询 DISPATCHING 和 DELIVERING
    const status = tabKey === 'DELIVERING_GROUP'
      ? [ORDER_STATUS.DISPATCHING, ORDER_STATUS.DELIVERING]
      : tabKey

    try {
      const res = await orderService.getList({ status, page, pageSize: PAGE_SIZE })
      const list = res.list || []

      this.setData({
        orders: reset ? list : this.data.orders.concat(list),
        hasMore: res.hasMore,
        page: page + 1,
        loading: false,
        loadingMore: false
      })
    } catch (err) {
      this.setData({ loading: false, loadingMore: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async _loadMore() {
    this.setData({ loadingMore: true })
    await this._loadOrders(false)
  },

  onOrderTap(e) {
    const { orderId } = e.detail
    wx.navigateTo({ url: `/pages/order-detail/index?orderId=${orderId}` })
  },

  async onOrderAction(e) {
    const { type, orderId, order } = e.detail

    switch (type) {
      case 'detail':
        wx.navigateTo({ url: `/pages/order-detail/index?orderId=${orderId}` })
        break

      case 'pay':
        wx.navigateTo({ url: `/pages/order-detail/index?orderId=${orderId}` })
        break

      case 'cancel':
        wx.showModal({
          title: '取消订单',
          content: '确定要取消此订单吗？',
          success: async (res) => {
            if (res.confirm) {
              try {
                await orderService.cancel(orderId)
                wx.showToast({ title: '已取消', icon: 'success' })
                this._loadOrders(true)
              } catch (err) {
                wx.showToast({ title: err.message || '取消失败', icon: 'none' })
              }
            }
          }
        })
        break

      case 'confirm':
        wx.showModal({
          title: '确认取餐',
          content: '请确认已取到餐品',
          confirmText: '已取到',
          success: async (res) => {
            if (res.confirm) {
              try {
                await orderService.userComplete(orderId)
                wx.showToast({ title: '取餐成功', icon: 'success' })
                this._loadOrders(true)
              } catch (err) {
                wx.showToast({ title: err.message || '操作失败', icon: 'none' })
              }
            }
          }
        })
        break

      case 'review':
        wx.navigateTo({ url: `/pages/review/index?orderId=${orderId}` })
        break

      case 'reorder':
        if (order && order.merchant_id) {
          wx.navigateTo({ url: `/pages/shop/index?id=${order.merchant_id}` })
        }
        break
    }
  }
})
