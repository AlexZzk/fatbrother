const { callFunction } = require('./request')

// User service - all user-related API calls

const userService = {
  // Login with WeChat auth
  login() {
    return callFunction('user', { action: 'login' })
  },

  // Get user info
  getUserInfo() {
    return callFunction('user', { action: 'getUserInfo' })
  },

  // Update user profile
  updateProfile(data) {
    return callFunction('user', { action: 'updateProfile', ...data })
  },

  // Get active coupon claim activities
  getCouponActivities() {
    return callFunction('user', { action: 'getCouponActivities' })
  },

  // Claim a coupon from an activity
  claimCoupon(activityId) {
    return callFunction('user', { action: 'claimCoupon', activityId })
  },

  // Get user's coupons (status: 'unused'|'used'|'expired'|'' for all)
  getUserCoupons(status) {
    return callFunction('user', { action: 'getUserCoupons', status })
  },

  // Create a coupon activity (for platform admins/merchants)
  createCouponActivity(data) {
    return callFunction('user', { action: 'createCouponActivity', ...data })
  }
}

module.exports = userService
