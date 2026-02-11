const { callFunction } = require('./request')

const productService = {
  // Category CRUD
  getCategories(merchantId) {
    return callFunction('product', { action: 'getCategories', merchantId })
  },

  saveCategory(data) {
    return callFunction('product', { action: 'saveCategory', ...data })
  },

  deleteCategory(categoryId) {
    return callFunction('product', { action: 'deleteCategory', categoryId })
  },

  sortCategories(categoryIds) {
    return callFunction('product', { action: 'sortCategories', categoryIds })
  },

  // Product CRUD
  getProduct(productId) {
    return callFunction('product', { action: 'getProduct', productId })
  },

  saveProduct(data) {
    return callFunction('product', { action: 'saveProduct', ...data })
  },

  deleteProduct(productId) {
    return callFunction('product', { action: 'deleteProduct', productId })
  },

  toggleSale(productId, isOnSale) {
    return callFunction('product', { action: 'toggleSale', productId, isOnSale })
  },

  // Get full menu for a merchant (categories + products)
  getMenu(merchantId) {
    return callFunction('product', { action: 'getMenu', merchantId })
  }
}

module.exports = productService
