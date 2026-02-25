const app = getApp()
const orderService = require('../../../services/order')
const format = require('../../../utils/format')
const { ORDER_STATUS, PAGE_SIZE } = require('../../../utils/constants')

/**
 * Robustly parse a timestamp from various formats cloud DB may return:
 * ISO string, Date object, number (ms), { $date: "..." }, or wx-server-sdk ServerDate.
 * Returns 0 if unparseable, so remaining time becomes 0 (safe fallback).
 */
function parseTimestamp(val) {
  if (!val) return 0
  if (val instanceof Date) return val.getTime()
  if (typeof val === 'number') return val
  if (typeof val === 'string') return new Date(val).getTime() || 0
  if (val.$date) return new Date(val.$date).getTime() || 0
  if (typeof val.toDate === 'function') return val.toDate().getTime()
  return new Date(String(val)).getTime() || 0
}

const TABS = [
  { key: ORDER_STATUS.PENDING_ACCEPT, label: '待接单' },
  { key: ORDER_STATUS.ACCEPTED, label: '制作中' },
  { key: ORDER_STATUS.READY, label: '待取餐' },
  { key: '', label: '全部' }
]

const REJECT_REASONS = ['材料不足', '太忙无法接单', '已打烊', '其他原因']
const AUTO_CANCEL_MS = 30 * 60 * 1000

