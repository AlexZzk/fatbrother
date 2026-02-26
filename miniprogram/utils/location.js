/**
 * 定位工具函数
 */
const { STORAGE_KEYS, TENCENT_MAP_KEY } = require('./constants')

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
   * 逆地理编码：通过坐标获取最近定位点名称
   * 直接调用腾讯位置服务 WebService API
   * 需在 constants.js 中配置 TENCENT_MAP_KEY，
   * 并在微信公众平台将 https://apis.map.qq.com 加入 request 合法域名
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<string>}
   */
  getAddress(latitude, longitude) {
    if (!TENCENT_MAP_KEY) return Promise.resolve('')
    return new Promise((resolve) => {
      wx.request({
        url: 'https://apis.map.qq.com/ws/geocoder/v1/',
        data: {
          location: `${latitude},${longitude}`,
          key: TENCENT_MAP_KEY,
          output: 'json',
          get_poi: 0
        },
        success: res => {
          if (res.data && res.data.status === 0 && res.data.result) {
            const r = res.data.result
            const comp = r.address_component || {}
            // 优先 formatted_addresses.recommend（最近定位点描述，如"绿地象屿附近"）
            // 其次街道，再次区，最后城市
            const address =
              (r.formatted_addresses && r.formatted_addresses.recommend) ||
              comp.street || comp.district || comp.city || r.address || ''
            resolve(address)
          } else {
            resolve('')
          }
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
