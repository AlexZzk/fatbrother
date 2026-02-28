const app = getApp()
const cart = require('../../utils/cart')
const format = require('../../utils/format')
const orderService = require('../../services/order')
const merchantService = require('../../services/merchant')
const userService = require('../../services/user')
const addressService = require('../../services/address')

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

/**
 * Haversine 公式计算两点距离（米）
 */
function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

/**
 * 根据配送规则和距离计算配送费
 * 返回 -1 表示超出配送范围
 */
function calcDeliveryFee(rules, distanceMeters) {
  if (!rules || rules.length === 0) return 0
  if (distanceMeters === null || distanceMeters === undefined) return 0

  const sorted = [...rules].sort((a, b) => {
    if (a.max_distance === 0) return 1
    if (b.max_distance === 0) return -1
    return a.max_distance - b.max_distance
  })

  for (const rule of sorted) {
    if (rule.max_distance === 0 || distanceMeters <= rule.max_distance) {
      return rule.fee
    }
  }
  return -1
}

function fmtAmount(cents) {
  const val = cents / 100
  return val % 1 === 0 ? String(val) : val.toFixed(2)
}

Page({
  data: {
    merchantId: '',
    merchant: null,
    cartItems: [],
    totalPrice: 0,
    packingFee: 0,
    deliveryFee: 0,
    deliveryFeeActual: 0,
    promotionDiscount: 0,
    appliedPromotion: null,
    couponDiscount: 0,
    couponDiscountLabel: '0.00',
    selectedCoupon: null,
    selectedCouponAmountLabel: '0.00',
    actualPrice: 0,
    remark: '',
    submitting: false,
    distanceMeters: null,
    minOrderAmount: 0,
    minOrderGapLabel: '0.00',
    belowMinOrder: false,
    showCouponPicker: false,
    availableCoupons: [],
    couponsLoaded: false,
    // 配送方式
    deliveryType: 'pickup',   // 'pickup' | 'delivery'
    selectedAddress: null     // 选中的收货地址
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
      const [merchantRes, addressRes] = await Promise.all([
        merchantService.getMerchantInfo(merchantId),
        addressService.getAddresses().catch(() => ({ list: [] }))
      ])
      const merchant = merchantRes.merchantInfo

      const cartItems = items.map(item => ({
        ...item,
        specText: (item.specs || []).map(s => s.itemName).join('/'),
        subtotal: item.unitPrice * item.quantity
      }))

      const totalPrice = cartItems.reduce((sum, i) => sum + i.subtotal, 0)
      const packingFee = merchant.packing_fee || 0
      const minOrderAmount = merchant.min_order_amount || 0

      // 获取距离并计算配送费
      let distanceMeters = null
      let deliveryFee = 0
      try {
        distanceMeters = await this._getDistanceToMerchant(merchant)
      } catch (e) { /* 获取位置失败不阻塞 */ }
      deliveryFee = calcDeliveryFee(merchant.delivery_fee_rules || [], distanceMeters)

      // 预选默认地址
      const addresses = addressRes.list || []
      const defaultAddress = addresses.find(a => a.is_default) || addresses[0] || null

      const belowMinOrder = minOrderAmount > 0 && totalPrice < minOrderAmount
      const gap = belowMinOrder ? minOrderAmount - totalPrice : 0
      this.setData({
        merchant,
        cartItems,
        totalPrice,
        packingFee,
        minOrderAmount,
        minOrderGapLabel: (gap / 100).toFixed(2),
        distanceMeters,
        deliveryFee: deliveryFee < 0 ? 0 : deliveryFee,
        belowMinOrder,
        selectedAddress: defaultAddress
      })

      this._calcPromotion()
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 获取用户到商户的距离
   */
  async _getDistanceToMerchant(merchant) {
    if (!merchant.location) return null
    return new Promise((resolve) => {
      wx.getLocation({
        type: 'wgs84',
        success: (res) => {
          const d = calcDistance(
            res.latitude, res.longitude,
            merchant.location.latitude, merchant.location.longitude
          )
          resolve(d)
        },
        fail: () => resolve(null)
      })
    })
  },

  /**
   * 计算促销折扣（满减配送费）
   */
  _calcPromotion() {
    const { merchant, totalPrice, deliveryFee, selectedCoupon, deliveryType } = this.data
    if (!merchant) return

    const couponDiscount = selectedCoupon ? selectedCoupon.amount : 0
    // 到店自取不计配送费
    const deliveryFeeActual = deliveryType === 'delivery' ? deliveryFee : 0
    const actualPrice = Math.max(1, totalPrice + this.data.packingFee + deliveryFeeActual - couponDiscount)

    this.setData({
      deliveryFeeActual,
      couponDiscount,
      couponDiscountLabel: (couponDiscount / 100).toFixed(2),
      actualPrice
    })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  // ==================== 配送方式 ====================
  onDeliveryTypeTap(e) {
    const { type } = e.currentTarget.dataset
    if (type === this.data.deliveryType) return
    this.setData({ deliveryType: type })
    this._calcPromotion()
  },

  onSelectAddress() {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    wx.navigateTo({
      url: '/pages/address/list/index?mode=select',
      events: {
        onAddressSelected: (address) => {
          this.setData({ selectedAddress: address })
        }
      }
    })
  },

  // ==================== 优惠券 ====================
  async onCouponTap() {
    if (!this.data.couponsLoaded) {
      try {
        const res = await orderService.getUserCoupons(this.data.merchantId, this.data.totalPrice)
        const availableCoupons = (res.coupons || []).map(c => ({
          ...c,
          amountLabel: fmtAmount(c.amount),
          conditionLabel: c.min_order_amount > 0 ? ('满¥' + (c.min_order_amount / 100).toFixed(2) + '可用') : '无门槛'
        }))
        this.setData({ availableCoupons, couponsLoaded: true })
      } catch (err) {
        this.setData({ availableCoupons: [], couponsLoaded: true })
      }
    }
    this.setData({ showCouponPicker: true })
  },

  onCloseCouponPicker() {
    this.setData({ showCouponPicker: false })
  },

  onSelectCoupon(e) {
    const coupon = e.currentTarget.dataset.coupon
    if (!coupon.is_available) return
    this.setData({
      selectedCoupon: coupon,
      selectedCouponAmountLabel: fmtAmount(coupon.amount),
      showCouponPicker: false
    })
    this._calcPromotion()
  },

  onClearCoupon() {
    this.setData({ selectedCoupon: null })
    this._calcPromotion()
  },

  // ==================== 提交订单 ====================
  /**
   * S7-9: 下单前请求订阅消息授权
   * 静默请求，用户拒绝不影响下单流程
   */
  _requestSubscribeMessage() {
    return new Promise((resolve) => {
      const tmplIds = SUBSCRIBE_TEMPLATE_IDS.filter(id => !id.startsWith('TEMPLATE_ID_'))
      if (tmplIds.length === 0) {
        resolve()
        return
      }
      wx.requestSubscribeMessage({
        tmplIds,
        success: () => resolve(),
        fail: () => resolve()
      })
    })
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.data.cartItems.length) return
    if (this.data.belowMinOrder) {
      wx.showToast({ title: '未达到起送金额', icon: 'none' })
      return
    }
    if (this.data.deliveryType === 'delivery') {
      if (!this.data.selectedAddress) {
        wx.showToast({ title: '请选择收货地址', icon: 'none' })
        return
      }
      if (this.data.deliveryFee < 0) {
        wx.showToast({ title: '您的位置超出配送范围', icon: 'none' })
        return
      }
    }

    await this._requestSubscribeMessage()

    this.setData({ submitting: true })

    try {
      const createParams = {
        merchantId: this.data.merchantId,
        items: this.data.cartItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          productImage: item.productImage,
          specs: item.specs,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        })),
        remark: this.data.remark,
        delivery_type: this.data.deliveryType,
        couponId: this.data.selectedCoupon ? this.data.selectedCoupon._id : undefined
      }

      if (this.data.deliveryType === 'delivery') {
        createParams.distanceMeters = this.data.distanceMeters
        createParams.delivery_address = this.data.selectedAddress
      }

      const res = await orderService.create(createParams)

      cart.clear(this.data.merchantId)

      if (res.payParams) {
        try {
          await this._requestPayment(res.payParams)
          wx.showLoading({ title: '确认中...' })
          await orderService.syncPaymentStatus(res.orderId).catch(() => {})
          wx.hideLoading()
        } catch (err) {
          wx.hideLoading()
        }
      }

      wx.redirectTo({
        url: `/pages/order-detail/index?orderId=${res.orderId}`
      })
    } catch (err) {
      const msg = (err && err.message) || '提交失败，请重试'
      wx.showToast({ title: msg, icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  /**
   * S7-8: 调起微信支付
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
            reject(new Error('支付已取消'))
          } else {
            reject(new Error('支付失败，请重试'))
          }
        }
      })
    })
  }
})
