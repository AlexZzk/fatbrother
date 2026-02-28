const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const { WechatPayHelper } = require('./payment-helper')

const ordersCol = db.collection('orders')
const merchantsCol = db.collection('merchants')
const productsCol = db.collection('products')
const settlementsCol = db.collection('settlements')
const usersCol = db.collection('users')
const promotionsCol = db.collection('promotions')
const userCouponsCol = db.collection('user_coupons')

// ======== TODO_REPLACE: 设为 true 启用真实微信支付，false 使用模拟支付 ========
const USE_REAL_PAYMENT = true

// ======== TODO_REPLACE: 平台佣金配置 ========
const PLATFORM_CONFIG = {
  commissionRate: 0.10, // 平台佣金比例 10%
  // 平台商户号 - 作为分账接收方
  platformMchId: '1736768370'
}

/**
 * S7-10: 发送订阅消息通知（静默调用，失败不影响主流程）
 *
 * @param {string} type - 消息类型
 * @param {string} toOpenid - 接收者 openid
 * @param {Object} orderData - 订单数据
 */
async function sendNotify(type, toOpenid, orderData) {
  try {
    await cloud.callFunction({
      name: 'common',
      data: { action: 'sendMessage', type, toOpenid, orderData }
    })
  } catch (err) {
    console.warn(`[sendNotify] ${type} to ${toOpenid} failed:`, err.message)
  }
}

// Order status constants (mirror frontend constants.js)
const STATUS = {
  PENDING_PAY: 'PENDING_PAY',
  PENDING_ACCEPT: 'PENDING_ACCEPT',
  ACCEPTED: 'ACCEPTED',
  READY: 'READY',
  DISPATCHING: 'DISPATCHING',
  DELIVERING: 'DELIVERING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
}

const DELIVERY_TYPE = {
  PICKUP: 'pickup',
  DELIVERY: 'delivery'
}

// Action routing
const actions = {
  create,
  getList,
  getDetail,
  cancel,
  getMerchantOrders,
  accept,
  reject,
  markReady,
  complete,
  userComplete,
  autoCancel,
  getUserCoupons,
  // 骑手配送相关
  getDispatchingOrders,
  riderAccept,
  riderComplete,
  // S7: 支付相关
  createPayment,
  syncPaymentStatus,
  paymentNotify,
  createRefund,
  settlement
}

exports.main = async (event, context) => {
  // WeChat Pay v3 sends payment notifications via HTTP POST (URL化).
  // In that case event.httpMethod is set and there is no `action` field.
  if (event.httpMethod) {
    return _handleHttpCallback(event)
  }

  const { action } = event
  const handler = actions[action]
  if (!handler) {
    return { code: 1001, message: `未知操作: ${action}` }
  }
  try {
    const wxContext = cloud.getWXContext()
    event._openid = wxContext.OPENID
    const data = await handler(event)
    return { code: 0, message: 'success', data }
  } catch (err) {
    if (err.code) return err
    console.error(`[order/${action}] error:`, err)
    return { code: 5000, message: '系统繁忙，请稍后重试' }
  }
}

/**
 * Handle HTTP callbacks from WeChat Pay (URL化).
 * WeChat Pay v3 requires a JSON response: { "code": "SUCCESS" } on success.
 */
