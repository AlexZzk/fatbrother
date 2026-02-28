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

  // Complete order (merchant)
  complete(orderId) {
    return callFunction('order', { action: 'complete', orderId })
  },

  // User confirm pickup → complete
  userComplete(orderId) {
    return callFunction('order', { action: 'userComplete', orderId })
  },

  // Merchant: get order list with tab counts
  getMerchantOrders(params) {
    return callFunction('order', { action: 'getMerchantOrders', ...params })
  },

  // Create payment (re-initiate payment for PENDING_PAY order)
  createPayment(orderId) {
    return callFunction('order', { action: 'createPayment', orderId })
  },

  // Actively sync payment status from WeChat Pay (补单机制，回调兜底)
  syncPaymentStatus(orderId) {
    return callFunction('order', { action: 'syncPaymentStatus', orderId })
  },

  // Request refund
  createRefund(orderId, reason) {
    return callFunction('order', { action: 'createRefund', orderId, reason })
  },

  // Get user's available coupons for an order (pass totalPrice in cents for availability filter)
  getUserCoupons(merchantId, totalPrice) {
    return callFunction('order', { action: 'getUserCoupons', merchantId, totalPrice })
  },

  // Rider: get dispatching orders (抢单大厅)
  getDispatchingOrders(params) {
    return callFunction('order', { action: 'getDispatchingOrders', ...params })
  },

  // Rider: accept a dispatching order
  riderAccept(orderId) {
    return callFunction('order', { action: 'riderAccept', orderId })
  },

  // User/rider: confirm delivery completed → COMPLETED
  riderComplete(orderId) {
    return callFunction('order', { action: 'riderComplete', orderId })
  }
}

module.exports = orderService
