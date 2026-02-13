/**
 * 购物车工具 - 基于本地 Storage，按商家隔离
 */
const { STORAGE_KEYS } = require('./constants')

function getCartKey(merchantId) {
  return STORAGE_KEYS.CART_PREFIX + merchantId
}

const cart = {
  /**
   * Get cart items for a merchant
   * @param {string} merchantId
   * @returns {Array} Cart items
   */
  getItems(merchantId) {
    return wx.getStorageSync(getCartKey(merchantId)) || []
  },

  /**
   * Add item to cart
   * Each cart item structure:
   * {
   *   cartId: string,       // Unique cart item ID
   *   productId: string,
   *   productName: string,
   *   productImage: string,
   *   basePrice: number,    // cents
   *   specs: [{groupName, itemName, priceDelta}],
   *   quantity: number,
   *   unitPrice: number,    // calculated: basePrice + sum of spec priceDelta
   * }
   * @param {string} merchantId
   * @param {Object} item
   * @returns {Array} Updated cart items
   */
  addItem(merchantId, item) {
    const items = this.getItems(merchantId)

    // Check if same product with same specs already exists
    const existIndex = items.findIndex(i =>
      i.productId === item.productId &&
      this._specsEqual(i.specs, item.specs)
    )

    if (existIndex > -1) {
      items[existIndex].quantity += (item.quantity || 1)
    } else {
      const unitPrice = item.basePrice + (item.specs || []).reduce((sum, s) => sum + (s.priceDelta || 0), 0)
      items.push({
        cartId: this._generateId(),
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage || '',
        basePrice: item.basePrice,
        specs: item.specs || [],
        quantity: item.quantity || 1,
        unitPrice
      })
    }

    this._save(merchantId, items)
    return items
  },

  /**
   * Update item quantity
   * @param {string} merchantId
   * @param {string} cartId
   * @param {number} quantity - New quantity (0 to remove)
   * @returns {Array} Updated cart items
   */
  updateQuantity(merchantId, cartId, quantity) {
    let items = this.getItems(merchantId)
    if (quantity <= 0) {
      items = items.filter(i => i.cartId !== cartId)
    } else {
      const item = items.find(i => i.cartId === cartId)
      if (item) item.quantity = quantity
    }
    this._save(merchantId, items)
    return items
  },

  /**
   * Clear cart for a merchant
   * @param {string} merchantId
   */
  clear(merchantId) {
    wx.removeStorageSync(getCartKey(merchantId))
  },

  /**
   * Get cart summary (total count, total price)
   * @param {string} merchantId
   * @returns {{ count: number, totalPrice: number }}
   */
  getSummary(merchantId) {
    const items = this.getItems(merchantId)
    let count = 0
    let totalPrice = 0
    items.forEach(item => {
      count += item.quantity
      totalPrice += item.unitPrice * item.quantity
    })
    return { count, totalPrice }
  },

  // Private methods
  _save(merchantId, items) {
    wx.setStorageSync(getCartKey(merchantId), items)
  },

  _specsEqual(specs1, specs2) {
    if (!specs1 && !specs2) return true
    if (!specs1 || !specs2) return false
    if (specs1.length !== specs2.length) return false
    return specs1.every((s, i) =>
      s.groupName === specs2[i].groupName && s.itemName === specs2[i].itemName
    )
  },

  _generateId() {
    return 'cart_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
  }
}

module.exports = cart
