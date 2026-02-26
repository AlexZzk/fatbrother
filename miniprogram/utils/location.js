/**
 * 定位工具函数
 */
const { STORAGE_KEYS } = require('./constants')

const location = {
  /**
   * Get current location
   * @param {boolean} useCache - Use cached location if available (within 5 min)
   * @returns {Promise<{latitude: number, longitude: number}>}
   */
  getLocation(useCache = true) {
    if (useCache) {
      const cached = wx.getStorageSync(STORAGE_KEYS.LOCATION)
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return Promise.resolve({ latitude: cached.latitude, longitude: cached.longitude })
      }
    }

    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: res => {
          const loc = {
            latitude: res.latitude,
            longitude: res.longitude,
            timestamp: Date.now()
          }
          wx.setStorageSync(STORAGE_KEYS.LOCATION, loc)
          resolve({ latitude: res.latitude, longitude: res.longitude })
        },
        fail: err => {
          console.error('[location] getLocation failed:', err)
          // Check if user denied permission
          if (err.errMsg && err.errMsg.includes('deny')) {
            reject(new Error('请在设置中允许获取位置信息'))
          } else {
            reject(new Error('获取位置失败'))
          }
        }
      })
    })
  },

  /**
   * Calculate distance between two points (Haversine formula)
   * @param {number} lat1
   * @param {number} lng1
   * @param {number} lat2
   * @param {number} lng2
   * @returns {number} Distance in meters
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000 // Earth radius in meters
    const dLat = this._toRad(lat2 - lat1)
    const dLng = this._toRad(lng2 - lng1)
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c)
  },

  /**
   * Open location chooser (map)
   * @returns {Promise<{latitude: number, longitude: number, name: string, address: string}>}
   */
  chooseLocation() {
    return new Promise((resolve, reject) => {
      wx.chooseLocation({
        success: res => {
          resolve({
            latitude: res.latitude,
            longitude: res.longitude,
            name: res.name,
            address: res.address
          })
        },
        fail: err => {
          reject(err)
        }
      })
    })
  },

  /**
   * 逆地理编码：通过坐标获取地址描述（调用 common 云函数）
   * 若 API Key 未配置或调用失败，resolve 空字符串
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<string>}
   */
  getAddress(latitude, longitude) {
    return new Promise((resolve) => {
      wx.cloud.callFunction({
        name: 'common',
        data: { action: 'getAddress', latitude, longitude },
        success: res => {
          const addr = res.result && res.result.data && res.result.data.address
          resolve(addr || '')
        },
        fail: () => resolve('')
      })
    })
  },

  _toRad(deg) {
    return deg * Math.PI / 180
  }
}

module.exports = location
