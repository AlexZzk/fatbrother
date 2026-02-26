const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('users')
const merchantsCollection = db.collection('merchants')
const promotionsCollection = db.collection('promotions')

/**
 * 商户模块云函数
 * 通过 action 字段路由到具体方法
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  const actions = {
    verifyInviteCode,
    apply,
    getApplyStatus,
    getMerchantInfo,
    updateSettings,
    toggleStatus,
    getInviteRecords,
    getNearbyList,
    getTodayStats,
    search,
    getPromotions,
    savePromotion,
    deletePromotion
  }

  if (!actions[action]) {
    return { code: 1001, message: `未知的 action: ${action}` }
  }

  try {
    return await actions[action](event, OPENID)
  } catch (err) {
    console.error(`[merchant/${action}] error:`, err)
    return { code: 9999, message: '系统内部错误' }
  }
}

/**
 * 验证邀请码有效性
 */
async function verifyInviteCode(event, openid) {
  const { code } = event
  if (!code) {
    return { code: 1001, message: '请输入邀请码' }
  }

  const normalizedCode = code.toUpperCase().trim()

  // 查找拥有该邀请码的商户
  const { data: merchants } = await merchantsCollection
    .where({ invite_code: normalizedCode, status: 'active' })
    .limit(1)
    .get()

  if (merchants.length === 0) {
    return { code: 2001, message: '邀请码无效或对应商户已停用' }
  }

  return {
    code: 0,
    message: 'success',
    data: {
      valid: true,
      referrerShopName: merchants[0].shop_name
    }
  }
}

/**
 * 提交入驻申请
 */
async function apply(event, openid) {
  const { invite_code, shop_name, contact_name, contact_phone, mch_id } = event

  // 参数验证
  if (!shop_name || !contact_name || !contact_phone) {
    return { code: 1001, message: '请填写完整信息' }
  }
  if (shop_name.length < 2 || shop_name.length > 20) {
    return { code: 1001, message: '店铺名称需要2-20个字符' }
  }
  if (!/^1\d{10}$/.test(contact_phone)) {
    return { code: 1001, message: '请输入正确的手机号' }
  }

  // 查找当前用户
  const { data: users } = await usersCollection
    .where({ _openid: openid })
    .limit(1)
    .get()
  if (users.length === 0) {
    return { code: 1002, message: '请先登录' }
  }
  const userId = users[0]._id

  // 检查是否已申请
  const { data: existingMerchants } = await merchantsCollection
    .where({ user_id: userId })
    .limit(1)
    .get()
  if (existingMerchants.length > 0) {
    const status = existingMerchants[0].status
    if (status === 'active') {
      return { code: 1005, message: '您已是商户，无需重复申请' }
    }
    if (status === 'pending') {
      return { code: 1005, message: '您已有待审核的申请' }
    }
  }

  // 验证邀请码（选填，不填则为顶级商家，佣金直接归平台）
  let referrerId = ''
  let indirectReferrerId = ''

  if (invite_code && invite_code.trim()) {
    const normalizedCode = invite_code.toUpperCase().trim()
    const { data: referrers } = await merchantsCollection
      .where({ invite_code: normalizedCode, status: 'active' })
      .limit(1)
      .get()
    if (referrers.length === 0) {
      return { code: 2001, message: '邀请码无效' }
    }

    const referrer = referrers[0]
    referrerId = referrer._id
    indirectReferrerId = referrer.referrer_id || ''
  }

  // 生成唯一邀请码（6位大写字母+数字）
  const newInviteCode = generateInviteCode()

  const now = db.serverDate()
  const merchantData = {
    user_id: userId,
    mch_id: mch_id || '',
    shop_name: shop_name.trim(),
    shop_avatar: '',
    shop_banner: '',
    announcement: '',
    contact_name: contact_name.trim(),
    contact_phone,
    status: 'pending',
    is_open: false,
    location: null,
    invite_code: newInviteCode,
    referrer_id: referrerId,
    indirect_referrer_id: indirectReferrerId,
    rating: 5.0,
    monthly_sales: 0,
    created_at: now,
    updated_at: now
  }

  const { _id } = await merchantsCollection.add({ data: merchantData })

  // 更新用户角色为 merchant
  await usersCollection.doc(userId).update({
    data: { role: 'merchant', updated_at: now }
  })

  return {
    code: 0,
    message: 'success',
    data: {
      merchantId: _id,
      status: 'pending'
    }
  }
}

