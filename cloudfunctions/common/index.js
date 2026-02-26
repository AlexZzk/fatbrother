const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 腾讯位置服务 WebService API Key
 * 申请地址: https://lbs.qq.com/ → 控制台 → 应用管理 → 创建应用 → 添加 Key（勾选 WebServiceAPI）
 *
 * 配置方式（二选一）：
 *   1. 推荐：微信云开发控制台 → 云函数 → common → 函数配置 → 环境变量，添加 TENCENT_MAP_KEY
 *   2. 开发调试：直接在下方引号内填入 Key
 */
const TENCENT_MAP_KEY = process.env.TENCENT_MAP_KEY || ''

/**
 * 公共模块云函数
 * 通过 action 字段路由
 */
const actions = { sendMessage, getAddress }

exports.main = async (event, context) => {
  const { action } = event
  const handler = actions[action]
  if (!handler) {
    return { code: 1001, message: `未知操作: ${action}` }
  }
  try {
    const wxContext = cloud.getWXContext()
    event._openid = wxContext.OPENID
    return await handler(event)
  } catch (err) {
    console.error(`[common/${action}] error:`, err)
    return { code: 9999, message: '系统内部错误' }
  }
}

/**
 * 订阅消息模板 ID 配置
 *
 * 【TODO_REPLACE: 替换为微信后台申请的模板ID】
 *
 * 申请方式：微信公众平台 → 订阅消息 → 我的模板 → 添加模板
 *
 * 所需模板类型：
 *
 * 1. 用户端 - 订单提交成功
 *    关键词: 订单编号、商家名称、订单金额、下单时间
 *
 * 2. 用户端 - 商家已接单
 *    关键词: 订单编号、商家名称、预计时间、备注
 *
 * 3. 用户端 - 餐品已出餐
 *    关键词: 订单编号、商家名称、取餐提醒
 *
 * 4. 用户端 - 订单已取消
 *    关键词: 订单编号、取消原因、退款金额
 *
 * 5. 商户端 - 新订单通知
 *    关键词: 订单编号、订单金额、下单时间、商品信息
 *
 * 6. 商户端 - 订单即将超时
 *    关键词: 订单编号、下单时间、剩余时间
 */
const TEMPLATE_IDS = {
  // 用户端模板
  ORDER_SUBMITTED: 'TEMPLATE_ID_ORDER_SUBMITTED',
  MERCHANT_ACCEPTED: 'TEMPLATE_ID_MERCHANT_ACCEPTED',
  FOOD_READY: 'TEMPLATE_ID_FOOD_READY',
  ORDER_CANCELLED: 'TEMPLATE_ID_ORDER_CANCELLED',
  // 商户端模板
  NEW_ORDER: 'TEMPLATE_ID_NEW_ORDER',
  ORDER_TIMEOUT_WARNING: 'TEMPLATE_ID_ORDER_TIMEOUT_WARNING'
}

/**
 * S7-5: 发送订阅消息
 *
 * 入参:
 *   type - 消息类型 (ORDER_SUBMITTED / MERCHANT_ACCEPTED / FOOD_READY / ORDER_CANCELLED / NEW_ORDER / ORDER_TIMEOUT_WARNING)
 *   toOpenid - 接收者 openid
 *   orderData - 订单相关数据 { orderId, orderNo, merchantName, actualPrice, createTime, cancelReason, ... }
 *   page - 点击消息跳转的页面路径（可选）
 *
 * 注意:
 *   用户必须先通过 wx.requestSubscribeMessage 授权对应模板
 *   每次授权仅允许发送一条消息
 */
async function sendMessage(event) {
  const { type, toOpenid, orderData = {}, page } = event

  if (!type || !toOpenid) {
    return { code: 1001, message: '缺少消息类型或接收者' }
  }

  const templateId = TEMPLATE_IDS[type]
  if (!templateId || templateId.startsWith('TEMPLATE_ID_')) {
    // 模板ID未配置，静默跳过
    console.warn(`[sendMessage] 模板 ${type} 未配置，跳过发送`)
    return { code: 0, message: 'skipped', data: { sent: false, reason: '模板未配置' } }
  }

  // 构建模板数据
  const data = buildTemplateData(type, orderData)
  if (!data) {
    return { code: 1001, message: '不支持的消息类型' }
  }

  // 默认跳转页面
  const targetPage = page || getDefaultPage(type, orderData)

  try {
    await cloud.openapi.subscribeMessage.send({
      touser: toOpenid,
      templateId,
      page: targetPage,
      data,
      miniprogramState: 'formal' // formal=正式版, developer=开发版, trial=体验版
    })
    return { code: 0, message: 'success', data: { sent: true } }
  } catch (err) {
    // 常见错误: 用户未授权(43101)、超过发送限制(45009)
    console.error(`[sendMessage] type=${type} err:`, err)
    return { code: 0, message: 'send_failed', data: { sent: false, errCode: err.errCode } }
  }
}

