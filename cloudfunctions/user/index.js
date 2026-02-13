const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('users')
const merchantsCollection = db.collection('merchants')

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
    updateProfile
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