/**
 * 查询当前用户的申请状态
 */
async function getApplyStatus(event, openid) {
  const { data: users } = await usersCollection
    .where({ _openid: openid })
    .limit(1)
    .get()
  if (users.length === 0) {
    return { code: 1002, message: '请先登录' }
  }

  const { data: merchants } = await merchantsCollection
    .where({ user_id: users[0]._id })
    .limit(1)
    .get()

  if (merchants.length === 0) {
    return {
      code: 0,
      message: 'success',
      data: { hasApplied: false, merchantInfo: null }
    }
  }

  const m = merchants[0]
  return {
    code: 0,
    message: 'success',
    data: {
      hasApplied: true,
      merchantInfo: {
        _id: m._id,
        shop_name: m.shop_name,
        contact_name: m.contact_name,
        contact_phone: m.contact_phone,
        status: m.status,
        invite_code: m.invite_code,
        is_open: m.is_open,
        created_at: m.created_at
      }
    }
  }
}

/**
 * 获取商户详细信息
 */
async function getMerchantInfo(event, openid) {
  const { merchantId } = event

  // 如果传了 merchantId，查指定商户（C端浏览用）
  if (merchantId) {
    const { data: merchant } = await merchantsCollection.doc(merchantId).get()
    if (!merchant) {
      return { code: 2002, message: '商户不存在' }
    }
    return { code: 0, message: 'success', data: { merchantInfo: merchant } }
  }

  // 否则查当前用户的商户信息
  const { data: users } = await usersCollection
    .where({ _openid: openid })
    .limit(1)
    .get()
  if (users.length === 0) {
    return { code: 1002, message: '请先登录' }
  }

  const { data: merchants } = await merchantsCollection
    .where({ user_id: users[0]._id })
    .limit(1)
    .get()

  if (merchants.length === 0) {
    return { code: 2002, message: '您还不是商户' }
  }

  return {
    code: 0,
    message: 'success',
    data: { merchantInfo: merchants[0] }
  }
}

/**
 * 更新店铺设置
 * 支持字段: shop_name, shop_avatar, shop_banner, announcement, contact_phone,
 *           min_order_amount, packing_fee, delivery_fee_rules
 */
async function updateSettings(event, openid) {
  const {
    shop_name, shop_avatar, shop_banner, announcement, contact_phone,
    min_order_amount, packing_fee, delivery_fee_rules
  } = event

  const { data: users } = await usersCollection
    .where({ _openid: openid })
    .limit(1)
    .get()
  if (users.length === 0) {
    return { code: 1002, message: '请先登录' }
  }

  const { data: merchants } = await merchantsCollection
    .where({ user_id: users[0]._id, status: 'active' })
    .limit(1)
    .get()
  if (merchants.length === 0) {
    return { code: 1003, message: '无权限或商户未激活' }
  }

  const updateData = { updated_at: db.serverDate() }
  if (shop_name !== undefined) updateData.shop_name = shop_name.trim()
  if (shop_avatar !== undefined) updateData.shop_avatar = shop_avatar
  if (shop_banner !== undefined) updateData.shop_banner = shop_banner
  if (announcement !== undefined) updateData.announcement = announcement.trim()
  if (contact_phone !== undefined) updateData.contact_phone = contact_phone

  // 费用设置（单位：分）
  if (min_order_amount !== undefined) {
    const val = parseInt(min_order_amount)
    if (isNaN(val) || val < 0) return { code: 1001, message: '起送价格式不正确' }
    updateData.min_order_amount = val
  }
  if (packing_fee !== undefined) {
    const val = parseInt(packing_fee)
    if (isNaN(val) || val < 0) return { code: 1001, message: '包装费格式不正确' }
    updateData.packing_fee = val
  }
  // delivery_fee_rules: Array<{ max_distance: number (meters, 0=unlimited), fee: number (cents, -1=no delivery) }>
  if (delivery_fee_rules !== undefined) {
    if (!Array.isArray(delivery_fee_rules)) return { code: 1001, message: '配送费规则格式不正确' }
    for (const rule of delivery_fee_rules) {
      if (typeof rule.max_distance !== 'number' || typeof rule.fee !== 'number') {
        return { code: 1001, message: '配送费规则格式不正确' }
      }
    }
    updateData.delivery_fee_rules = delivery_fee_rules
  }

  await merchantsCollection.doc(merchants[0]._id).update({ data: updateData })

  // 返回更新后的信息
  const { data: updated } = await merchantsCollection.doc(merchants[0]._id).get()
  return {
    code: 0,
    message: 'success',
    data: { merchantInfo: updated }
  }
}