async function _handleHttpCallback(event) {
  const respond = (ok, msg) => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: ok ? 'SUCCESS' : 'FAIL', message: msg || (ok ? '成功' : '处理失败') })
  })

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {})

    // 从 URL 路径中提取订单号，格式: /paynotify/{out_trade_no}
    // 微信支付 v3 禁止 notify_url 含查询参数，故改用路径传递
    const path = event.path || ''
    const pathMatch = path.match(/\/paynotify\/([^/?#]+)$/)
    const outTradeNo = pathMatch ? pathMatch[1] : ''

    await paymentNotify({ ...body, out_trade_no: outTradeNo, _openid: '' })
    return respond(true)
  } catch (err) {
    console.error('[httpCallback] error:', err.message || err)
    // Return SUCCESS for "already handled" to stop WeChat Pay retrying
    if (err.message === '订单已处理' || err.message === '非成功状态，忽略') {
      return respond(true, err.message)
    }
    return respond(false, err.message || '处理失败')
  }
}

function createError(code, message) {
  const e = new Error(message)
  e.code = code
  e.message = message
  return e
}

/**
 * 生成订单编号: 年月日时分秒 + 4位随机数
 */
function generateOrderNo() {
  const now = new Date()
  const pad = (n, len = 2) => String(n).padStart(len, '0')
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return datePart + rand
}

/**
 * 计算配送费（根据商户配送费规则和用户距离）
 * @param {Array} rules - delivery_fee_rules: [{max_distance, fee}], 按max_distance升序排列
 *   max_distance: 单位米，0表示兜底规则（无距离上限）
 *   fee: 单位分，-1表示不配送
 * @param {number|null} distanceMeters - 用户到商户距离（米），null表示未知
 * @returns {number} 配送费（分），-1表示不在配送范围内
 */
function calcDeliveryFee(rules, distanceMeters) {
  if (!rules || rules.length === 0) return 0
  if (distanceMeters === null || distanceMeters === undefined) return 0

  // 按 max_distance 升序排列，0排最后（兜底）
  const sorted = [...rules].sort((a, b) => {
    if (a.max_distance === 0) return 1
    if (b.max_distance === 0) return -1
    return a.max_distance - b.max_distance
  })

  for (const rule of sorted) {
    if (rule.max_distance === 0 || distanceMeters <= rule.max_distance) {
      return rule.fee
    }
  }
  return -1 // 超出所有规则范围，不配送
}

/**
 * S5-1: 创建订单
 *
 * 入参:
 *   merchantId - 商家ID
 *   items - 购物车商品列表 [{ productId, productName, productImage, specs, quantity, unitPrice }]
 *   remark - 备注（可选）
 *   distanceMeters - 用户到商户距离（米，可选）
 *   couponId - 用户选择的优惠券ID（可选）
 *
 * 流程:
 *   1. 校验商家状态
 *   2. 校验商品存在且在售，重新计算价格（防篡改）
 *   3. 计算配送费（根据距离和商户规则）
 *   4. 应用促销活动（满减配送费）
 *   5. 应用优惠券/红包抵扣
 *   6. 生成订单快照
 */
async function create(event) {
  const { _openid, merchantId, items, remark = '', distanceMeters, couponId, delivery_type = DELIVERY_TYPE.PICKUP, delivery_address } = event

  if (!merchantId || !items || !items.length) {
    throw createError(1001, '参数不完整')
  }
  if (delivery_type === DELIVERY_TYPE.DELIVERY && !delivery_address) {
    throw createError(1001, '外卖配送需要填写收货地址')
  }

  // Validate merchant
  const { data: merchant } = await merchantsCol.doc(merchantId).get().catch(() => ({ data: null }))
  if (!merchant || merchant.status !== 'active') {
    throw createError(2001, '商家不存在或已停业')
  }
  if (!merchant.is_open) {
    throw createError(2001, '商家暂未营业')
  }

  // Collect all product IDs from cart
  const productIds = [...new Set(items.map(i => i.productId))]

  // Batch fetch products (max 20 per query in cloud DB)
  const { data: products } = await productsCol.where({
    _id: _.in(productIds),
    merchant_id: merchantId
  }).limit(100).get()

  const productMap = {}
  products.forEach(p => { productMap[p._id] = p })

  // Build order items with server-side price validation
  let totalPrice = 0
  const orderItems = items.map(cartItem => {
    const product = productMap[cartItem.productId]
    if (!product) {
      throw createError(2001, `商品"${cartItem.productName}"已下架`)
    }
    if (!product.is_on_sale) {
      throw createError(2001, `商品"${product.name}"已下架`)
    }

    // Recalculate unit price from server data
    let unitPrice = product.base_price
    const specSnapshot = []

    if (cartItem.specs && cartItem.specs.length > 0) {
      cartItem.specs.forEach(cartSpec => {
        // Find the matching spec group and option in server data
        let priceDelta = 0
        if (product.spec_groups) {
          const group = product.spec_groups.find(g => g.name === cartSpec.groupName)
          if (group) {
            const option = group.specs.find(s => s.name === cartSpec.itemName)
            if (option) {
              priceDelta = option.price_delta || 0
            }
          }
        }
        unitPrice += priceDelta
        specSnapshot.push({
          group: cartSpec.groupName,
          selected: cartSpec.itemName
        })
      })
    }

    const quantity = Math.max(1, Math.min(99, parseInt(cartItem.quantity) || 1))
    const subtotal = unitPrice * quantity
    totalPrice += subtotal

    return {
      product_id: product._id,
      name: product.name,
      image: product.image || '',
      specs: specSnapshot,
      unit_price: unitPrice,
      quantity,
      subtotal
    }
  })

  // 检查起送价
  const minOrderAmount = merchant.min_order_amount || 0
  if (minOrderAmount > 0 && totalPrice < minOrderAmount) {
    throw createError(2003, `未达到起送金额，还差${((minOrderAmount - totalPrice) / 100).toFixed(2)}元`)
  }

  // 计算包装费
  const packingFee = merchant.packing_fee || 0

  // 计算配送费（到店自取不收配送费）
  let deliveryFee = 0
  if (delivery_type === DELIVERY_TYPE.DELIVERY) {
    const distance = typeof distanceMeters === 'number' ? distanceMeters : null
    deliveryFee = calcDeliveryFee(merchant.delivery_fee_rules || [], distance)
    if (deliveryFee === -1) {
      throw createError(2003, '您的位置超出配送范围')
    }
  }

  // 加载商户有效促销活动（满减配送费）
  const now = new Date()
  const { data: activePromotions } = await promotionsCol.where({
    merchant_id: merchantId,
    status: 'active'
  }).limit(20).get()

  let promotionDiscount = 0
  let appliedPromotion = null
  for (const promo of activePromotions) {
    if (promo.type !== 'delivery_discount') continue
    // 检查时间有效性
    if (promo.start_time && new Date(promo.start_time) > now) continue
    if (promo.end_time && new Date(promo.end_time) < now) continue
    // 检查满足条件
    if (totalPrice >= promo.min_amount) {
      const discount = Math.min(promo.discount_amount, deliveryFee)
      if (discount > promotionDiscount) {
        promotionDiscount = discount
        appliedPromotion = { _id: promo._id, name: promo.name, discount_amount: discount }
      }
    }
  }
  deliveryFee = Math.max(0, deliveryFee - promotionDiscount)

  // 应用优惠券/红包
  let couponDiscount = 0
  let appliedCoupon = null
  if (couponId) {
    const { data: coupon } = await userCouponsCol.doc(couponId).get().catch(() => ({ data: null }))
    if (!coupon) throw createError(2004, '优惠券不存在')
    if (coupon.user_id !== _openid) throw createError(2004, '无权使用该优惠券')
    if (coupon.status !== 'unused') throw createError(2004, '该优惠券已使用或已过期')
    if (coupon.expired_at && new Date(coupon.expired_at) < now) {
      throw createError(2004, '该优惠券已过期')
    }
    const minAmount = coupon.min_order_amount || 0
    if (totalPrice < minAmount) {
      throw createError(2004, `使用该优惠券需订单满${(minAmount / 100).toFixed(2)}元`)
    }
    couponDiscount = coupon.amount
    appliedCoupon = { _id: coupon._id, name: coupon.name, amount: coupon.amount }
  }

  const totalDiscount = promotionDiscount + couponDiscount
  const actualPrice = Math.max(1, totalPrice + packingFee + deliveryFee - couponDiscount)

  const dbNow = db.serverDate()
  const orderNo = generateOrderNo()

  const distance = delivery_type === DELIVERY_TYPE.DELIVERY ? (typeof distanceMeters === 'number' ? distanceMeters : null) : null

  const orderData = {
    order_no: orderNo,
    user_id: _openid,
    merchant_id: merchantId,
    merchant_name: merchant.shop_name,
    merchant_avatar: merchant.shop_avatar || '',
    items: orderItems,
    total_price: totalPrice,
    packing_fee: packingFee,
    delivery_fee: deliveryFee + promotionDiscount, // 原始配送费（促销折扣前）
    delivery_fee_actual: deliveryFee,              // 实际收取配送费
    promotion_discount: promotionDiscount,
    coupon_discount: couponDiscount,
    total_discount: totalDiscount,
    applied_promotion: appliedPromotion,
    applied_coupon: appliedCoupon,
    actual_price: actualPrice,
    distance_meters: distance,
    delivery_type,
    delivery_address: delivery_type === DELIVERY_TYPE.DELIVERY ? delivery_address : null,
    status: USE_REAL_PAYMENT ? STATUS.PENDING_PAY : STATUS.PENDING_ACCEPT,
    remark: remark.substring(0, 200),
    cancel_reason: '',
    payment_id: '',
    paid_at: null,
    accepted_at: null,
    ready_at: null,
    dispatching_at: null,
    rider_id: null,
    rider_name: null,
    delivering_at: null,
    completed_at: null,
    cancelled_at: null,
    is_reviewed: false,
    is_settled: false,
    created_at: dbNow,
    updated_at: dbNow
  }

  const { _id } = await ordersCol.add({ data: orderData })

  // 标记优惠券为已使用（预锁定，支付失败后可解锁）
  if (couponId && appliedCoupon) {
    await userCouponsCol.doc(couponId).update({
      data: {
        status: 'used',
        order_id: _id,
        used_at: dbNow
      }
    })
  }

  const notifyData = { orderId: _id, orderNo, merchantName: merchant.shop_name, actualPrice, createTime: new Date() }

  // 真实支付模式：调用微信支付
  if (USE_REAL_PAYMENT) {
    try {
      const payHelper = getMerchantPayHelper(merchant)
      const { payParams } = await payHelper.createJSAPIOrder({
        outTradeNo: orderNo,
        description: `胖兄弟外卖-${merchant.shop_name}`,
        totalAmount: actualPrice,
        payerOpenid: _openid,
        profitSharing: true
      })
      return { orderId: _id, orderNo, actualPrice, payParams }
    } catch (err) {
      // 支付初始化失败，但订单已创建（PENDING_PAY）
      // 返回 orderId 让前端跳转到订单详情，用户可在详情页重新发起支付
      console.error('[create] 支付初始化失败，订单已创建:', err.message)
      return { orderId: _id, orderNo, actualPrice, payInitError: err.message || '支付初始化失败，请在订单详情中重试' }
    }
  }

  // 模拟支付模式：直接通知商户有新订单、通知用户下单成功
  const itemNames = orderItems.map(i => `${i.name}x${i.quantity}`).join(' ')
  const { data: merchantOwner } = await usersCol.doc(merchant.user_id).get().catch(() => ({ data: null }))
  sendNotify('NEW_ORDER', merchantOwner ? merchantOwner._openid : '', { ...notifyData, itemSummary: itemNames })
  sendNotify('ORDER_SUBMITTED', _openid, notifyData)

  return {
    orderId: _id,
    orderNo,
    actualPrice
  }
}

/**
 * 获取当前用户可用于某商户订单的优惠券列表
 * 入参: merchantId (可选，用于过滤指定商户的券), totalPrice (商品总金额，用于筛选可用券)
 */
async function getUserCoupons(event) {
  const { _openid, totalPrice = 0 } = event
  const now = new Date()

  const { data: coupons } = await userCouponsCol.where({
    user_id: _openid,
    status: 'unused'
  }).orderBy('amount', 'desc').limit(50).get()

  // 过滤过期的，并标记是否可用
  const result = coupons.map(c => {
    const expired = c.expired_at && new Date(c.expired_at) < now
    const meetMinAmount = totalPrice >= (c.min_order_amount || 0)
    return {
      _id: c._id,
      name: c.name,
      amount: c.amount,
      min_order_amount: c.min_order_amount || 0,
      expired_at: c.expired_at,
      is_available: !expired && meetMinAmount,
      is_expired: expired
    }
  }).filter(c => !c.is_expired)

  return { coupons: result }
}

/**
 * S5-2: 获取订单列表
 *
 * 入参:
 *   status - 筛选状态（可选，空=全部；支持数组形式查询多状态）
 *   page - 页码（默认1）
 *   pageSize - 每页条数（默认20）
 */
async function getList(event) {
  const { _openid, status, page = 1, pageSize = 20 } = event

  const query = { user_id: _openid }
  if (Array.isArray(status) && status.length > 0) {
    query.status = _.in(status)
  } else if (status) {
    query.status = status
  }

  const countResult = await ordersCol.where(query).count()
  const total = countResult.total
  const skip = (page - 1) * pageSize

  const { data: list } = await ordersCol.where(query)
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return {
    list,
    total,
    hasMore: skip + list.length < total
  }
}

/**
 * S5-3: 获取订单详情
 *
 * 入参:
 *   orderId - 订单ID
 */
async function getDetail(event) {
  const { _openid, orderId } = event

  if (!orderId) {
    throw createError(1001, '缺少订单ID')
  }

  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) {
    throw createError(2001, '订单不存在')
  }

  // Verify ownership (user or merchant)
  if (order.user_id !== _openid && order.merchant_id !== _openid) {
    throw createError(2001, '无权查看此订单')
  }

  return { order }
}

