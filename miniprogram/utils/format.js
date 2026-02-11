/**
 * 格式化工具函数
 */

const format = {
  /**
   * Format price from cents (分) to display string
   * @param {number} cents - Price in cents
   * @returns {string} e.g. "12.50"
   */
  price(cents) {
    if (typeof cents !== 'number' || isNaN(cents)) return '0.00'
    return (cents / 100).toFixed(2)
  },

  /**
   * Format price without trailing zeros
   * @param {number} cents - Price in cents
   * @returns {string} e.g. "12.5" or "12"
   */
  priceShort(cents) {
    if (typeof cents !== 'number' || isNaN(cents)) return '0'
    const val = cents / 100
    return val % 1 === 0 ? val.toString() : val.toFixed(2).replace(/0$/, '')
  },

  /**
   * Format distance in meters to display string
   * @param {number} meters - Distance in meters
   * @returns {string} e.g. "500m" or "1.2km"
   */
  distance(meters) {
    if (typeof meters !== 'number' || isNaN(meters)) return ''
    if (meters < 1000) {
      return Math.round(meters) + 'm'
    }
    return (meters / 1000).toFixed(1) + 'km'
  },

  /**
   * Format timestamp to relative time string
   * @param {Date|number} time - Timestamp
   * @returns {string} e.g. "刚刚", "5分钟前", "2小时前", "昨天", "2026-01-15"
   */
  relativeTime(time) {
    const now = Date.now()
    const ts = time instanceof Date ? time.getTime() : time
    const diff = now - ts

    if (diff < 60 * 1000) return '刚刚'
    if (diff < 60 * 60 * 1000) return Math.floor(diff / (60 * 1000)) + '分钟前'
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / (60 * 60 * 1000)) + '小时前'
    if (diff < 48 * 60 * 60 * 1000) return '昨天'

    const d = new Date(ts)
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${month}-${day}`
  },

  /**
   * Format timestamp to date time string
   * @param {Date|number} time - Timestamp
   * @param {string} pattern - Format pattern: 'datetime'|'date'|'time'
   * @returns {string}
   */
  dateTime(time, pattern = 'datetime') {
    const d = new Date(time)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hour = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const sec = String(d.getSeconds()).padStart(2, '0')

    if (pattern === 'date') return `${year}-${month}-${day}`
    if (pattern === 'time') return `${hour}:${min}:${sec}`
    return `${year}-${month}-${day} ${hour}:${min}:${sec}`
  },

  /**
   * Format order number for display
   * @param {string} orderNo - Order number
   * @returns {string} Formatted order number with spaces
   */
  orderNo(orderNo) {
    if (!orderNo) return ''
    return orderNo
  },

  /**
   * Truncate text with ellipsis
   * @param {string} text - Original text
   * @param {number} maxLen - Max length
   * @returns {string}
   */
  ellipsis(text, maxLen = 20) {
    if (!text) return ''
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
  }
}

module.exports = format