/**
 * 切换营业状态（开店/闭店）
 */
async function toggleStatus(event, openid) {
  const { isOpen, location, locationName } = event

  const { data: users } = await usersCollection
    .where({ _openid: openid })
    .limit(1)
    .get()
  if (users.length === 0) {
    return { code: 1002, message: '请先登录' }
  }

  const { data: merchants } = await merchantsCollection
    .where({ user_id: users[0]._id, status: 'active' })
    .limit(1)
    .get()
  if (merchants.length === 0) {
    return { code: 1003, message: '无权限或商户未激活' }
  }

  const updateData = {
    is_open: !!isOpen,
    updated_at: db.serverDate()
  }

  // 开店时更新GPS位置和地址名称
  if (isOpen && location && location.latitude && location.longitude) {
    updateData.location = db.Geo.Point(location.longitude, location.latitude)
    // 同时存储独立的数字字段，避免 GeoPoint 反序列化格式不确定导致距离计算错误
    updateData.location_lat = location.latitude
    updateData.location_lng = location.longitude
    if (locationName) {
      updateData.location_name = locationName
    }
  }
  // 关店时清除定位信息
  if (!isOpen) {
    updateData.location_name = ''
  }

  await merchantsCollection.doc(merchants[0]._id).update({ data: updateData })

  return {
    code: 0,
    message: 'success',
    data: {
      is_open: !!isOpen
    }
  }
}

/**
 * 获取邀请记录（当前商户推荐的商户列表）
 */
async function getInviteRecords(event, openid) {
  const { data: users } = await usersCollection
    .where({ _openid: openid })
    .limit(1)
    .get()
  if (users.length === 0) {
    return { code: 1002, message: '请先登录' }
  }

  const { data: merchants } = await merchantsCollection
    .where({ user_id: users[0]._id })
    .limit(1)
    .get()
  if (merchants.length === 0) {
    return { code: 2002, message: '您还不是商户' }
  }

  const myMerchantId = merchants[0]._id

  // 直接推荐
  const { data: directReferrals } = await merchantsCollection
    .where({ referrer_id: myMerchantId })
    .orderBy('created_at', 'desc')
    .get()

  // 间接推荐
  const { data: indirectReferrals } = await merchantsCollection
    .where({ indirect_referrer_id: myMerchantId })
    .orderBy('created_at', 'desc')
    .get()

  const records = [
    ...directReferrals.map(r => ({
      _id: r._id,
      shop_name: r.shop_name,
      type: 'direct',
      status: r.status,
      created_at: r.created_at
    })),
    ...indirectReferrals
      .filter(r => r.referrer_id !== myMerchantId) // 排除直接推荐重复
      .map(r => ({
        _id: r._id,
        shop_name: r.shop_name,
        type: 'indirect',
        status: r.status,
        created_at: r.created_at
      }))
  ]

  return {
    code: 0,
    message: 'success',
    data: {
      records,
      directCount: directReferrals.length,
      indirectCount: indirectReferrals.filter(r => r.referrer_id !== myMerchantId).length
    }
  }
}

/**
 * 获取附近营业中的商家列表
 */