/**
 * S5-4: 用户取消订单 / 申请退款
 *
 * 入参:
 *   orderId - 订单ID
 *   reason  - 取消/退款原因（ACCEPTED 状态时必填）
 *
 * 支持状态：
 *   PENDING_PAY    → 直接取消（无需退款，未付款）
 *   PENDING_ACCEPT → 取消并退款
 *   ACCEPTED       → 申请退款（出餐前仍可退）
 */
async function cancel(event) {
  const { _openid, orderId, reason = '' } = event

  if (!orderId) {
    throw createError(1001, '缺少订单ID')
  }

  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) {
    throw createError(2001, '订单不存在')
  }

  if (order.user_id !== _openid) {
    throw createError(2001, '无权操作此订单')
  }

  const cancellableStatuses = [STATUS.PENDING_PAY, STATUS.PENDING_ACCEPT, STATUS.ACCEPTED]
  if (!cancellableStatuses.includes(order.status)) {
    throw createError(2002, '当前状态不可申请退款，餐品已备好或订单已完成')
  }

  // ACCEPTED 状态退款时要求填写原因
  if (order.status === STATUS.ACCEPTED && !reason.trim()) {
    throw createError(1001, '请填写退款原因')
  }

  const dbNow = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: {
      status: STATUS.CANCELLED,
      cancel_reason: reason.substring(0, 200),
      cancelled_at: dbNow,
      updated_at: dbNow
    }
  })

  // 释放已锁定的优惠券
  if (order.applied_coupon && order.applied_coupon._id) {
    await userCouponsCol.doc(order.applied_coupon._id).update({
      data: { status: 'unused', order_id: null, used_at: null }
    }).catch(() => {})
  }

  // 已付款订单（PENDING_ACCEPT / ACCEPTED）自动发起退款
  if (order.status !== STATUS.PENDING_PAY && order.payment_id) {
    await createRefund({ _openid, orderId, reason: reason || '用户申请退款' }).catch(err => {
      console.warn(`[cancel] auto createRefund failed for ${orderId}:`, err.message)
    })
  }

  // 通知商家（静默，不影响主流程）
  if (order.merchant_id) {
    const { data: merchants } = await merchantsCol.doc(order.merchant_id).get().catch(() => ({ data: null }))
    if (merchants && merchants._openid) {
      sendNotify('ORDER_CANCELLED', merchants._openid, order).catch(() => {})
    }
  }

  return { orderId }
}

