const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const ridersCol = db.collection('riders')
const usersCol = db.collection('users')

// ============================================================
// 骑手模块云函数
//
// riders 集合:
//   user_id           - 关联 users._id
//   _openid           - 用户 openid（冗余，便于权限查询）
//   real_name         - 真实姓名
//   phone             - 联系电话
//   id_card_no        - 身份证号（后续接入加密存储）
//   vehicle_type      - 'bicycle'|'electric'|'motorcycle'|'car'
//   vehicle_desc      - 车辆描述
//   service_area      - 配送区域描述
//   status            - 'pending'|'active'|'suspended'
//   reject_reason     - 审核拒绝原因
//   is_online         - 是否在线接单
//   total_orders      - 累计完成单数
//   total_earnings_cents - 累计配送费记账（分）
//   created_at / approved_at / updated_at
// ============================================================

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  const actions = {
    applyRider,
    getRiderInfo,
    updateOnlineStatus,
    reviewRider
  }

  if (!actions[action]) {
    return { code: 1001, message: `未知的 action: ${action}` }
  }

  try {
    return await actions[action](event, OPENID)
  } catch (err) {
    console.error(`[rider/${action}] error:`, err)
    return { code: 9999, message: err.message || '系统内部错误' }
  }
}

/**
 * 获取当前用户的骑手申请状态
 * 返回: { hasApplied, riderInfo }
 */
async function getRiderInfo(event, openid) {
  const { data: users } = await usersCol.where({ _openid: openid }).limit(1).get()
  if (!users || users.length === 0) {
    return { code: 1002, message: '用户未登录' }
  }
  const userId = users[0]._id

  const { data: riders } = await ridersCol
    .where({ user_id: userId })
    .limit(1)
    .get()

  if (riders.length === 0) {
    return { code: 0, message: 'success', data: { hasApplied: false, riderInfo: null } }
  }

  return {
    code: 0,
    message: 'success',
    data: { hasApplied: true, riderInfo: riders[0] }
  }
}

/**
 * 提交骑手申请（首次申请或被拒后重新提交）
 * 入参: real_name, phone, id_card_no, vehicle_type, vehicle_desc, service_area
 */
async function applyRider(event, openid) {
  const { real_name, phone, id_card_no, vehicle_type, vehicle_desc = '', service_area = '' } = event

  if (!real_name || !phone || !vehicle_type) {
    return { code: 1001, message: '姓名、电话、车辆类型为必填项' }
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 1001, message: '请输入正确的手机号' }
  }
  const validVehicles = ['bicycle', 'electric', 'motorcycle', 'car']
  if (!validVehicles.includes(vehicle_type)) {
    return { code: 1001, message: '车辆类型不合法' }
  }

  const { data: users } = await usersCol.where({ _openid: openid }).limit(1).get()
  if (!users || users.length === 0) {
    return { code: 1002, message: '用户未登录' }
  }
  const user = users[0]

  const now = db.serverDate()
  const { data: existing } = await ridersCol.where({ user_id: user._id }).limit(1).get()

  const riderData = {
    real_name: real_name.trim(),
    phone: phone.trim(),
    id_card_no: id_card_no ? id_card_no.trim() : '',
    vehicle_type,
    vehicle_desc: vehicle_desc.trim(),
    service_area: service_area.trim(),
    updated_at: now
  }

  if (existing.length === 0) {
    // 首次申请
    const { _id } = await ridersCol.add({
      data: {
        user_id: user._id,
        _openid: openid,
        ...riderData,
        status: 'pending',
        reject_reason: '',
        is_online: false,
        total_orders: 0,
        total_earnings_cents: 0,
        created_at: now
      }
    })
    return { code: 0, message: 'success', data: { riderId: _id, status: 'pending' } }
  }

  const rider = existing[0]
  // 只有 pending（修改）或被拒绝（重新提交）时允许再次提交
  if (rider.status === 'active') {
    return { code: 2001, message: '您已是认证骑手，无需重新申请' }
  }

  await ridersCol.doc(rider._id).update({
    data: { ...riderData, status: 'pending', reject_reason: '' }
  })

  return { code: 0, message: 'success', data: { riderId: rider._id, status: 'pending' } }
}

/**
 * 骑手切换在线状态
 * 入参: is_online (boolean)
 */
async function updateOnlineStatus(event, openid) {
  const { is_online } = event
  if (typeof is_online !== 'boolean') {
    return { code: 1001, message: 'is_online 参数不合法' }
  }

  const { data: users } = await usersCol.where({ _openid: openid }).limit(1).get()
  if (!users || users.length === 0) {
    return { code: 1002, message: '用户未登录' }
  }

  const { data: riders } = await ridersCol
    .where({ user_id: users[0]._id, status: 'active' })
    .limit(1)
    .get()

  if (riders.length === 0) {
    return { code: 2001, message: '您尚未通过骑手认证' }
  }

  await ridersCol.doc(riders[0]._id).update({
    data: { is_online, updated_at: db.serverDate() }
  })

  return { code: 0, message: 'success', data: { is_online } }
}

/**
 * 管理员审核骑手申请
 * 入参: riderId, action('approve'|'reject'), reject_reason
 */
async function reviewRider(event, openid) {
  const { riderId, action: reviewAction, reject_reason = '' } = event

  if (!riderId || !reviewAction) {
    return { code: 1001, message: '缺少必要参数' }
  }

  // 验证管理员权限
  const { data: users } = await usersCol.where({ _openid: openid }).limit(1).get()
  if (!users || users.length === 0) {
    return { code: 1002, message: '用户未登录' }
  }
  if (users[0].role !== 'admin') {
    return { code: 1003, message: '无权限执行此操作' }
  }

  const { data: rider } = await ridersCol.doc(riderId).get().catch(() => ({ data: null }))
  if (!rider) {
    return { code: 2001, message: '骑手申请不存在' }
  }

  const now = db.serverDate()

  if (reviewAction === 'approve') {
    await ridersCol.doc(riderId).update({
      data: { status: 'active', reject_reason: '', approved_at: now, updated_at: now }
    })
    // 更新用户角色为 rider
    await usersCol.doc(rider.user_id).update({
      data: { role: 'rider', updated_at: now }
    })
    return { code: 0, message: 'success', data: { riderId, status: 'active' } }
  }

  if (reviewAction === 'reject') {
    if (!reject_reason.trim()) {
      return { code: 1001, message: '拒绝时必须填写原因' }
    }
    await ridersCol.doc(riderId).update({
      data: { status: 'pending', reject_reason: reject_reason.trim(), updated_at: now }
    })
    return { code: 0, message: 'success', data: { riderId, status: 'pending' } }
  }

  return { code: 1001, message: '无效的审核操作' }
}
