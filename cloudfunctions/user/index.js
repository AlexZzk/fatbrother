const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('users')
const merchantsCollection = db.collection('merchants')
const couponActivitiesCollection = db.collection('coupon_activities')
const userCouponsCollection = db.collection('user_coupons')

/**
 * 用户模块云函数
 * 通过 action 字段路由到具体方法
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  const actions = {
    login,
    getUserInfo,
    updateProfile,
    getCouponActivities,
    claimCoupon,
    getUserCoupons,
    createCouponActivity
  }

  if (!actions[action]) {
    return { code: 1001, message: `未知的 action: ${action}` }
  }

  try {
    return await actions[action](event, OPENID)
  } catch (err) {
    console.error(`[user/${action}] error:`, err)
    return { code: 9999, message: '系统内部错误' }
  }
}

/**
 * 微信登录/注册
 * 如用户不存在则自动创建，返回用户信息
 */
async function login(event, openid) {
  // 查找已有用户
  const { data: existingUsers } = await usersCollection
    .where({ _openid: openid })
    .limit(1)
    .get()

  let userInfo
  let isNew = false

  if (existingUsers.length > 0) {
    // 已有用户，更新登录时间
    userInfo = existingUsers[0]
    await usersCollection.doc(userInfo._id).update({
      data: { updated_at: db.serverDate() }
    })
    userInfo.updated_at = new Date()
  } else {
    // 新用户，创建记录
    const now = db.serverDate()
    const newUser = {
      _openid: openid,
      nick_name: '',
      avatar_url: '',
      phone: '',
      role: 'user',
      created_at: now,
      updated_at: now
    }
    const { _id } = await usersCollection.add({ data: newUser })
    userInfo = { _id, _openid: openid, ...newUser }
    isNew = true
  }

  // 查询是否有关联商户
  let merchantInfo = null
  const { data: merchants } = await merchantsCollection
    .where({ user_id: userInfo._id })
    .limit(1)
    .get()

  if (merchants.length > 0) {
    merchantInfo = merchants[0]
  }

  return {
    code: 0,
    message: 'success',
    data: {
      userInfo: {
        _id: userInfo._id,
        nick_name: userInfo.nick_name,
        avatar_url: userInfo.avatar_url,
        phone: userInfo.phone,
        role: userInfo.role,
        created_at: userInfo.created_at
      },
      merchantInfo,
      isNew
    }
  }
}

/**
 * 获取当前用户信息
 */
async function getUserInfo(event, openid) {
  const { data: users } = await usersCollection
    .where({ _openid: openid })
    .limit(1)
    .get()

  if (users.length === 0) {
    return { code: 1002, message: '用户未登录或不存在' }
  }

  const userInfo = users[0]

  // 查询关联商户信息
  let merchantInfo = null
  const { data: merchants } = await merchantsCollection
    .where({ user_id: userInfo._id })
    .limit(1)
    .get()

  if (merchants.length > 0) {
    merchantInfo = merchants[0]
  }

  return {
    code: 0,
    message: 'success',
    data: {
      userInfo: {
        _id: userInfo._id,
        nick_name: userInfo.nick_name,
        avatar_url: userInfo.avatar_url,
        phone: userInfo.phone,
        role: userInfo.role,
        created_at: userInfo.created_at
      },
      merchantInfo
    }
  }
}

/**
 * 更新用户个人信息（昵称、头像）
 */
async function updateProfile(event, openid) {
  const { nick_name, avatar_url } = event

  // 查找用户
  const { data: users } = await usersCollection
    .where({ _openid: openid })
    .limit(1)
    .get()

  if (users.length === 0) {
    return { code: 1002, message: '用户未登录或不存在' }
  }

  const userId = users[0]._id
  const updateData = { updated_at: db.serverDate() }

  if (nick_name !== undefined) {
    updateData.nick_name = nick_name
  }
  if (avatar_url !== undefined) {
    updateData.avatar_url = avatar_url
  }

  await usersCollection.doc(userId).update({ data: updateData })

  // 返回更新后的信息
  const { data: updatedUser } = await usersCollection.doc(userId).get()

  return {
    code: 0,
    message: 'success',
    data: {
      userInfo: {
        _id: updatedUser._id,
        nick_name: updatedUser.nick_name,
        avatar_url: updatedUser.avatar_url,
        phone: updatedUser.phone,
        role: updatedUser.role,
        created_at: updatedUser.created_at
      }
    }
  }
}

// ============================================================
// 优惠券/红包系统
//
// coupon_activities 集合（平台配置）:
//   name          - 活动名称，例如"新用户红包"
//   description   - 活动描述
//   amount        - 红包面值（分）
//   min_order_amount - 使用门槛（分），0=无门槛
//   total_count   - 总发放数量（0=不限量）
//   claimed_count - 已领取数量
//   status        - 'active' | 'inactive'
//   expired_at    - 红包有效期截止时间（null=不限）
//   claim_expired_at - 领取截止时间（null=不限）
//   created_at
//
// user_coupons 集合（用户持有）:
//   user_id       - 用户openid
//   activity_id   - 关联活动ID
//   name          - 红包/券名称（冗余）
//   amount        - 面值（分）
//   min_order_amount - 使用门槛（分）
//   status        - 'unused' | 'used' | 'expired'
//   expired_at    - 有效期截止
//   received_at   - 领取时间
//   order_id      - 使用时绑定的订单ID（null=未使用）
//   used_at       - 使用时间
// ============================================================

/**
 * 获取当前有效的优惠券活动列表（用户端）
 */
