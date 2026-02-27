const { callFunction } = require('./request')

const addressService = {
  getAddresses() {
    return callFunction('user', { action: 'getAddresses' })
  },

  addAddress(data) {
    return callFunction('user', { action: 'addAddress', ...data })
  },

  updateAddress(addressId, data) {
    return callFunction('user', { action: 'updateAddress', addressId, ...data })
  },

  deleteAddress(addressId) {
    return callFunction('user', { action: 'deleteAddress', addressId })
  },

  setDefaultAddress(addressId) {
    return callFunction('user', { action: 'setDefaultAddress', addressId })
  }
}

module.exports = addressService
