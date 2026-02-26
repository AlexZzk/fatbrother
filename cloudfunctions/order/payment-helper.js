/**
 * 微信支付 v3 API 工具模块
 *
 * 【接入说明】
 * 本模块封装了微信支付 v3 API 的签名、加密、请求逻辑。
 * 每个商户拥有独立的微信支付商户号和密钥，平台不做收款，用户直接付给商户。
 *
 * 商户需要在 merchants 集合中配置 payment_config 字段：
 * {
 *   payment_config: {
 *     mch_id: '1900000001',                    // 微信支付商户号
 *     api_key_v3: '你的APIv3密钥(32字节)',        // 用于验签和解密回调
 *     serial_no: '证书序列号',                    // 商户API证书序列号
 *     private_key: '-----BEGIN PRIVATE KEY-----\n...'  // 商户API私钥(PEM格式)
 *   }
 * }
 *
 * 【替换指南】请搜索 "TODO_REPLACE" 查找所有需要替换的配置项：
 * 1. APPID - 在 createJSAPIOrder 方法中替换小程序 appid
 * 2. notify_url - 支付回调地址，替换为你的云函数 HTTP 触发地址
 * 3. 商户 payment_config - 每个商户入驻时在数据库中配置
 */

const crypto = require('crypto')
const https = require('https')

// 平台小程序 APPID（所有商户支付均通过此小程序发起）
const APP_ID = 'wx711600359fd02988'

// ======== TODO_REPLACE: 支付回调地址 ========
// 格式: https://<云环境ID>.service.tcloudbase.com/order?action=paymentNotify
// 需要在微信云开发控制台开启 HTTP 访问服务
const NOTIFY_URL = 'https://cloudbase-2g53go7z650ca946-1392989365.ap-shanghai.app.tcloudbase.com/order'

// 微信支付 API 基础地址
const API_BASE = 'api.mch.weixin.qq.com'

class WechatPayHelper {
  /**
   * @param {Object} config - 商户支付配置
   * @param {string} config.mch_id - 商户号
   * @param {string} config.api_key_v3 - APIv3密钥
   * @param {string} config.serial_no - 证书序列号
   * @param {string} config.private_key - 商户API私钥(PEM)
   */
  constructor(config) {
    this.mchId = config.mch_id
    this.apiKeyV3 = config.api_key_v3
    this.serialNo = config.serial_no
    // Normalize private key: replace escaped \n with real newlines.
    // Databases or JSON editors sometimes store the PEM as a single-line
    // string with literal backslash-n, which causes ERR_OSSL_PEM_NO_START_LINE.
    this.privateKey = (config.private_key || '').replace(/\\n/g, '\n')
  }

  /**
   * 生成请求签名
   */
  _sign(message) {
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(message)
    return sign.sign(this.privateKey, 'base64')
  }