// ============================================================
// S6: B端商户操作
// ============================================================

/**
 * 查找当前 openid 对应的商户，验证 active 状态
 */
async function getMerchantByOpenid(openid) {
  const { data: users } = await usersCol.where({ _openid: openid }).limit(1).get()
  if (!users || users.length === 0) {
    throw createError(1002, '用户未登录')
  }
  const { data } = await merchantsCol.where({ user_id: users[0]._id, status: 'active' }).limit(1).get()
  if (!data || data.length === 0) {
    throw createError(2001, '商户不存在或未激活')
  }
  return data[0]
}

/**
 * S6-1: 商户获取订单列表
 */
async function getMerchantOrders(event) {
  const { _openid, status, page = 1, pageSize = 20 } = event
  const merchant = await getMerchantByOpenid(_openid)

  const query = { merchant_id: merchant._id }
  if (status) {
    query.status = status
  }

  const countResult = await ordersCol.where(query).count()
  const total = countResult.total
  const skip = (page - 1) * pageSize

  const { data: list } = await ordersCol.where(query)
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  // Also return counts per status for tab badges
  const [pendingCount, acceptedCount, readyCount, dispatchingCount] = await Promise.all([
    ordersCol.where({ merchant_id: merchant._id, status: STATUS.PENDING_ACCEPT }).count(),
    ordersCol.where({ merchant_id: merchant._id, status: STATUS.ACCEPTED }).count(),
    ordersCol.where({ merchant_id: merchant._id, status: STATUS.READY }).count(),
    ordersCol.where({ merchant_id: merchant._id, status: STATUS.DISPATCHING }).count()
  ])

  return {
    list,
    total,
    hasMore: skip + list.length < total,
    counts: {
      pendingAccept: pendingCount.total,
      accepted: acceptedCount.total,
      ready: readyCount.total,
      dispatching: dispatchingCount.total
    }
  }
}

/**
 * S6-2: 商户接单
 */
async function accept(event) {
  const { _openid, orderId } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  const merchant = await getMerchantByOpenid(_openid)
  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')
  if (order.merchant_id !== merchant._id) throw createError(2001, '无权操作此订单')
  if (order.status !== STATUS.PENDING_ACCEPT) throw createError(2002, '当前状态不可接单')

  const now = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: { status: STATUS.ACCEPTED, accepted_at: now, updated_at: now }
  })

  // S7-10: 通知用户商家已接单
  sendNotify('MERCHANT_ACCEPTED', order.user_id, {
    orderId, orderNo: order.order_no, merchantName: order.merchant_name,
    createTime: order.created_at
  })

  return { orderId }
}

/**
 * S6-3: 商户拒单
 */
async function reject(event) {
  const { _openid, orderId, reason = '' } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  const merchant = await getMerchantByOpenid(_openid)
  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')
  if (order.merchant_id !== merchant._id) throw createError(2001, '无权操作此订单')
  if (order.status !== STATUS.PENDING_ACCEPT) throw createError(2002, '当前状态不可拒单')

  const cancelReason = `商家拒单：${reason}`.substring(0, 200)
  const dbNow = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: {
      status: STATUS.CANCELLED,
      cancel_reason: cancelReason,
      cancelled_at: dbNow,
      updated_at: dbNow
    }
  })

  // 释放已锁定的优惠券
  if (order.applied_coupon && order.applied_coupon._id) {
    await userCouponsCol.doc(order.applied_coupon._id).update({
      data: { status: 'unused', order_id: null, used_at: null }
    }).catch(() => {})
  }

  // S7-10: 通知用户订单已取消
  sendNotify('ORDER_CANCELLED', order.user_id, {
    orderId, orderNo: order.order_no, cancelReason,
    actualPrice: order.actual_price
  })

  return { orderId }
}