async function getNearbyList(event, openid) {
  const { latitude, longitude, page = 1, pageSize = 20 } = event

  // Query active & open merchants
  const query = { status: 'active', is_open: true }

  const { data: merchants } = await merchantsCollection
    .where(query)
    .limit(100)
    .get()

  // Calculate distance for each merchant and sort
  let list = merchants.map(m => {
    let distance = null
    if (latitude && longitude) {
      // 优先使用独立的数字字段（开店时写入，格式确定无歧义）
      let mLat = m.location_lat
      let mLng = m.location_lng
      // 兜底：从 GeoPoint 读取（同时兼容 {longitude,latitude} 和 {coordinates:[]} 两种格式）
      if ((!mLat || !mLng) && m.location) {
        const loc = m.location
        mLat = loc.latitude || (loc.coordinates && loc.coordinates[1])
        mLng = loc.longitude || (loc.coordinates && loc.coordinates[0])
      }
      if (mLat && mLng) {
        distance = calcDistance(latitude, longitude, mLat, mLng)
      }
    }
    return {
      _id: m._id,
      shop_name: m.shop_name,
      shop_avatar: m.shop_avatar || '',
      announcement: m.announcement || '',
      rating: m.rating || 5.0,
      monthly_sales: m.monthly_sales || 0,
      distance
    }
  })

  // Sort by distance (nulls last)
  list.sort((a, b) => {
    if (a.distance === null && b.distance === null) return 0
    if (a.distance === null) return 1
    if (b.distance === null) return -1
    return a.distance - b.distance
  })

  // Paginate
  const start = (page - 1) * pageSize
  const paged = list.slice(start, start + pageSize)

  return {
    code: 0,
    message: 'success',
    data: {
      list: paged,
      total: list.length,
      hasMore: start + pageSize < list.length
    }
  }
}

/**
 * Haversine distance calculation (meters)
 */
function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

/**
 * 生成6位邀请码（大写字母+数字）
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去除易混淆字符 I/O/0/1
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * S6-6: 获取商户今日统计数据
 */
async function getTodayStats(event, openid) {
  // Find user first, then merchant
  const { data: users } = await usersCollection.where({ _openid: openid }).limit(1).get()
  if (!users || users.length === 0) {
    return { code: 1002, message: '请先登录' }
  }

  const { data: merchants } = await merchantsCollection
    .where({ user_id: users[0]._id, status: 'active' })
    .limit(1)
    .get()

  if (!merchants || merchants.length === 0) {
    return { code: 2002, message: '商户不存在' }
  }

  const merchantId = merchants[0]._id
  const ordersCol = db.collection('orders')

  // Today's start (00:00:00)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get all paid orders today (includes in-progress and completed)
  const { data: paidOrders } = await ordersCol.where({
    merchant_id: merchantId,
    status: _.in(['PENDING_ACCEPT', 'ACCEPTED', 'READY', 'COMPLETED']),
    created_at: _.gte(today)
  }).limit(1000).get()

  // Get cancelled orders today (for refund count)
  const { data: cancelledOrders } = await ordersCol.where({
    merchant_id: merchantId,
    status: 'CANCELLED',
    created_at: _.gte(today)
  }).limit(1000).get()

  // Get pending counts
  const [pendingAcceptCount, acceptedCount] = await Promise.all([
    ordersCol.where({ merchant_id: merchantId, status: 'PENDING_ACCEPT' }).count(),
    ordersCol.where({ merchant_id: merchantId, status: 'ACCEPTED' }).count()
  ])

  const orderCount = paidOrders.length
  const revenue = paidOrders.reduce((sum, o) => sum + (o.actual_price || 0), 0)
  const refund = cancelledOrders.reduce((sum, o) => sum + (o.actual_price || 0), 0)

  return {
    code: 0,
    message: 'success',
    data: {
      orderCount,
      revenue,
      refund,
      pendingAccept: pendingAcceptCount.total,
      pendingReady: acceptedCount.total
    }
  }
}

/**
 * 获取附近商家列表时，返回起送价和配送费信息
 */
