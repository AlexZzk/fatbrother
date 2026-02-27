const { callFunction } = require('./request')

const riderService = {
  getRiderInfo() {
    return callFunction('rider', { action: 'getRiderInfo' })
  },

  applyRider(data) {
    return callFunction('rider', { action: 'applyRider', ...data })
  },

  updateOnlineStatus(is_online) {
    return callFunction('rider', { action: 'updateOnlineStatus', is_online })
  }
}

module.exports = riderService