/**
 * 生成4位数字取餐码（1000-9999）
 */
function generatePickupCode() {
  return String(Math.floor(Math.random() * 9000) + 1000)
}

/**
 * S6-4: 商户标记出餐
 * - 到店自取订单 → READY，取餐码给用户看
 * - 外卖配送订单 → DISPATCHING，取餐码给骑手取货用
 */
async function markReady(event) {
  const { _openid, orderId } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  const merchant = await getMerchantByOpenid(_openid)
  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')
  if (order.merchant_id !== merchant._id) throw createError(2001, '无权操作此订单')
  if (order.status !== STATUS.ACCEPTED) throw createError(2002, '当前状态不可标记出餐')

  const now = db.serverDate()
  const pickupCode = generatePickupCode()
  const isDelivery = order.delivery_type === DELIVERY_TYPE.DELIVERY

  if (isDelivery) {
    // 配送订单：进入骑手抢单大厅
    await ordersCol.doc(orderId).update({
      data: { status: STATUS.DISPATCHING, dispatching_at: now, updated_at: now, pickup_code: pickupCode }
    })
    // 无需通知用户，等骑手接单后通知
  } else {
    // 自取订单：通知用户取餐
    await ordersCol.doc(orderId).update({
      data: { status: STATUS.READY, ready_at: now, updated_at: now, pickup_code: pickupCode }
    })
    sendNotify('FOOD_READY', order.user_id, {
      orderId, orderNo: order.order_no, merchantName: order.merchant_name
    })
  }

  return { orderId, pickupCode, isDelivery }
}

/**
 * 获取骑手抢单大厅（DISPATCHING状态订单）
 * 骑手可查看当前所有待接配送订单
 */
async function getDispatchingOrders(event) {
  const { _openid, page = 1, pageSize = 20 } = event

  // 验证骑手身份
  const { data: user } = await usersCol.doc(_openid).get().catch(() => ({ data: null }))
  if (!user || user.role !== 'rider') throw createError(2001, '仅骑手可查看抢单大厅')

  const ridersCol = db.collection('riders')
  const { data: riderProfile } = await ridersCol.where({ _openid }).limit(1).get().catch(() => ({ data: [] }))
  if (!riderProfile.length || riderProfile[0].status !== 'active') throw createError(2001, '骑手未激活，无法接单')
  if (!riderProfile[0].is_online) throw createError(2001, '请先上线后再接单')

  const skip = (page - 1) * pageSize
  const { data: list } = await ordersCol.where({
    status: STATUS.DISPATCHING
  }).orderBy('dispatching_at', 'asc').skip(skip).limit(pageSize).get()

  return { list, hasMore: list.length === pageSize }
}

/**
 * 骑手接单: DISPATCHING → DELIVERING
 */
async function riderAccept(event) {
  const { _openid, orderId } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  // 验证骑手身份
  const { data: user } = await usersCol.doc(_openid).get().catch(() => ({ data: null }))
  if (!user || user.role !== 'rider') throw createError(2001, '仅骑手可接单')

  const ridersCol = db.collection('riders')
  const { data: riderProfiles } = await ridersCol.where({ _openid }).limit(1).get().catch(() => ({ data: [] }))
  if (!riderProfiles.length || riderProfiles[0].status !== 'active') throw createError(2001, '骑手未激活')
  const riderProfile = riderProfiles[0]

  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')
  if (order.status !== STATUS.DISPATCHING) throw createError(2002, '订单已被他人接走或状态有误')

  const now = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: {
      status: STATUS.DELIVERING,
      rider_id: _openid,
      rider_name: riderProfile.real_name,
      delivering_at: now,
      updated_at: now
    }
  })

  // 通知用户骑手已接单
  sendNotify('RIDER_ACCEPTED', order.user_id, {
    orderId, orderNo: order.order_no, merchantName: order.merchant_name, riderName: riderProfile.real_name
  })

  return { orderId }
}

/**
 * 骑手完成配送（用户确认收货）: DELIVERING → COMPLETED
 */
async function riderComplete(event) {
  const { _openid, orderId } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')
  // 用户或骑手均可触发完成
  if (order.user_id !== _openid && order.rider_id !== _openid) throw createError(2001, '无权操作此订单')
  if (order.status !== STATUS.DELIVERING) throw createError(2002, '当前状态不可确认收货')

  const now = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: { status: STATUS.COMPLETED, completed_at: now, updated_at: now }
  })

  // 记录骑手配送收益（仅记账）
  if (order.rider_id) {
    const ridersCol = db.collection('riders')
    await ridersCol.where({ _openid: order.rider_id }).update({
      data: {
        total_orders: _.inc(1),
        total_earnings_cents: _.inc(order.delivery_fee_actual || 0)
      }
    }).catch(() => {})
  }

  // 触发分账结算
  try {
    await settlement({ orderId })
  } catch (err) {
    console.warn('[riderComplete] 自动结算失败:', err.message)
  }

  return { orderId }
}

/**
 * S6-5: 商户确认完成
 */
async function complete(event) {
  const { _openid, orderId } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  const merchant = await getMerchantByOpenid(_openid)
  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')
  if (order.merchant_id !== merchant._id) throw createError(2001, '无权操作此订单')
  if (order.status !== STATUS.READY) throw createError(2002, '当前状态不可完成')

  const now = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: { status: STATUS.COMPLETED, completed_at: now, updated_at: now }
  })

  // S7-10: 订单完成后自动触发分账结算
  try {
    await settlement({ orderId })
  } catch (err) {
    console.warn('[complete] 自动结算失败:', err.message)
  }

  return { orderId }
}

