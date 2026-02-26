const { callFunction } = require('./request')

const merchantService = {
  // Verify invite code
  verifyInviteCode(code) {
    return callFunction('merchant', { action: 'verifyInviteCode', code })
  },

  // Submit merchant application
  apply(data) {
    return callFunction('merchant', { action: 'apply', ...data })
  },

  // Get application status
  getApplyStatus() {
    return callFunction('merchant', { action: 'getApplyStatus' })
  },

  // Get merchant info
  getMerchantInfo(merchantId) {
    return callFunction('merchant', { action: 'getMerchantInfo', merchantId })
  },

  // Update shop settings (supports: shop_name, shop_avatar, shop_banner, announcement,
  //   contact_phone, min_order_amount, packing_fee, delivery_fee_rules)
  updateSettings(data) {
    return callFunction('merchant', { action: 'updateSettings', ...data })
  },

  // Toggle open/close with GPS location and address name
  toggleStatus(isOpen, location, locationName) {
    return callFunction('merchant', { action: 'toggleStatus', isOpen, location, locationName })
  },

  // Get nearby merchant list (for C-end)
  getNearbyList(params) {
    return callFunction('merchant', { action: 'getNearbyList', ...params })
  },

  // Get invite records (referral list)
  getInviteRecords() {
    return callFunction('merchant', { action: 'getInviteRecords' })
  },

  // Get today's stats (order count, revenue, refund, pending counts)
  getTodayStats() {
    return callFunction('merchant', { action: 'getTodayStats' })
  },

  // Search merchants by keyword (name + product name fuzzy match)
  search(params) {
    return callFunction('merchant', { action: 'search', ...params })
  },

  // Get merchant's promotions list
  getPromotions() {
    return callFunction('merchant', { action: 'getPromotions' })
  },

  // Create or update a promotion (promotionId optional for update)
  savePromotion(data) {
    return callFunction('merchant', { action: 'savePromotion', ...data })
  },

  // Delete a promotion
  deletePromotion(promotionId) {
    return callFunction('merchant', { action: 'deletePromotion', promotionId })
  }
}

module.exports = merchantService
