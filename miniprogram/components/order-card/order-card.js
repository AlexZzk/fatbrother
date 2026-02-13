const { ORDER_STATUS, ORDER_STATUS_TEXT, ORDER_STATUS_COLOR } = require('../../utils/constants')
const format = require('../../utils/format')

Component({
  properties: {
    order: {
      type: Object,
      value: {}
    }
  },

  observers: {
    'order': function(order) {
      if (!order || !order._id) return

      const status = order.status || ''
      const statusText = ORDER_STATUS_TEXT[status] || status
      const statusColor = ORDER_STATUS_COLOR[status] || '#999999'

      // Build product summary lines (max 2 items displayed)
      const items = order.items || []
      const summaryLines = items.slice(0, 2).map(item => {
        const specStr = (item.specs || []).map(s => s.selected).join('/')
        const name = specStr ? `${item.name}(${specStr})` : item.name
        return { name, quantity: item.quantity }
      })
      const totalCount = items.reduce((sum, i) => sum + i.quantity, 0)

      // Format time
      const createTime = order.created_at ? format.dateTime(order.created_at, 'datetime') : ''

      // Determine buttons based on status
      const buttons = this._getButtons(status, order.is_reviewed)

      this.setData({
        statusText,
        statusColor,
        summaryLines,
        totalCount,
        createTime,
        buttons,
        merchantName: order.merchant_name || '',
        actualPrice: order.actual_price || 0
      })
    }
  },

  data: {
    statusText: '',
    statusColor: '',
    summaryLines: [],
    totalCount: 0,
    createTime: '',
    buttons: [],
    merchantName: '',
    actualPrice: 0
  },

  methods: {
    _getButtons(status, isReviewed) {
      switch (status) {
        case ORDER_STATUS.PENDING_ACCEPT:
          return [
            { type: 'cancel', text: '取消订单', style: 'default' },
            { type: 'detail', text: '查看详情', style: 'primary' }
          ]
        case ORDER_STATUS.ACCEPTED:
          return [
            { type: 'detail', text: '查看详情', style: 'primary' }
          ]
        case ORDER_STATUS.READY:
          return [
            { type: 'confirm', text: '确认取餐', style: 'primary' },
            { type: 'detail', text: '查看详情', style: 'default' }
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
          return [
            { type: 'detail', text: '查看详情', style: 'default' }
          ]
      }
    },

    onCardTap() {
      this.triggerEvent('tap', { orderId: this.data.order._id })
    },

    onButtonTap(e) {
      const { type } = e.currentTarget.dataset
      this.triggerEvent('action', {
        type,
        orderId: this.data.order._id,
        order: this.data.order
      })
    }
  }
})
