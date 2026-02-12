const app = getApp()
const cart = require('../../utils/cart')
const format = require('../../utils/format')
const orderService = require('../../services/order')
const merchantService = require('../../services/merchant')

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

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.data.cartItems.length) return

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

      // Clear cart for this merchant
      cart.clear(this.data.merchantId)

      // Navigate to result page
      wx.redirectTo({
        url: `/pages/order-result/index?orderId=${res.orderId}&orderNo=${res.orderNo}`
      })
    } catch (err) {
      const msg = (err && err.message) || '提交失败，请重试'
      wx.showToast({ title: msg, icon: 'none' })
      this.setData({ submitting: false })
    }
  }
})
