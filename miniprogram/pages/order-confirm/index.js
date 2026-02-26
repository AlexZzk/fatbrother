const app = getApp()
const cart = require('../../utils/cart')
const format = require('../../utils/format')
const orderService = require('../../services/order')
const merchantService = require('../../services/merchant')

/**
 * 【TODO_REPLACE: 订阅消息模板ID】
 * 替换为微信后台申请到的模板ID，用于下单前请求订阅消息授权。
 * 最多一次请求3个模板。
 */
const SUBSCRIBE_TEMPLATE_IDS = [
  'TEMPLATE_ID_ORDER_SUBMITTED',    // 订单提交通知
  'TEMPLATE_ID_MERCHANT_ACCEPTED',  // 商家接单通知
  'TEMPLATE_ID_FOOD_READY'          // 餐品出餐通知
]

Page({
  data: {
    merchantId: '',
    merchant: null,
    cartItems: [],
    totalPrice: 0,
    packingFee: 0,
    deliveryFee: 0,
    actualPrice: 0,
    remark: '',
    submitting: false
  },

  onLoad(options) {
    const { merchantId } = options
    if (!merchantId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.setData({ merchantId })
    this._loadData(merchantId)
  },

  async _loadData(merchantId) {
    const items = cart.getItems(merchantId)
    if (!items || items.length === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    try {
      const res = await merchantService.getMerchantInfo(merchantId)
      const merchant = res.merchantInfo

      const cartItems = items.map(item => ({
        ...item,
        specText: (item.specs || []).map(s => s.itemName).join('/'),
        subtotal: item.unitPrice * item.quantity
      }))

      const totalPrice = cartItems.reduce((sum, i) => sum + i.subtotal, 0)
      const packingFee = 0
      const deliveryFee = 0
      const actualPrice = totalPrice + packingFee + deliveryFee

      this.setData({
        merchant,
        cartItems,
        totalPrice,
        packingFee,
        deliveryFee,
        actualPrice
      })
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  /**
   * S7-9: 下单前请求订阅消息授权
   * 静默请求，用户拒绝不影响下单流程
   */
  _requestSubscribeMessage() {
    return new Promise((resolve) => {
      // 过滤掉未配置的模板ID
      const tmplIds = SUBSCRIBE_TEMPLATE_IDS.filter(id => !id.startsWith('TEMPLATE_ID_'))
      if (tmplIds.length === 0) {
        resolve()
        return
      }
      wx.requestSubscribeMessage({
        tmplIds,
        success: () => resolve(),
        fail: () => resolve() // 用户拒绝也继续下单
      })
    })
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.data.cartItems.length) return

    // 先请求订阅消息授权（不阻塞下单）
    await this._requestSubscribeMessage()

    this.setData({ submitting: true })

    try {
      const res = await orderService.create({
        merchantId: this.data.merchantId,
        items: this.data.cartItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          productImage: item.productImage,
          specs: item.specs,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        })),
        remark: this.data.remark
      })

      // 订单已创建，清空购物车
      cart.clear(this.data.merchantId)

      // 如果有支付参数，发起微信支付（成功/失败/取消都跳转到订单详情）
      if (res.payParams) {
        try {
          await this._requestPayment(res.payParams)
          // 支付成功：主动查询微信支付侧状态并同步到订单（补单机制，不依赖回调）
          wx.showLoading({ title: '确认中...' })
          await orderService.syncPaymentStatus(res.orderId).catch(() => {})
          wx.hideLoading()
        } catch (err) {
          wx.hideLoading()
          // 支付失败/取消：订单保持待支付状态，用户可在订单详情页重新发起支付
        }
      }

      // 无论支付结果如何，一律跳转到订单详情页
      wx.redirectTo({
        url: `/pages/order-detail/index?orderId=${res.orderId}`
      })
    } catch (err) {
      // 订单创建本身失败 — 允许用户重试
      const msg = (err && err.message) || '提交失败，请重试'
      wx.showToast({ title: msg, icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  /**
   * S7-8: 调起微信支付
   *
   * @param {Object} payParams - 后端返回的支付参数
   *   { timeStamp, nonceStr, package, signType, paySign }
   */
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
            // 用户取消支付
            reject(new Error('支付已取消'))
          } else {
            reject(new Error('支付失败，请重试'))
          }
        }
      })
    })
  }
})