/**
 * S6-5b: 用户确认取餐 → 订单直接进入完成状态
 */
async function userComplete(event) {
  const { _openid, orderId } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')
  if (order.user_id !== _openid) throw createError(2001, '无权操作此订单')
  if (order.status !== STATUS.READY) throw createError(2002, '当前状态不可确认取餐')

  const now = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: { status: STATUS.COMPLETED, completed_at: now, updated_at: now }
  })

  // 订单完成后自动触发分账结算
  try {
    await settlement({ orderId })
  } catch (err) {
    console.warn('[userComplete] 自动结算失败:', err.message)
  }

  return { orderId }
}

/**
 * S6-7: 定时触发 - 超时30分钟自动取消 PENDING_ACCEPT 订单
 * 配置定时触发器: 每5分钟执行一次
 */
async function autoCancel() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
  const now = db.serverDate()

  // 查找超时的待接单和待支付订单
  const { data: expiredOrders } = await ordersCol.where({
    status: _.in([STATUS.PENDING_ACCEPT, STATUS.PENDING_PAY]),
    created_at: _.lt(thirtyMinutesAgo)
  }).limit(100).get()

  let cancelledCount = 0
  for (const order of expiredOrders) {
    await ordersCol.doc(order._id).update({
      data: {
        status: STATUS.CANCELLED,
        cancel_reason: '超时未接单，系统自动取消',
        cancelled_at: now,
        updated_at: now
      }
    })
    // 释放已锁定的优惠券
    if (order.applied_coupon && order.applied_coupon._id) {
      await userCouponsCol.doc(order.applied_coupon._id).update({
        data: { status: 'unused', order_id: null, used_at: null }
      }).catch(() => {})
    }
    cancelledCount++
  }

  return { cancelledCount }
}

// ============================================================
// S7: 微信支付相关
// ============================================================

/**
 * 从商户信息构建 WechatPayHelper 实例
 * 商户必须在 merchants 集合中配置 payment_config
 */
function getMerchantPayHelper(merchant) {
  const config = merchant.payment_config
  if (!config || !config.mch_id || !config.api_key_v3 || !config.serial_no || !config.private_key) {
    throw createError(2001, '商户支付配置不完整，请联系管理员')
  }
  return new WechatPayHelper(config)
}

/**
 * S7-1: 创建支付订单（用于前端重新发起支付，如 PENDING_PAY 状态的订单）
 *
 * 入参:
 *   orderId - 订单ID（已存在的待支付订单）
 *
 * 返回: payParams（前端调 wx.requestPayment 所需参数）
 */
async function createPayment(event) {
  const { _openid, orderId } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')
  if (order.user_id !== _openid) throw createError(2001, '无权操作此订单')
  if (order.status !== STATUS.PENDING_PAY) throw createError(2002, '订单状态不支持支付')

  const { data: merchant } = await merchantsCol.doc(order.merchant_id).get().catch(() => ({ data: null }))
  if (!merchant) throw createError(2001, '商户不存在')

  const payHelper = getMerchantPayHelper(merchant)
  const { payParams } = await payHelper.createJSAPIOrder({
    outTradeNo: order.order_no,
    description: `胖兄弟外卖-${merchant.shop_name}`,
    totalAmount: order.actual_price,
    payerOpenid: _openid,
    profitSharing: true
  })

  return { orderId, payParams }
}

/**
 * S7-1b: 主动查询并同步支付状态（补单机制）
 *
 * 场景：wx.requestPayment 成功但回调未及时到达时，前端主动调用此接口
 * 查询微信支付侧的真实状态，若已支付则立即更新订单状态。
 *
 * 入参:
 *   orderId - 订单ID
 *
 * 返回: { orderId, status, synced }
 *   synced=true 表示本次调用完成了状态更新
 */
async function syncPaymentStatus(event) {
  const { _openid, orderId } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')
  if (order.user_id !== _openid) throw createError(2001, '无权操作此订单')

  // 仅待支付订单需要主动查询
  if (order.status !== STATUS.PENDING_PAY) {
    return { orderId, status: order.status, synced: false }
  }

  if (!USE_REAL_PAYMENT) {
    return { orderId, status: order.status, synced: false }
  }

  const { data: merchant } = await merchantsCol.doc(order.merchant_id).get().catch(() => ({ data: null }))
  if (!merchant) throw createError(2001, '商户不存在')

  const payHelper = getMerchantPayHelper(merchant)
  let tradeInfo
  try {
    tradeInfo = await payHelper.queryOrder(order.order_no)
  } catch (err) {
    // 查单失败（如订单未生成）不影响流程
    console.warn('[syncPaymentStatus] queryOrder failed:', err.message || err)
    return { orderId, status: order.status, synced: false }
  }

  if (tradeInfo.trade_state !== 'SUCCESS') {
    return { orderId, status: order.status, synced: false, tradeState: tradeInfo.trade_state }
  }

  // 校验金额
  if (tradeInfo.amount && tradeInfo.amount.total !== order.actual_price) {
    console.error('[syncPaymentStatus] 金额不匹配', tradeInfo.amount.total, order.actual_price)
    throw createError(4002, '支付金额不匹配')
  }

  // 防止并发重复更新
  const { data: freshOrder } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!freshOrder || freshOrder.status !== STATUS.PENDING_PAY) {
    return { orderId, status: freshOrder ? freshOrder.status : order.status, synced: false }
  }

  const now = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: {
      status: STATUS.PENDING_ACCEPT,
      payment_id: tradeInfo.transaction_id || '',
      paid_at: now,
      updated_at: now
    }
  })

  // 通知商户有新订单、通知用户下单成功
  const itemNames = (order.items || []).map(i => `${i.name}x${i.quantity}`).join(' ')
  const notifyData = {
    orderId: order._id, orderNo: order.order_no,
    merchantName: order.merchant_name, actualPrice: order.actual_price,
    createTime: order.created_at
  }
  const { data: merchantOwner } = await usersCol.doc(merchant.user_id).get().catch(() => ({ data: null }))
  sendNotify('NEW_ORDER', merchantOwner ? merchantOwner._openid : '', { ...notifyData, itemSummary: itemNames })
  sendNotify('ORDER_SUBMITTED', order.user_id, notifyData)

  return { orderId, status: STATUS.PENDING_ACCEPT, synced: true }
}

