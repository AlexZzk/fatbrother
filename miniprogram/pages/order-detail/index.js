const app = getApp()
const orderService = require('../../services/order')
const format = require('../../utils/format')
const { ORDER_STATUS, ORDER_STATUS_TEXT, ORDER_STATUS_COLOR } = require('../../utils/constants')

// Status card background & description
const STATUS_CONFIG = {
  [ORDER_STATUS.PENDING_PAY]: {
    bg: 'linear-gradient(135deg, #FFF8E1, #FFF3C4)',
    title: '待支付',
    desc: '请在30分钟内完成支付，超时订单将自动取消'
  },
  [ORDER_STATUS.PENDING_ACCEPT]: {
    bg: 'linear-gradient(135deg, #FFF3E0, #FFE0B2)',
    title: '商家确认中',
    desc: '您的订单已提交，等待商家接单'
  },
  [ORDER_STATUS.ACCEPTED]: {
    bg: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)',
    title: '制作中',
    desc: '商家已接单，正在准备您的餐品'
  },
  [ORDER_STATUS.READY]: {
    bg: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)',
    title: '待取餐',
    desc: '餐品已备好，请前往商家取餐'
  },
  [ORDER_STATUS.COMPLETED]: {
    bg: 'linear-gradient(135deg, #F5F5F5, #EEEEEE)',
    title: '已完成',
    desc: '订单已完成，感谢您的光临'
  },
  [ORDER_STATUS.CANCELLED]: {
    bg: 'linear-gradient(135deg, #FFEBEE, #FFCDD2)',
    title: '已取消',
    desc: '订单已取消'
  }
}

Page({
  data: {
    orderId: '',
    order: null,
    loading: true,
    // Computed display fields
    statusTitle: '',
    statusDesc: '',
    statusBg: '',
    statusColor: '',
    orderItems: [],
    createTimeStr: '',
    buttons: []
  },

  onLoad(options) {
    this.setData({ orderId: options.orderId || '' })
  },

  onShow() {
    if (this.data.orderId) {
      this._loadDetail()
    }
  },

  async _loadDetail() {
    try {
      const res = await orderService.getDetail(this.data.orderId)
      const order = res.order

      const config = STATUS_CONFIG[order.status] || { bg: '', title: order.status, desc: '' }
      const statusColor = ORDER_STATUS_COLOR[order.status] || '#999999'

      // Format items
      const orderItems = (order.items || []).map(item => ({
        ...item,
        specText: (item.specs || []).map(s => s.selected).join('/'),
        subtotal: item.unit_price * item.quantity
      }))

      const createTimeStr = order.created_at ? format.dateTime(order.created_at) : ''

      // Determine action buttons
      const buttons = this._getButtons(order.status, order.is_reviewed)

      this.setData({
        order,
        loading: false,
        statusTitle: config.title,
        statusDesc: config.desc,
        statusBg: config.bg,
        statusColor,
        orderItems,
        createTimeStr,
        buttons
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  _getButtons(status, isReviewed) {
    switch (status) {
      case ORDER_STATUS.PENDING_PAY:
        return [
          { type: 'pay', text: '立即支付', style: 'primary' },
          { type: 'cancel', text: '取消订单', style: 'default' }
        ]
      case ORDER_STATUS.PENDING_ACCEPT:
        return [
          { type: 'cancel', text: '取消订单', style: 'default' }
        ]
      case ORDER_STATUS.ACCEPTED:
        return []
      case ORDER_STATUS.READY:
        return [
          { type: 'confirm', text: '确认取餐', style: 'primary' }
        ]
      case ORDER_STATUS.COMPLETED:
        if (!isReviewed) {
          return [
            { type: 'review', text: '去评价', style: 'primary' },
            { type: 'reorder', text: '再来一单', style: 'default' }
          ]
        }
        return [
          { type: 'reorder', text: '再来一单', style: 'default' }
        ]
      case ORDER_STATUS.CANCELLED:
        return [
          { type: 'reorder', text: '再来一单', style: 'default' }
        ]
      default:
        return []
    }
  },

  onGoShop() {
    if (this.data.order && this.data.order.merchant_id) {
      wx.navigateTo({ url: `/pages/shop/index?id=${this.data.order.merchant_id}` })
    }
  },

  onCopyOrderNo() {
    if (this.data.order && this.data.order.order_no) {
      wx.setClipboardData({
        data: this.data.order.order_no,
        success: () => wx.showToast({ title: '已复制', icon: 'success' })
      })
    }
  },

  async onActionTap(e) {
    const { type } = e.currentTarget.dataset
    const { orderId, order } = this.data

    switch (type) {
      case 'pay':
        await this._retryPayment()
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
                this._loadDetail()
              } catch (err) {
                wx.showToast({ title: err.message || '取消失败', icon: 'none' })
              }
            }
          }
        })
        break

      case 'confirm':
        wx.showToast({ title: '确认取餐功能开发中', icon: 'none' })
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
  },

  async _retryPayment() {
    try {
      wx.showLoading({ title: '请稍候' })
      const res = await orderService.createPayment(this.data.orderId)
      wx.hideLoading()
      await this._requestPayment(res.payParams)
      // 支付成功，刷新详情（等待回调更新状态）
      wx.showToast({ title: '支付成功', icon: 'success' })
      setTimeout(() => this._loadDetail(), 1500)
    } catch (err) {
      wx.hideLoading()
      if (err.message !== '支付已取消') {
        wx.showToast({ title: err.message || '支付失败', icon: 'none' })
      }
      this._loadDetail()
    }
  },

  _requestPayment(payParams) {
    return new Promise((resolve, reject) => {
      wx.requestPayment({
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        package: payParams.package,
        signType: payParams.signType,
        paySign: payParams.paySign,
        success: () => resolve(),
        fail: (err) => {
          if (err.errMsg === 'requestPayment:fail cancel') {
            reject(new Error('支付已取消'))
          } else {
            reject(new Error('支付失败，请重试'))
          }
        }
      })
    })
  }
})