Page({
  data: {
    tabs: TABS,
    activeTab: 0,
    orders: [],
    loading: true,
    loadingMore: false,
    hasMore: false,
    page: 1,
    counts: { pendingAccept: 0, accepted: 0, ready: 0 },
    showRejectModal: false,
    rejectOrderId: '',
    rejectReasons: REJECT_REASONS,
    selectedReason: -1,
    customReason: '',
    showNewOrderPopup: false,
    newOrderInfo: null,
    notifyEnabled: true
  },

  _pollTimer: null,
  _countdownTimer: null,
  _lastPendingCount: 0,

  onLoad() {},

  onShow() {
    this._loadOrders(true)
    this._startPolling()
    this._startCountdown()
  },

  onHide() {
    this._stopPolling()
    this._stopCountdown()
  },

  onUnload() {
    this._stopPolling()
    this._stopCountdown()
  },

  onPullDownRefresh() {
    this._loadOrders(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this._loadMore()
    }
  },

  _startPolling() {
    this._stopPolling()
    this._pollTimer = setInterval(() => {
      if (this.data.notifyEnabled) this._checkNewOrders()
    }, 10000)
  },

  _stopPolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null }
  },

  async _checkNewOrders() {
    try {
      const res = await orderService.getMerchantOrders({ status: ORDER_STATUS.PENDING_ACCEPT, page: 1, pageSize: 1 })
      const newCount = res.counts ? res.counts.pendingAccept : 0
      if (newCount > this._lastPendingCount && this._lastPendingCount >= 0) {
        const firstOrder = (res.list && res.list[0]) || null
        this._showNewOrderAlert(firstOrder)
      }
      this._lastPendingCount = newCount
      if (res.counts) this.setData({ counts: res.counts })
    } catch (err) { /* silent */ }
  },

  _showNewOrderAlert(order) {
    if (!order) return
    wx.vibrateLong()
    const items = (order.items || []).map(i => `${i.name}x${i.quantity}`).join(' ')
    this.setData({
      showNewOrderPopup: true,
      newOrderInfo: { summary: items, actualPrice: order.actual_price }
    })
    if (this.data.activeTab === 0) this._loadOrders(true)
  },

  onDismissPopup() { this.setData({ showNewOrderPopup: false }) },

  onViewNewOrder() {
    this.setData({ showNewOrderPopup: false, activeTab: 0 })
    this._loadOrders(true)
  },

  onToggleNotify() { this.setData({ notifyEnabled: !this.data.notifyEnabled }) },

  _startCountdown() {
    this._stopCountdown()
    this._countdownTimer = setInterval(() => this._updateCountdowns(), 1000)
  },

  _stopCountdown() {
    if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null }
  },

  _updateCountdowns() {
    const orders = this.data.orders
    if (!orders.length) return
    const now = Date.now()
    let changed = false
    const updated = orders.map(order => {
      if (order.status !== ORDER_STATUS.PENDING_ACCEPT) return order
      const createdAt = parseTimestamp(order.created_at)
      const remaining = Math.max(0, AUTO_CANCEL_MS - (now - createdAt))
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      const text = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      if (order._countdownText !== text) {
        changed = true
        return { ...order, _countdownText: text, _urgent: remaining < 10 * 60 * 1000 }
      }
      return order
    })
    if (changed) this.setData({ orders: updated })
  },

  onTabTap(e) {
    const { index } = e.currentTarget.dataset
    if (index === this.data.activeTab) return
    this.setData({ activeTab: index, orders: [], page: 1, loading: true })
    this._loadOrders(true)
  },

  async _loadOrders(reset = false) {
    const page = reset ? 1 : this.data.page
    const status = TABS[this.data.activeTab].key
    try {
      const res = await orderService.getMerchantOrders({ status, page, pageSize: PAGE_SIZE })
      const list = (res.list || []).map(order => {
        if (order.status === ORDER_STATUS.PENDING_ACCEPT) {
          const remaining = Math.max(0, AUTO_CANCEL_MS - (Date.now() - parseTimestamp(order.created_at)))
          const mins = Math.floor(remaining / 60000)
          const secs = Math.floor((remaining % 60000) / 1000)
          order._countdownText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
          order._urgent = remaining < 10 * 60 * 1000
        }
        order._itemSummary = (order.items || []).map(i => ({
          name: i.name, specStr: (i.specs || []).map(s => s.selected).join('/'), quantity: i.quantity
        }))
        order._createTime = order.created_at ? format.dateTime(order.created_at, 'time').substring(0, 5) : ''
        order._readyTime = order.ready_at ? format.dateTime(order.ready_at, 'time').substring(0, 5) : ''
        return order
      })
      if (res.counts) {
        this._lastPendingCount = res.counts.pendingAccept
        this.setData({ counts: res.counts })
      }
      this.setData({
        orders: reset ? list : this.data.orders.concat(list),
        hasMore: res.hasMore, page: page + 1, loading: false, loadingMore: false
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

  async onAccept(e) {
    const { id } = e.currentTarget.dataset
    wx.showLoading({ title: '接单中...' })
    try {
      await orderService.accept(id)
      wx.hideLoading()
      wx.showToast({ title: '已接单', icon: 'success' })
      this._loadOrders(true)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '接单失败', icon: 'none' })
    }
  },

  onShowReject(e) {
    this.setData({ showRejectModal: true, rejectOrderId: e.currentTarget.dataset.id, selectedReason: -1, customReason: '' })
  },

  onSelectReason(e) { this.setData({ selectedReason: e.currentTarget.dataset.index }) },
  onCustomReasonInput(e) { this.setData({ customReason: e.detail.value }) },
  onCancelReject() { this.setData({ showRejectModal: false }) },

  async onConfirmReject() {
    const { selectedReason, rejectReasons, customReason, rejectOrderId } = this.data
    if (selectedReason < 0) { wx.showToast({ title: '请选择拒单原因', icon: 'none' }); return }
    const reason = selectedReason === 3 ? customReason : rejectReasons[selectedReason]
    if (selectedReason === 3 && !customReason.trim()) { wx.showToast({ title: '请输入拒单原因', icon: 'none' }); return }
    this.setData({ showRejectModal: false })
    wx.showLoading({ title: '处理中...' })
    try {
      await orderService.reject(rejectOrderId, reason)
      wx.hideLoading()
      wx.showToast({ title: '已拒单', icon: 'success' })
      this._loadOrders(true)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '拒单失败', icon: 'none' })
    }
  },

  async onMarkReady(e) {
    const { id } = e.currentTarget.dataset
    wx.showLoading({ title: '处理中...' })
    try {
      await orderService.markReady(id)
      wx.hideLoading()
      wx.showToast({ title: '已出餐', icon: 'success' })
      this._loadOrders(true)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  },

  async onComplete(e) {
    const { id } = e.currentTarget.dataset
    wx.showLoading({ title: '处理中...' })
    try {
      await orderService.complete(id)
      wx.hideLoading()
      wx.showToast({ title: '订单完成', icon: 'success' })
      this._loadOrders(true)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }
})