/**
 * S7-2: 支付回调处理
 *
 * 微信支付成功后回调此方法。
 * 调用方式: HTTP 触发 或 cloud.callFunction(通过网关转发)
 *
 * 入参(HTTP body):
 *   resource.ciphertext, resource.nonce, resource.associated_data
 *
 * 流程:
 *   1. 通过订单号找到订单 → 找到商户 → 用商户的 api_key_v3 解密
 *   2. 校验金额一致
 *   3. 更新订单状态 PENDING_PAY → PENDING_ACCEPT
 */
async function paymentNotify(event) {
  const { resource } = event
  if (!resource) throw createError(1001, '回调数据为空')

  const { ciphertext, nonce, associated_data } = resource

  // 从事件中取出 out_trade_no 先查订单（回调也会在 summary 中携带）
  // 注意: 实际中需要先从 resource.summary 或事件结构取 out_trade_no
  // 这里的实现假设回调网关已提取 out_trade_no
  const outTradeNo = event.out_trade_no || ''

  let order, merchant

  if (outTradeNo) {
    // 通过订单号查找
    const { data: orders } = await ordersCol.where({ order_no: outTradeNo }).limit(1).get()
    if (!orders || orders.length === 0) throw createError(2001, '订单不存在')
    order = orders[0]

    const { data: m } = await merchantsCol.doc(order.merchant_id).get().catch(() => ({ data: null }))
    if (!m) throw createError(2001, '商户不存在')
    merchant = m
  } else {
    // 兜底: 需要遍历尝试解密（不推荐，生产中应确保传入 out_trade_no）
    throw createError(1001, '缺少订单号信息')
  }

  // 用商户的 api_key_v3 解密回调数据
  const payHelper = getMerchantPayHelper(merchant)
  const decrypted = payHelper.decryptResource(ciphertext, nonce, associated_data)

  // 校验
  if (decrypted.trade_state !== 'SUCCESS') {
    return { handled: true, message: '非成功状态，忽略' }
  }

  // 防止重复处理
  if (order.status !== STATUS.PENDING_PAY) {
    return { handled: true, message: '订单已处理' }
  }

  // 校验金额
  if (decrypted.amount && decrypted.amount.total !== order.actual_price) {
    console.error('[paymentNotify] 金额不匹配', decrypted.amount.total, order.actual_price)
    throw createError(4002, '支付金额不匹配')
  }

  // 更新订单状态
  const now = db.serverDate()
  await ordersCol.doc(order._id).update({
    data: {
      status: STATUS.PENDING_ACCEPT,
      payment_id: decrypted.transaction_id || '',
      paid_at: now,
      updated_at: now
    }
  })

  // S7-10: 支付成功后通知商户新订单、通知用户下单成功
  const itemNames = (order.items || []).map(i => `${i.name}x${i.quantity}`).join(' ')
  const notifyData = {
    orderId: order._id, orderNo: order.order_no,
    merchantName: order.merchant_name, actualPrice: order.actual_price,
    createTime: order.created_at
  }
  const { data: merchantOwner } = await usersCol.doc(merchant.user_id).get().catch(() => ({ data: null }))
  sendNotify('NEW_ORDER', merchantOwner ? merchantOwner._openid : '', { ...notifyData, itemSummary: itemNames })
  sendNotify('ORDER_SUBMITTED', order.user_id, notifyData)

  return { handled: true, orderId: order._id }
}

/**
 * S7-3: 发起退款
 *
 * 入参:
 *   orderId - 订单ID
 *   reason - 退款原因（可选）
 *
 * 场景:
 *   - 商户拒单后自动退款
 *   - 用户取消后退款
 *   - 超时未接单自动退款
 *
 * 流程:
 *   1. 如果已分账 → 先回退分账 → 再退款
 *   2. 如果未分账 → 直接退款
 */
async function createRefund(event) {
  const { _openid, orderId, reason } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')

  // 仅已取消的订单可退款
  if (order.status !== STATUS.CANCELLED) {
    throw createError(2002, '当前状态不可退款')
  }

  // 模拟模式下无需真实退款
  if (!USE_REAL_PAYMENT || !order.payment_id) {
    return { orderId, refunded: false, message: '模拟模式无需退款' }
  }

  const { data: merchant } = await merchantsCol.doc(order.merchant_id).get().catch(() => ({ data: null }))
  if (!merchant) throw createError(2001, '商户不存在')

  const payHelper = getMerchantPayHelper(merchant)

  // 如果已分账，先回退分账
  if (order.is_settled) {
    const { data: settlements } = await settlementsCol.where({
      order_id: orderId,
      status: 'completed'
    }).limit(1).get()

    if (settlements && settlements.length > 0) {
      const stl = settlements[0]
      try {
        await payHelper.profitSharingReturn({
          outReturnNo: `R${order.order_no}`,
          outOrderNo: `S${order.order_no}`,
          returnMchId: PLATFORM_CONFIG.platformMchId,
          amount: stl.commission_amount,
          description: '退款回退分账'
        })
        // 更新结算状态
        await settlementsCol.doc(stl._id).update({
          data: { status: 'reversed' }
        })
      } catch (err) {
        console.error('[createRefund] 分账回退失败:', err)
        throw createError(5001, '分账回退失败，请联系客服')
      }
    }
  }

  // 发起退款
  const refundNo = `RF${order.order_no}`
  try {
    await payHelper.createRefund({
      transactionId: order.payment_id,
      outRefundNo: refundNo,
      totalAmount: order.actual_price,
      refundAmount: order.actual_price,
      reason: reason || order.cancel_reason || '订单取消退款'
    })
  } catch (err) {
    console.error('[createRefund] 退款失败:', err)
    throw createError(5001, '退款失败，请联系客服')
  }

  const now = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: { refund_no: refundNo, refunded_at: now, updated_at: now }
  })

  return { orderId, refunded: true, refundNo }
}

