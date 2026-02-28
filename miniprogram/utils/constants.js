/**
 * 全局常量定义
 */

// Order status
const ORDER_STATUS = {
  PENDING_PAY: 'PENDING_PAY',           // 待支付
  PENDING_ACCEPT: 'PENDING_ACCEPT',     // 待接单
  ACCEPTED: 'ACCEPTED',                 // 已接单（制作中）
  READY: 'READY',                       // 待取餐（到店自取）
  DISPATCHING: 'DISPATCHING',           // 待接单（骑手抢单中）
  DELIVERING: 'DELIVERING',             // 配送中
  COMPLETED: 'COMPLETED',               // 已完成
  CANCELLED: 'CANCELLED',               // 已取消
  REFUNDING: 'REFUNDING',               // 退款中
  REFUNDED: 'REFUNDED'                  // 已退款
}

// Order delivery type
const DELIVERY_TYPE = {
  PICKUP: 'pickup',       // 到店自取
  DELIVERY: 'delivery'    // 外卖配送
}

// Order status display text
const ORDER_STATUS_TEXT = {
  [ORDER_STATUS.PENDING_PAY]: '待支付',
  [ORDER_STATUS.PENDING_ACCEPT]: '待接单',
  [ORDER_STATUS.ACCEPTED]: '制作中',
  [ORDER_STATUS.READY]: '待取餐',
  [ORDER_STATUS.DISPATCHING]: '待骑手接单',
  [ORDER_STATUS.DELIVERING]: '配送中',
  [ORDER_STATUS.COMPLETED]: '已完成',
  [ORDER_STATUS.CANCELLED]: '已取消',
  [ORDER_STATUS.REFUNDING]: '退款中',
  [ORDER_STATUS.REFUNDED]: '已退款'
}

// Order status color (for tag display)
const ORDER_STATUS_COLOR = {
  [ORDER_STATUS.PENDING_PAY]: '#FF9500',
  [ORDER_STATUS.PENDING_ACCEPT]: '#FF9500',
  [ORDER_STATUS.ACCEPTED]: '#1677FF',
  [ORDER_STATUS.READY]: '#00B578',
  [ORDER_STATUS.DISPATCHING]: '#FF9500',
  [ORDER_STATUS.DELIVERING]: '#1677FF',
  [ORDER_STATUS.COMPLETED]: '#999999',
  [ORDER_STATUS.CANCELLED]: '#FF3B30',
  [ORDER_STATUS.REFUNDING]: '#FF9500',
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
  RIDER: 'rider',
  ADMIN: 'admin'
}

// Rider status
const RIDER_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended'
}

const RIDER_STATUS_TEXT = {
  pending: '审核中',
  active: '已认证',
  suspended: '已暂停'
}

// Rider vehicle types
const RIDER_VEHICLE_TYPE = {
  bicycle: '自行车',
  electric: '电动车',
  motorcycle: '摩托车',
  car: '汽车'
}

// Settlement status
const SETTLEMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  REVERSED: 'reversed'
}

// Pagination defaults
const PAGE_SIZE = 20

/**
 * 腾讯位置服务 WebService API Key（用于逆地理编码显示当前位置名称）
 * 申请地址: https://lbs.qq.com/ → 控制台 → 应用管理 → 创建应用 → 添加 Key（勾选 WebServiceAPI）
 * 填入后还需在微信公众平台 → 开发管理 → 开发设置 → request 合法域名中添加 https://apis.map.qq.com
 */
const TENCENT_MAP_KEY = 'LT4BZ-4EXLL-44PPY-MRATI-4OB3Q-VYBFC'

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
  DELIVERY_TYPE,
  MERCHANT_STATUS,
  MERCHANT_STATUS_TEXT,
  USER_ROLE,
  RIDER_STATUS,
  RIDER_STATUS_TEXT,
  RIDER_VEHICLE_TYPE,
  SETTLEMENT_STATUS,
  PAGE_SIZE,
  STORAGE_KEYS,
  ORDER_AUTO_CANCEL_TIMEOUT,
  TENCENT_MAP_KEY
}
