const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const ordersCol = db.collection('orders')
const merchantsCol = db.collection('merchants')
const productsCol = db.collection('products')

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
  cancel
}

exports.main = async (event, context) => {
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
    status: STATUS.PENDING_ACCEPT, // 模拟支付，直接跳到待接单
    remark: remark.substring(0, 200),
    cancel_reason: '',
    payment_id: '',
    paid_at: now,
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

  if (order.status !== STATUS.PENDING_ACCEPT) {
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