/**
 * 根据消息类型构建模板数据
 *
 * 【TODO_REPLACE: 根据实际申请到的模板字段名调整 key 值】
 * 微信订阅消息模板的字段名由微信分配（如 thing1, character_string2 等），
 * 需要在申请模板后按照实际字段名替换下方的 key。
 */
function buildTemplateData(type, d) {
  const formatPrice = (cents) => `¥${(cents / 100).toFixed(2)}`
  const formatTime = (t) => {
    if (!t) return ''
    const date = new Date(t)
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  switch (type) {
    case 'ORDER_SUBMITTED':
      return {
        character_string1: { value: d.orderNo || '' },      // 订单编号
        thing2: { value: (d.merchantName || '').slice(0, 20) }, // 商家名称
        amount3: { value: formatPrice(d.actualPrice || 0) }, // 订单金额
        time4: { value: formatTime(d.createTime) }           // 下单时间
      }

    case 'MERCHANT_ACCEPTED':
      return {
        character_string1: { value: d.orderNo || '' },      // 订单编号
        thing2: { value: (d.merchantName || '').slice(0, 20) }, // 商家名称
        thing3: { value: '商家已接单，正在准备中' },           // 备注
        time4: { value: formatTime(d.createTime) }           // 预计时间
      }

    case 'FOOD_READY':
      return {
        character_string1: { value: d.orderNo || '' },      // 订单编号
        thing2: { value: (d.merchantName || '').slice(0, 20) }, // 商家名称
        thing3: { value: '您的餐品已出餐，请尽快取餐' }        // 取餐提醒
      }

    case 'ORDER_CANCELLED':
      return {
        character_string1: { value: d.orderNo || '' },      // 订单编号
        thing2: { value: (d.cancelReason || '用户取消').slice(0, 20) }, // 取消原因
        amount3: { value: formatPrice(d.actualPrice || 0) }  // 退款金额
      }

    case 'NEW_ORDER':
      return {
        character_string1: { value: d.orderNo || '' },      // 订单编号
        amount2: { value: formatPrice(d.actualPrice || 0) }, // 订单金额
        time3: { value: formatTime(d.createTime) },          // 下单时间
        thing4: { value: (d.itemSummary || '').slice(0, 20) } // 商品信息
      }

    case 'ORDER_TIMEOUT_WARNING':
      return {
        character_string1: { value: d.orderNo || '' },      // 订单编号
        time2: { value: formatTime(d.createTime) },          // 下单时间
        thing3: { value: `还剩${d.remainMinutes || 5}分钟自动取消` } // 剩余时间
      }

    default:
      return null
  }
}

/**
 * 获取默认跳转页面
 */
function getDefaultPage(type, d) {
  const orderId = d.orderId || ''
  switch (type) {
    case 'ORDER_SUBMITTED':
    case 'MERCHANT_ACCEPTED':
    case 'FOOD_READY':
    case 'ORDER_CANCELLED':
      return `/pages/order-detail/index?orderId=${orderId}`
    case 'NEW_ORDER':
    case 'ORDER_TIMEOUT_WARNING':
      return '/pages/merchant/orders/index'
    default:
      return '/pages/index/index'
  }
}

/**
 * 逆地理编码：坐标 → 地址字符串
 * 调用腾讯位置服务 WebService API
 * 若 TENCENT_MAP_KEY 未配置则静默返回空字符串
 */
async function getAddress(event) {
  const { latitude, longitude } = event
  if (!latitude || !longitude) {
    return { code: 1001, message: '缺少坐标' }
  }
  if (!TENCENT_MAP_KEY) {
    return { code: 0, data: { address: '' } }
  }

  try {
    const https = require('https')
    const url = `https://apis.map.qq.com/ws/geocoder/v1/?location=${latitude},${longitude}&key=${TENCENT_MAP_KEY}&output=json&get_poi=1`

    const result = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let raw = ''
        res.on('data', chunk => { raw += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(raw)) } catch (e) { reject(e) }
        })
      }).on('error', reject)
    })

    if (result.status === 0 && result.result) {
      const r = result.result
      const comp = r.address_component || {}
      const pois = r.pois || []
      // 优先取最近的 POI 名称（如"绿地象屿"），其次推荐地址描述，再次街道/区
      const address =
        (pois.length > 0 && pois[0].title) ||
        (r.formatted_addresses && r.formatted_addresses.recommend) ||
        comp.street || comp.district || comp.city || r.address || ''
      return { code: 0, data: { address } }
    }
    return { code: 0, data: { address: '' } }
  } catch (err) {
    console.error('[getAddress] 逆地理编码失败:', err.message)
    return { code: 0, data: { address: '' } }
  }
}

module.exports = { TEMPLATE_IDS }
