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
  }
}

module.exports = userService
