const app = getApp()
const merchantService = require('../../services/merchant')
const productService = require('../../services/product')
const cart = require('../../utils/cart')
const format = require('../../utils/format')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    merchantId: '',
    merchant: null,
    menu: [],
    activeCategoryIndex: 0,
    // Cart
    cartItems: [],
    cartCount: 0,
    cartTotal: 0,
    showCartPopup: false,
    // Spec popup
    showSpecPopup: false,
    specProduct: null,
    // Product counts for display
    productCounts: {},
    loading: true
  },

  onLoad(options) {
    const merchantId = options.id
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight,
      merchantId
    })
    this._loadData(merchantId)
  },

  onShow() {
    // Refresh cart when returning from order-confirm
    if (this.data.merchantId) {
      this._refreshCart()
    }
  },

  async _loadData(merchantId) {
    // 先加载商户信息（必要，失败则整页无意义）
    try {
      const merchantData = await merchantService.getMerchantInfo(merchantId)
      this.setData({ merchant: merchantData.merchantInfo, loading: false })
    } catch (err) {
      this.setData({ loading: false })
      return
    }

    // 再加载菜单（次要，失败不阻塞商户信息展示）
    try {
      const menuData = await productService.getMenu(merchantId)
      const menu = (menuData.menu || []).map(cat => ({
        ...cat,
        products: cat.products.filter(p => p.is_on_sale)
      })).filter(cat => cat.products.length > 0)
      this.setData({ menu })
      this._refreshCart()
    } catch (err) {
      console.error('[shop] getMenu failed:', err)
    }
  },

  _refreshCart() {
    const { merchantId } = this.data
    const items = cart.getItems(merchantId)
    const summary = cart.getSummary(merchantId)

    // Build product count map for product-item display
    const productCounts = {}
    items.forEach(item => {
      productCounts[item.productId] = (productCounts[item.productId] || 0) + item.quantity
    })

    this.setData({
      cartItems: items,
      cartCount: summary.count,
      cartTotal: summary.totalPrice,
      productCounts
    })
  },

  // Category tab
  onCategoryTap(e) {
    const { index } = e.currentTarget.dataset
    this.setData({ activeCategoryIndex: index })
  },

  // Add simple product (no specs)
  onAddProduct(e) {
    const { product } = e.detail
    cart.addItem(this.data.merchantId, {
      productId: product._id,
      productName: product.name,
      productImage: product.image,
      basePrice: product.base_price,
      specs: [],
      quantity: 1
    })
    this._refreshCart()
  },

  // Minus simple product
  onMinusProduct(e) {
    const { product } = e.detail
    const items = cart.getItems(this.data.merchantId)
    const cartItem = items.find(i => i.productId === product._id && i.specs.length === 0)
    if (cartItem) {
      cart.updateQuantity(this.data.merchantId, cartItem.cartId, cartItem.quantity - 1)
      this._refreshCart()
    }
  },

  // Tap anywhere on product card (not on action buttons) → open spec/detail popup
  onProductTap(e) {
    this.setData({ showSpecPopup: true, specProduct: e.detail.product })
  },

  // Show spec popup (tapped "+" on a product with specs)
  onSpecAdd(e) {
    this.setData({ showSpecPopup: true, specProduct: e.detail.product })
  },

  onSpecClose() {
    this.setData({ showSpecPopup: false, specProduct: null })
  },

  onSpecConfirm(e) {
    const item = e.detail
    cart.addItem(this.data.merchantId, {
      productId: item.productId,
      productName: item.productName,
      productImage: item.productImage,
      basePrice: item.basePrice,
      specs: item.specs.map(s => ({
        groupName: s.groupName,
        itemName: s.itemName,
        priceDelta: s.priceDelta
      })),
      quantity: item.quantity
    })
    this._refreshCart()
  },

  // Cart bar
  onCartToggle() {
    this.setData({ showCartPopup: !this.data.showCartPopup })
  },

  onCartPopupClose() {
    this.setData({ showCartPopup: false })
  },

  onCartItemChange(e) {
    const { cartId, quantity } = e.detail
    cart.updateQuantity(this.data.merchantId, cartId, quantity)
    this._refreshCart()
    if (cart.getItems(this.data.merchantId).length === 0) {
      this.setData({ showCartPopup: false })
    }
  },

  onCartClear() {
    cart.clear(this.data.merchantId)
    this._refreshCart()
    this.setData({ showCartPopup: false })
  },

  onCheckout() {
    if (this.data.cartCount <= 0) return
    wx.navigateTo({
      url: `/pages/order-confirm/index?merchantId=${this.data.merchantId}`
    })
  }
})
