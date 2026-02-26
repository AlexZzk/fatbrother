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
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
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
  autoCancel,
  // S7: 支付相关
  createPayment,
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
    const qs = event.queryStringParameters || {}
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {})
    const outTradeNo = qs.out_trade_no || ''

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
 * S5-1: 创建订单
 *
 * 入参:
 *   merchantId - 商家ID
 *   items - 购物车商品列表 [{ productId, productName, productImage, specs, quantity, unitPrice }]
 *   remark - 备注（可选）
 *
 * 流程:
 *   1. 校验商家状态
 *   2. 校验商品存在且在售，重新计算价格（防篡改）
 *   3. 生成订单快照
 *   4. 模拟支付 → 直接设为 PENDING_ACCEPT
 */
async function create(event) {
  const { _openid, merchantId, items, remark = '' } = event

  if (!merchantId || !items || !items.length) {
    throw createError(1001, '参数不完整')
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

  // Fees (reserved, 0 for now)
  const packingFee = 0
  const deliveryFee = 0
  const actualPrice = totalPrice + packingFee + deliveryFee

  const now = db.serverDate()
  const orderNo = generateOrderNo()

  const orderData = {
    order_no: orderNo,
    user_id: _openid,
    merchant_id: merchantId,
    merchant_name: merchant.shop_name,
    merchant_avatar: merchant.shop_avatar || '',
    items: orderItems,
    total_price: totalPrice,
    packing_fee: packingFee,
    delivery_fee: deliveryFee,
    actual_price: actualPrice,
    status: USE_REAL_PAYMENT ? STATUS.PENDING_PAY : STATUS.PENDING_ACCEPT,
    remark: remark.substring(0, 200),
    cancel_reason: '',
    payment_id: '',
    paid_at: null,
    accepted_at: null,
    ready_at: null,
    completed_at: null,
    cancelled_at: null,
    is_reviewed: false,
    is_settled: false,
    created_at: now,
    updated_at: now
  }

  const { _id } = await ordersCol.add({ data: orderData })

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
 * S5-2: 获取订单列表
 *
 * 入参:
 *   status - 筛选状态（可选，空=全部）
 *   page - 页码（默认1）
 *   pageSize - 每页条数（默认20）
 */
async function getList(event) {
  const { _openid, status, page = 1, pageSize = 20 } = event

  const query = { user_id: _openid }
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
 * S5-4: 用户取消订单
 *
 * 入参:
 *   orderId - 订单ID
 *   reason - 取消原因（可选）
 *
 * 仅 PENDING_ACCEPT 状态可取消
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

  if (order.status !== STATUS.PENDING_ACCEPT && order.status !== STATUS.PENDING_PAY) {
    throw createError(2002, '当前状态不可取消')
  }

  const now = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: {
      status: STATUS.CANCELLED,
      cancel_reason: reason.substring(0, 200),
      cancelled_at: now,
      updated_at: now
    }
  })

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
  const [pendingCount, acceptedCount, readyCount] = await Promise.all([
    ordersCol.where({ merchant_id: merchant._id, status: STATUS.PENDING_ACCEPT }).count(),
    ordersCol.where({ merchant_id: merchant._id, status: STATUS.ACCEPTED }).count(),
    ordersCol.where({ merchant_id: merchant._id, status: STATUS.READY }).count()
  ])

  return {
    list,
    total,
    hasMore: skip + list.length < total,
    counts: {
      pendingAccept: pendingCount.total,
      accepted: acceptedCount.total,
      ready: readyCount.total
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
  const now = db.serverDate()
  await ordersCol.doc(orderId).update({
    data: {
      status: STATUS.CANCELLED,
      cancel_reason: cancelReason,
      cancelled_at: now,
      updated_at: now
    }
  })

  // S7-10: 通知用户订单已取消
  sendNotify('ORDER_CANCELLED', order.user_id, {
    orderId, orderNo: order.order_no, cancelReason,
    actualPrice: order.actual_price
  })

  return { orderId }
}

/**
 * S6-4: 商户标记出餐
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
  await ordersCol.doc(orderId).update({
    data: { status: STATUS.READY, ready_at: now, updated_at: now }
  })

  // S7-10: 通知用户餐品已出餐
  sendNotify('FOOD_READY', order.user_id, {
    orderId, orderNo: order.order_no, merchantName: order.merchant_name
  })

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