async function getNearbyList(event, openid) {
  const { latitude, longitude, page = 1, pageSize = 20 } = event

  // Query active & open merchants
  const query = { status: 'active', is_open: true }

  const { data: merchants } = await merchantsCollection
    .where(query)
    .limit(100)
    .get()

  // Calculate distance for each merchant and sort
  let list = merchants.map(m => {
    let distance = null
    if (latitude && longitude && m.location) {
      const loc = m.location
      const mLng = loc.longitude
      const mLat = loc.latitude
      if (mLat && mLng) {
        distance = calcDistance(latitude, longitude, mLat, mLng)
      }
    }
    return {
      _id: m._id,
      shop_name: m.shop_name,
      shop_avatar: m.shop_avatar || '',
      announcement: m.announcement || '',
      rating: m.rating || 5.0,
      monthly_sales: m.monthly_sales || 0,
      distance,
      min_order_amount: m.min_order_amount || 0,
      delivery_fee_rules: m.delivery_fee_rules || []
    }
  })

  // Sort by distance (nulls last)
  list.sort((a, b) => {
    if (a.distance === null && b.distance === null) return 0
    if (a.distance === null) return 1
    if (b.distance === null) return -1
    return a.distance - b.distance
  })

  // Paginate
  const start = (page - 1) * pageSize
  const paged = list.slice(start, start + pageSize)

  return {
    code: 0,
    message: 'success',
    data: {
      list: paged,
      total: list.length,
      hasMore: start + pageSize < list.length
    }
  }
}

/**
 * S7-7: 搜索商家（模糊匹配商家名 + 商品名）
 *
 * 入参:
 *   keyword - 搜索关键词
 *   page - 页码（默认1）
 *   pageSize - 每页条数（默认20）
 *
 * 仅返回 active + is_open 的商户
 */
async function search(event) {
  const { keyword, page = 1, pageSize = 20 } = event

  if (!keyword || !keyword.trim()) {
    return { code: 0, message: 'success', data: { list: [], total: 0, hasMore: false } }
  }

  const kw = keyword.trim()

  // 云开发数据库使用 RegExp 进行模糊搜索
  const nameRegex = db.RegExp({ regexp: kw, options: 'i' })

  // 1. 按商家名称搜索
  const { data: nameMatches } = await merchantsCollection
    .where({
      status: 'active',
      is_open: true,
      shop_name: nameRegex
    })
    .limit(100)
    .get()

  // 2. 按商品名称搜索（找到商品→取对应 merchant_id）
  const productsCol = db.collection('products')
  const { data: productMatches } = await productsCol
    .where({
      is_on_sale: true,
      name: nameRegex
    })
    .field({ merchant_id: true })
    .limit(100)
    .get()

  // 合并去重 merchant_id
  const matchedIds = new Set(nameMatches.map(m => m._id))
  const productMerchantIds = [...new Set(
    productMatches
      .map(p => p.merchant_id)
      .filter(id => !matchedIds.has(id))
  )]

  // 补充查询通过商品匹配到的商户
  let productMerchants = []
  if (productMerchantIds.length > 0) {
    const { data } = await merchantsCollection
      .where({
        _id: _.in(productMerchantIds),
        status: 'active',
        is_open: true
      })
      .limit(100)
      .get()
    productMerchants = data
  }

  // 合并结果
  const allMerchants = [...nameMatches, ...productMerchants]

  // 格式化输出
  const list = allMerchants.map(m => ({
    _id: m._id,
    shop_name: m.shop_name,
    shop_avatar: m.shop_avatar || '',
    announcement: m.announcement || '',
    rating: m.rating || 5.0,
    monthly_sales: m.monthly_sales || 0,
    distance: null
  }))

  // 分页
  const start = (page - 1) * pageSize
  const paged = list.slice(start, start + pageSize)

  return {
    code: 0,
    message: 'success',
    data: {
      list: paged,
      total: list.length,
      hasMore: start + pageSize < list.length
    }
  }
}

