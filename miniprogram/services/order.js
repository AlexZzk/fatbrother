const { callFunction } = require('./request')

const orderService = {
  // Create order
  create(data) {
    return callFunction('order', { action: 'create', ...data })
  },

  // Get order list
  getList(params) {
    return callFunction('order', { action: 'getList', ...params })
  },

  // Get order detail
  getDetail(orderId) {
    return callFunction('order', { action: 'getDetail', orderId })
  },

  // User cancel order
  cancel(orderId, reason) {
    return callFunction('order', { action: 'cancel', orderId, reason })
  },

  // Merchant accept order
  accept(orderId) {
    return callFunction('order', { action: 'accept', orderId })
  },

  // Merchant reject order
  reject(orderId, reason) {
    return callFunction('order', { action: 'reject', orderId, reason })
  },

  // Mark order as ready (出餐)
  markReady(orderId) {
    return callFunction('order', { action: 'markReady', orderId })
  },

  // Complete order
  complete(orderId) {
    return callFunction('order', { action: 'complete', orderId })
  },

  // Merchant: get order list with tab counts
  getMerchantOrders(params) {
    return callFunction('order', { action: 'getMerchantOrders', ...params })
  },

  // Create payment (re-initiate payment for PENDING_PAY order)
  createPayment(orderId) {
    return callFunction('order', { action: 'createPayment', orderId })
  },

  // Request refund
  createRefund(orderId, reason) {
    return callFunction('order', { action: 'createRefund', orderId, reason })
  }
}

module.exports = orderService