async function getCouponActivities(event, openid) {
  const now = new Date()

  const { data: activities } = await couponActivitiesCollection
    .where({ status: 'active' })
    .orderBy('created_at', 'desc')
    .limit(20)
    .get()

  // 过滤领取截止时间
  const valid = activities.filter(a => {
    if (a.claim_expired_at && new Date(a.claim_expired_at) < now) return false
    return true
  })

  // 查询用户已领取的活动ID
  const { data: userCoupons } = await userCouponsCollection
    .where({ user_id: openid })
    .field({ activity_id: true })
    .limit(100)
    .get()
  const claimedActivityIds = new Set(userCoupons.map(c => c.activity_id))

  const list = valid.map(a => ({
    _id: a._id,
    name: a.name,
    description: a.description || '',
    amount: a.amount,
    min_order_amount: a.min_order_amount || 0,
    total_count: a.total_count || 0,
    claimed_count: a.claimed_count || 0,
    expired_at: a.expired_at,
    is_claimed: claimedActivityIds.has(a._id),
    is_full: a.total_count > 0 && (a.claimed_count || 0) >= a.total_count
  }))

  return { code: 0, message: 'success', data: { activities: list } }
}

/**
 * 用户领取优惠券
 * 入参: activityId
 */
async function claimCoupon(event, openid) {
  const { activityId } = event
  if (!activityId) return { code: 1001, message: '缺少活动ID' }

  const now = new Date()

  const { data: activity } = await couponActivitiesCollection.doc(activityId).get().catch(() => ({ data: null }))
  if (!activity) return { code: 2001, message: '活动不存在' }
  if (activity.status !== 'active') return { code: 2002, message: '活动已结束' }
  if (activity.claim_expired_at && new Date(activity.claim_expired_at) < now) {
    return { code: 2002, message: '领取时间已过' }
  }

  // 检查是否已领取
  const { data: existing } = await userCouponsCollection
    .where({ user_id: openid, activity_id: activityId })
    .limit(1)
    .get()
  if (existing.length > 0) return { code: 2003, message: '您已领取过该优惠券' }

  // 检查数量限制（使用原子自增防止超发）
  if (activity.total_count > 0) {
    const result = await couponActivitiesCollection.doc(activityId).update({
      data: {
        claimed_count: _.inc(1)
      }
    })
    // 重新读取验证
    const { data: fresh } = await couponActivitiesCollection.doc(activityId).get()
    if (fresh.claimed_count > fresh.total_count) {
      // 回滚
      await couponActivitiesCollection.doc(activityId).update({
        data: { claimed_count: _.inc(-1) }
      })
      return { code: 2004, message: '优惠券已发放完毕' }
    }
  }

  // 计算有效期
  const expiredAt = activity.expired_at || null

  const dbNow = db.serverDate()
  const couponData = {
    user_id: openid,
    activity_id: activityId,
    name: activity.name,
    amount: activity.amount,
    min_order_amount: activity.min_order_amount || 0,
    status: 'unused',
    expired_at: expiredAt,
    received_at: dbNow,
    order_id: null,
    used_at: null
  }

  const { _id } = await userCouponsCollection.add({ data: couponData })

  return {
    code: 0,
    message: 'success',
    data: { couponId: _id, amount: activity.amount, name: activity.name }
  }
}

/**
 * 获取当前用户的优惠券列表
 * 入参: status (可选: 'unused'|'used'|'expired'|'' 全部)
 */
async function getUserCoupons(event, openid) {
  const { status } = event
  const now = new Date()

  const query = { user_id: openid }
  if (status) query.status = status

  const { data: coupons } = await userCouponsCollection
    .where(query)
    .orderBy('received_at', 'desc')
    .limit(100)
    .get()

  // 自动将过期未使用的标记为 expired（仅在列表中标记，不更新DB）
  const list = coupons.map(c => {
    const isExpired = c.status === 'unused' && c.expired_at && new Date(c.expired_at) < now
    return {
      ...c,
      status: isExpired ? 'expired' : c.status,
      is_expired: isExpired
    }
  })

  return { code: 0, message: 'success', data: { coupons: list } }
}

/**
 * 创建优惠券活动（平台管理，简化版无鉴权，生产中需加管理员校验）
 * 入参: name, description, amount, min_order_amount, total_count,
 *       expired_at(红包有效期), claim_expired_at(领取截止)
 */
async function createCouponActivity(event, openid) {
  const { name, description, amount, min_order_amount = 0, total_count = 0, expired_at, claim_expired_at } = event

  if (!name || !amount) return { code: 1001, message: '参数不完整' }
  if (typeof amount !== 'number' || amount <= 0) return { code: 1001, message: '红包金额格式不正确' }

  // 简单鉴权：检查是否为商户或管理员
  const { data: users } = await usersCollection.where({ _openid: openid }).limit(1).get()
  if (!users || users.length === 0) return { code: 1002, message: '请先登录' }
  if (!['merchant', 'admin'].includes(users[0].role)) {
    return { code: 1003, message: '无权限创建优惠券活动' }
  }

  const now = db.serverDate()
  const { _id } = await couponActivitiesCollection.add({
    data: {
      name: name.trim(),
      description: description ? description.trim() : '',
      amount,
      min_order_amount,
      total_count,
      claimed_count: 0,
      status: 'active',
      expired_at: expired_at || null,
      claim_expired_at: claim_expired_at || null,
      created_by: openid,
      created_at: now
    }
  })

  return { code: 0, message: 'success', data: { activityId: _id } }
}
