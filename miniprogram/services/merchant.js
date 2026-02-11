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

  // Update shop settings
  updateSettings(data) {
    return callFunction('merchant', { action: 'updateSettings', ...data })
  },

  // Toggle open/close with GPS location
  toggleStatus(isOpen, location) {
    return callFunction('merchant', { action: 'toggleStatus', isOpen, location })
  },

  // Get nearby merchant list (for C-end)
  getNearbyList(params) {
    return callFunction('merchant', { action: 'getNearbyList', ...params })
  },

  // Get invite records (referral list)
  getInviteRecords() {
    return callFunction('merchant', { action: 'getInviteRecords' })
  }
}

module.exports = merchantService