  /**
   * 构建 Authorization 头
   */
  _getAuthHeader(method, url, body) {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = crypto.randomBytes(16).toString('hex')
    const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body || ''}\n`
    const signature = this._sign(message)
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${this.serialNo}",signature="${signature}"`
  }

  /**
   * 发起 HTTPS 请求到微信支付 API
   */
  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : ''
      const authorization = this._getAuthHeader(method, path, bodyStr)

      const options = {
        hostname: API_BASE,
        port: 443,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': authorization,
          'User-Agent': 'FatBrother-WechatPay/1.0'
        }
      }

      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          try {
            const result = JSON.parse(data)
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(result)
            } else {
              reject({ statusCode: res.statusCode, ...result })
            }
          } catch (e) {
            reject({ statusCode: res.statusCode, message: data })
          }
        })
      })

      req.on('error', reject)
      if (bodyStr) req.write(bodyStr)
      req.end()
    })
  }

  /**
   * JSAPI下单 - 创建微信支付订单
   *
   * @param {Object} params
   * @param {string} params.outTradeNo - 商户订单号
   * @param {string} params.description - 订单描述
   * @param {number} params.totalAmount - 订单金额(分)
   * @param {string} params.payerOpenid - 付款人 openid
   * @param {boolean} params.profitSharing - 是否需要分账
   * @returns {Object} { prepayId, payParams } - prepay_id 和前端调起支付所需参数
   */
  async createJSAPIOrder(params) {
    const { outTradeNo, description, totalAmount, payerOpenid, profitSharing = false } = params

    const body = {
      appid: APP_ID,
      mchid: this.mchId,
      description,
      out_trade_no: outTradeNo,
      // 将订单号编码到 URL 路径中，避免使用查询参数
      // 微信支付 v3 校验规则禁止 notify_url 中包含 ? (查询参数)
      notify_url: `${NOTIFY_URL}/paynotify/${outTradeNo}`,
      amount: {
        total: totalAmount,
        currency: 'CNY'
      },
      payer: {
        openid: payerOpenid
      }
    }

    // 标记分账
    if (profitSharing) {
      body.settle_info = { profit_sharing: true }
    }

    const result = await this._request('POST', '/v3/pay/transactions/jsapi', body)
    const prepayId = result.prepay_id

    // 构建前端 wx.requestPayment 所需参数
    const payParams = this._buildPayParams(prepayId)

    return { prepayId, payParams }
  }

  /**
   * 构建前端 wx.requestPayment 参数
   */
  _buildPayParams(prepayId) {
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = crypto.randomBytes(16).toString('hex')
    const packageStr = `prepay_id=${prepayId}`

    const message = `${APP_ID}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`
    const paySign = this._sign(message)

    return {
      timeStamp,
      nonceStr,
      package: packageStr,
      signType: 'RSA',
      paySign
    }
  }

  /**
   * 解密回调通知数据
   *
   * @param {string} ciphertext - 密文(Base64)
   * @param {string} nonce - 随机串
   * @param {string} associatedData - 附加数据
   * @returns {Object} 解密后的数据
   */
  decryptResource(ciphertext, nonce, associatedData) {
    const ciphertextBuf = Buffer.from(ciphertext, 'base64')
    // AEAD_AES_256_GCM: 密文末尾16字节为 auth tag
    const authTag = ciphertextBuf.slice(-16)
    const data = ciphertextBuf.slice(0, -16)

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(this.apiKeyV3),
      Buffer.from(nonce)
    )
    decipher.setAuthTag(authTag)
    decipher.setAAD(Buffer.from(associatedData))

    const decrypted = Buffer.concat([
      decipher.update(data),
      decipher.final()
    ])

    return JSON.parse(decrypted.toString('utf8'))
  }

  /**
   * 主动查询订单支付状态（补单机制）
   *
   * 当支付回调未到达时，可主动调用此接口确认支付结果。
   * GET /v3/pay/transactions/out-trade-no/{out_trade_no}?mchid={mchid}
   *
   * @param {string} outTradeNo - 商户订单号
   * @returns {Object} 微信支付订单信息，关键字段: trade_state ('SUCCESS'/'NOTPAY'/...)
   */
  async queryOrder(outTradeNo) {
    return this._request('GET', `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${this.mchId}`, null)
  }

  /**
   * 申请退款
   *
   * @param {Object} params
   * @param {string} params.transactionId - 微信支付订单号
   * @param {string} params.outRefundNo - 商户退款单号
   * @param {number} params.totalAmount - 原订单金额(分)
   * @param {number} params.refundAmount - 退款金额(分)
   * @param {string} params.reason - 退款原因
   * @returns {Object} 退款结果
   */
  async createRefund(params) {
    const { transactionId, outRefundNo, totalAmount, refundAmount, reason } = params

    const body = {
      transaction_id: transactionId,
      out_refund_no: outRefundNo,
      reason: reason || '用户申请退款',
      notify_url: NOTIFY_URL,
      amount: {
        refund: refundAmount,
        total: totalAmount,
        currency: 'CNY'
      }
    }

    return this._request('POST', '/v3/refund/domestic/refunds', body)
  }

  /**
   * 请求分账 - 订单完成后将佣金分给平台
   *
   * @param {Object} params
   * @param {string} params.transactionId - 微信支付订单号
   * @param {string} params.outOrderNo - 商户分账单号
   * @param {Array} params.receivers - 分账接收方列表
   * @returns {Object} 分账结果
   */
  async profitSharing(params) {
    const { transactionId, outOrderNo, receivers } = params

    const body = {
      appid: APP_ID,
      transaction_id: transactionId,
      out_order_no: outOrderNo,
      receivers,
      unfreeze_unsplit: true // 解冻剩余资金给商户
    }

    return this._request('POST', '/v3/profitsharing/orders', body)
  }

  /**
   * 分账回退 - 退款前需先撤回已分账的金额
   *
   * @param {Object} params
   * @param {string} params.outReturnNo - 回退单号
   * @param {string} params.outOrderNo - 原分账单号
   * @param {string} params.returnMchId - 回退方商户号
   * @param {number} params.amount - 回退金额(分)
   * @param {string} params.description - 回退描述
   */
  async profitSharingReturn(params) {
    const { outReturnNo, outOrderNo, returnMchId, amount, description } = params

    const body = {
      out_return_no: outReturnNo,
      out_order_no: outOrderNo,
      return_mchid: returnMchId,
      amount,
      description: description || '退款回退分账'
    }

    return this._request('POST', '/v3/profitsharing/return-orders', body)
  }
}

module.exports = { WechatPayHelper, APP_ID, NOTIFY_URL }
