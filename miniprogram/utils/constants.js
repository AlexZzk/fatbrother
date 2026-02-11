/**
 * 全局常量定义
 */

// Order status
const ORDER_STATUS = {
  PENDING_PAY: 'PENDING_PAY',           // 待支付
  PENDING_ACCEPT: 'PENDING_ACCEPT',     // 待接单
  ACCEPTED: 'ACCEPTED',                 // 已接单（制作中）
  READY: 'READY',                       // 待取餐
  COMPLETED: 'COMPLETED',               // 已完成
  CANCELLED: 'CANCELLED',               // 已取消
  REFUNDING: 'REFUNDING',               // 退款中
  REFUNDED: 'REFUNDED'                  // 已退款
}

// Order status display text
const ORDER_STATUS_TEXT = {
  [ORDER_STATUS.PENDING_PAY]: '待支付',
  [ORDER_STATUS.PENDING_ACCEPT]: '待接单',
  [ORDER_STATUS.ACCEPTED]: '制作中',
  [ORDER_STATUS.READY]: '待取餐',
  [ORDER_STATUS.COMPLETED]: '已完成',
  [ORDER_STATUS.CANCELLED]: '已取消',
  [ORDER_STATUS.REFUNDING]: '退款中',
  [ORDER_STATUS.REFUNDED]: '已退款'
}

// Order status color (for tag display)
const ORDER_STATUS_COLOR = {
  [ORDER_STATUS.PENDING_PAY]: '#FF6B35',
  [ORDER_STATUS.PENDING_ACCEPT]: '#FF6B35',
  [ORDER_STATUS.ACCEPTED]: '#1677FF',
  [ORDER_STATUS.READY]: '#00B578',
  [ORDER_STATUS.COMPLETED]: '#999999',
  [ORDER_STATUS.CANCELLED]: '#999999',
  [ORDER_STATUS.REFUNDING]: '#FF3B30',
  [ORDER_STATUS.REFUNDED]: '#999999'
}

// Merchant status
const MERCHANT_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  DISABLED: 'disabled'
}

const MERCHANT_STATUS_TEXT = {
  [MERCHANT_STATUS.PENDING]: '审核中',
  [MERCHANT_STATUS.ACTIVE]: '正常',
  [MERCHANT_STATUS.DISABLED]: '已禁用'
}

// User roles
const USER_ROLE = {
  USER: 'user',
  MERCHANT: 'merchant',
  ADMIN: 'admin'
}

// Settlement status
const SETTLEMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  REVERSED: 'reversed'
}

// Pagination defaults
const PAGE_SIZE = 20

// Storage keys
const STORAGE_KEYS = {
  USER_INFO: 'userInfo',
  OPENID: 'openid',
  CART_PREFIX: 'cart_',
  LOGIN_REDIRECT: 'login_redirect',
  LOCATION: 'last_location'
}

// Auto-cancel timeout (30 minutes, in milliseconds)
const ORDER_AUTO_CANCEL_TIMEOUT = 30 * 60 * 1000

module.exports = {
  ORDER_STATUS,
  ORDER_STATUS_TEXT,
  ORDER_STATUS_COLOR,
  MERCHANT_STATUS,
  MERCHANT_STATUS_TEXT,
  USER_ROLE,
  SETTLEMENT_STATUS,
  PAGE_SIZE,
  STORAGE_KEYS,
  ORDER_AUTO_CANCEL_TIMEOUT
}