// ============================================================
// 营销活动（促销）管理
// promotions 集合结构:
//   merchant_id  - 商户ID
//   type         - 'delivery_discount' 满减配送费
//   name         - 活动名称，例如"满35减5"
//   min_amount   - 起效最低订单金额（分）
//   discount_amount - 优惠金额（分）
//   status       - 'active' | 'inactive'
//   start_time   - 活动开始时间（null=不限）
//   end_time     - 活动结束时间（null=不限）
//   created_at, updated_at
// ============================================================

/**
 * 获取当前商户的促销活动列表
 */
async function getPromotions(event, openid) {
  const { data: users } = await usersCollection
    .where({ _openid: openid }).limit(1).get()
  if (users.length === 0) return { code: 1002, message: '请先登录' }

  const { data: merchants } = await merchantsCollection
    .where({ user_id: users[0]._id, status: 'active' }).limit(1).get()
  if (merchants.length === 0) return { code: 1003, message: '无权限或商户未激活' }

  const { data: promotions } = await promotionsCollection
    .where({ merchant_id: merchants[0]._id })
    .orderBy('created_at', 'desc')
    .limit(50)
    .get()

  return { code: 0, message: 'success', data: { promotions } }
}

/**
 * 创建或更新促销活动
 * 入参: promotionId(可选), type, name, min_amount, discount_amount,
 *       status, start_time(可选), end_time(可选)
 */
async function savePromotion(event, openid) {
  const { promotionId, type, name, min_amount, discount_amount, status, start_time, end_time } = event

  if (!type || !name || min_amount === undefined || discount_amount === undefined) {
    return { code: 1001, message: '参数不完整' }
  }
  if (!['delivery_discount'].includes(type)) {
    return { code: 1001, message: '不支持的活动类型' }
  }
  if (typeof min_amount !== 'number' || min_amount < 0) {
    return { code: 1001, message: '起效金额格式不正确' }
  }
  if (typeof discount_amount !== 'number' || discount_amount <= 0) {
    return { code: 1001, message: '优惠金额格式不正确' }
  }

  const { data: users } = await usersCollection
    .where({ _openid: openid }).limit(1).get()
  if (users.length === 0) return { code: 1002, message: '请先登录' }

  const { data: merchants } = await merchantsCollection
    .where({ user_id: users[0]._id, status: 'active' }).limit(1).get()
  if (merchants.length === 0) return { code: 1003, message: '无权限或商户未激活' }

  const now = db.serverDate()
  const promotionData = {
    type,
    name: name.trim(),
    min_amount,
    discount_amount,
    status: status || 'active',
    start_time: start_time || null,
    end_time: end_time || null,
    updated_at: now
  }

  if (promotionId) {
    const { data: existing } = await promotionsCollection.doc(promotionId).get().catch(() => ({ data: null }))
    if (!existing || existing.merchant_id !== merchants[0]._id) {
      return { code: 1003, message: '无权操作该活动' }
    }
    await promotionsCollection.doc(promotionId).update({ data: promotionData })
    return { code: 0, message: 'success', data: { promotionId } }
  } else {
    promotionData.merchant_id = merchants[0]._id
    promotionData.created_at = now
    const { _id } = await promotionsCollection.add({ data: promotionData })
    return { code: 0, message: 'success', data: { promotionId: _id } }
  }
}

/**
 * 删除促销活动
 */
async function deletePromotion(event, openid) {
  const { promotionId } = event
  if (!promotionId) return { code: 1001, message: '缺少活动ID' }

  const { data: users } = await usersCollection
    .where({ _openid: openid }).limit(1).get()
  if (users.length === 0) return { code: 1002, message: '请先登录' }

  const { data: merchants } = await merchantsCollection
    .where({ user_id: users[0]._id, status: 'active' }).limit(1).get()
  if (merchants.length === 0) return { code: 1003, message: '无权限或商户未激活' }

  const { data: existing } = await promotionsCollection.doc(promotionId).get().catch(() => ({ data: null }))
  if (!existing || existing.merchant_id !== merchants[0]._id) {
    return { code: 1003, message: '无权操作该活动' }
  }

  await promotionsCollection.doc(promotionId).remove()
  return { code: 0, message: 'success' }
}