/**
 * S7-4: 订单分账（佣金结算）
 *
 * 订单完成后触发，将佣金从商户账户分给平台（和推荐人）。
 *
 * 入参:
 *   orderId - 订单ID
 *
 * 分账规则 (参见 PRD 5.3):
 *   佣金 = 订单金额 × commissionRate
 *   - 无推荐人: 100% → 平台
 *   - 有直接推荐人: 50% → 推荐人, 50% → 平台
 *   - 有间接推荐人: 50% → 直接推荐人, 25% → 间接推荐人, 25% → 平台
 */
async function settlement(event) {
  const { orderId } = event
  if (!orderId) throw createError(1001, '缺少订单ID')

  const { data: order } = await ordersCol.doc(orderId).get().catch(() => ({ data: null }))
  if (!order) throw createError(2001, '订单不存在')
  if (order.status !== STATUS.COMPLETED) throw createError(2002, '仅已完成订单可结算')
  if (order.is_settled) throw createError(2002, '订单已结算')

  const { data: merchant } = await merchantsCol.doc(order.merchant_id).get().catch(() => ({ data: null }))
  if (!merchant) throw createError(2001, '商户不存在')

  // 计算佣金
  const commissionRate = PLATFORM_CONFIG.commissionRate
  const commissionAmount = Math.floor(order.actual_price * commissionRate)

  // 根据推荐关系计算分成
  let platformAmount = commissionAmount
  let referrerAmount = 0
  let indirectReferrerAmount = 0

  if (merchant.referrer_id && merchant.indirect_referrer_id) {
    // 二级推荐: 直接推荐人50%, 间接推荐人25%, 平台25%
    referrerAmount = Math.floor(commissionAmount * 0.5)
    indirectReferrerAmount = Math.floor(commissionAmount * 0.25)
    platformAmount = commissionAmount - referrerAmount - indirectReferrerAmount
  } else if (merchant.referrer_id) {
    // 一级推荐: 推荐人50%, 平台50%
    referrerAmount = Math.floor(commissionAmount * 0.5)
    platformAmount = commissionAmount - referrerAmount
  }

  const now = db.serverDate()
  const settlementData = {
    order_id: orderId,
    merchant_id: merchant._id,
    order_amount: order.actual_price,
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
    platform_amount: platformAmount,
    referrer_amount: referrerAmount,
    indirect_referrer_amount: indirectReferrerAmount,
    referrer_id: merchant.referrer_id || '',
    indirect_referrer_id: merchant.indirect_referrer_id || '',
    status: 'pending',
    created_at: now
  }

  const { _id: settlementId } = await settlementsCol.add({ data: settlementData })

  // 真实支付模式：调用微信分账 API
  if (USE_REAL_PAYMENT && order.payment_id) {
    const payHelper = getMerchantPayHelper(merchant)
    const receivers = [{
      type: 'MERCHANT_ID',
      account: PLATFORM_CONFIG.platformMchId,
      amount: platformAmount,
      description: '平台佣金'
    }]

    // 如果有推荐人且推荐人有商户号，添加推荐人为分账接收方
    if (referrerAmount > 0 && merchant.referrer_id) {
      const { data: referrer } = await merchantsCol.doc(merchant.referrer_id).get().catch(() => ({ data: null }))
      if (referrer && referrer.payment_config && referrer.payment_config.mch_id) {
        receivers.push({
          type: 'MERCHANT_ID',
          account: referrer.payment_config.mch_id,
          amount: referrerAmount,
          description: '推荐人分成'
        })
      } else {
        // 推荐人无支付账号，归入平台
        receivers[0].amount += referrerAmount
      }
    }

    if (indirectReferrerAmount > 0 && merchant.indirect_referrer_id) {
      const { data: indirectRef } = await merchantsCol.doc(merchant.indirect_referrer_id).get().catch(() => ({ data: null }))
      if (indirectRef && indirectRef.payment_config && indirectRef.payment_config.mch_id) {
        receivers.push({
          type: 'MERCHANT_ID',
          account: indirectRef.payment_config.mch_id,
          amount: indirectReferrerAmount,
          description: '间接推荐人分成'
        })
      } else {
        receivers[0].amount += indirectReferrerAmount
      }
    }

    try {
      await payHelper.profitSharing({
        transactionId: order.payment_id,
        outOrderNo: `S${order.order_no}`,
        receivers
      })
      await settlementsCol.doc(settlementId).update({ data: { status: 'completed' } })
    } catch (err) {
      console.error('[settlement] 分账失败:', err)
      // 分账失败不影响订单状态，记录为 pending 后续重试
    }
  } else {
    // 模拟模式直接标记完成
    await settlementsCol.doc(settlementId).update({ data: { status: 'completed' } })
  }

  // 标记订单已结算
  await ordersCol.doc(orderId).update({
    data: { is_settled: true, updated_at: now }
  })

  return {
    settlementId,
    commissionAmount,
    platformAmount,
    referrerAmount,
    indirectReferrerAmount
  }
}
