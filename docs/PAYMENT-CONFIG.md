# 微信支付接入配置指南

> 版本：v1.0.0
> 适用于 Sprint 7 微信支付对接

---

## 一、架构说明

**平台模式：** 平台不做收款，用户直接付给商户。每个商户拥有独立的微信支付商户号。

```
用户下单 → 调用商户的微信支付 → 钱到商户账户
                                    ↓
                            订单完成后分账
                                    ↓
                        佣金从商户账户 → 平台账户
```

**分账规则：**
- 佣金比例：10%（可在 `PLATFORM_CONFIG.commissionRate` 中调整）
- 无推荐人：100% 佣金 → 平台
- 一级推荐：50% → 推荐人，50% → 平台
- 二级推荐：50% → 直接推荐人，25% → 间接推荐人，25% → 平台

---

## 二、需要替换的配置项

在代码中搜索 `TODO_REPLACE` 可以找到所有需要替换的位置。

### 2.1 平台级配置

| 文件 | 配置项 | 说明 |
|------|--------|------|
| `cloudfunctions/order/payment-helper.js` | `APP_ID` | 小程序 AppID |
| `cloudfunctions/order/payment-helper.js` | `NOTIFY_URL` | 支付回调地址 |
| `cloudfunctions/order/index.js` | `USE_REAL_PAYMENT` | 设为 `true` 启用真实支付 |
| `cloudfunctions/order/index.js` | `PLATFORM_CONFIG.commissionRate` | 平台佣金比例 |
| `cloudfunctions/order/index.js` | `PLATFORM_CONFIG.platformMchId` | 平台商户号（分账接收方） |

### 2.2 商户级配置（数据库）

每个商户在 `merchants` 集合中需要配置 `payment_config` 字段：

```json
{
  "_id": "merchant_xxx",
  "shop_name": "胖子炒饭",
  "payment_config": {
    "mch_id": "1900000001",
    "api_key_v3": "你的APIv3密钥(32字节字符串)",
    "serial_no": "商户API证书序列号",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvg...\n-----END PRIVATE KEY-----"
  }
}
```

| 字段 | 获取方式 |
|------|---------|
| `mch_id` | 微信支付商户平台 → 账户中心 → 商户号 |
| `api_key_v3` | 商户平台 → 账户中心 → API安全 → 设置APIv3密钥 |
| `serial_no` | 商户平台 → 账户中心 → API安全 → 申请API证书 → 证书序列号 |
| `private_key` | 申请证书时下载的 `apiclient_key.pem` 文件内容 |

### 2.3 订阅消息模板

| 文件 | 配置项 | 说明 |
|------|--------|------|
| `cloudfunctions/common/index.js` | `TEMPLATE_IDS.*` | 6个订阅消息模板ID |
| `miniprogram/pages/order-confirm/index.js` | `SUBSCRIBE_TEMPLATE_IDS` | 下单前授权的3个模板ID |

**模板申请位置：** 微信公众平台 → 订阅消息 → 我的模板

| 模板 | 用途 | 建议关键词 |
|------|------|-----------|
| `ORDER_SUBMITTED` | 用户-订单提交 | 订单编号、商家名称、订单金额、下单时间 |
| `MERCHANT_ACCEPTED` | 用户-商家接单 | 订单编号、商家名称、预计时间、备注 |
| `FOOD_READY` | 用户-餐品出餐 | 订单编号、商家名称、取餐提醒 |
| `ORDER_CANCELLED` | 用户-订单取消 | 订单编号、取消原因、退款金额 |
| `NEW_ORDER` | 商户-新订单 | 订单编号、订单金额、下单时间、商品信息 |
| `ORDER_TIMEOUT_WARNING` | 商户-即将超时 | 订单编号、下单时间、剩余时间 |

> **注意：** 申请到模板后，模板字段名由微信分配（如 `thing1`、`character_string2` 等）。
> 需要根据实际字段名修改 `cloudfunctions/common/index.js` 中 `buildTemplateData` 函数的 key 值。

---

## 三、支付回调地址配置

支付回调需要一个公网可访问的 HTTPS 地址。在微信云开发中：

1. 进入**云开发控制台** → **环境设置** → **HTTP 访问服务**
2. 开启 HTTP 访问服务
3. 绑定云函数 `order` 到 HTTP 路径
4. 回调地址格式：`https://<云环境ID>.service.tcloudbase.com/order`
5. 将此地址替换到 `payment-helper.js` 的 `NOTIFY_URL` 中

---

## 四、前置要求

### 4.1 商户号要求

每个入驻商户需要：
- [x] 拥有已激活的微信支付商户号
- [x] 在商户平台开通 JSAPI 支付权限
- [x] 在商户平台开通**分账**功能（用于平台佣金抽成）
- [x] 添加平台商户号为分账接收方

### 4.2 小程序要求

- [x] 小程序已关联微信支付商户号
- [x] 已申请订阅消息模板（6个）
- [x] 云函数已开启 HTTP 访问服务

### 4.3 分账接收方添加

每个商户需要在微信支付商户平台添加平台为分账接收方：

```
商户平台 → 交易中心 → 分账 → 分账接收方管理 → 添加
  - 接收方类型: 商户号
  - 接收方账号: (平台商户号)
```

---

## 五、开关说明

`cloudfunctions/order/index.js` 中的 `USE_REAL_PAYMENT` 控制支付模式：

| 值 | 模式 | 行为 |
|----|------|------|
| `false`（默认） | 模拟支付 | 创建订单直接跳到 PENDING_ACCEPT，无真实扣款 |
| `true` | 真实支付 | 调用微信支付API，需要完整支付配置 |

**建议：**
1. 开发/测试阶段使用 `false`
2. 配置完所有商户支付信息后，改为 `true`
3. 上线前在沙箱环境验证完整支付流程

---

## 六、快速替换清单

1. 打开 `cloudfunctions/order/payment-helper.js`
   - 替换 `APP_ID` 为你的小程序 appid
   - 替换 `NOTIFY_URL` 为你的云函数 HTTP 地址

2. 打开 `cloudfunctions/order/index.js`
   - 替换 `PLATFORM_CONFIG.platformMchId` 为平台商户号
   - 调整 `PLATFORM_CONFIG.commissionRate` 佣金比例（默认 0.10）
   - 将 `USE_REAL_PAYMENT` 改为 `true`

3. 打开 `cloudfunctions/common/index.js`
   - 替换 6 个 `TEMPLATE_IDS` 为微信后台申请的模板ID
   - 根据实际模板字段名修改 `buildTemplateData` 的 key

4. 打开 `miniprogram/pages/order-confirm/index.js`
   - 替换 `SUBSCRIBE_TEMPLATE_IDS` 中的 3 个模板ID

5. 在数据库 `merchants` 集合中为每个商户添加 `payment_config` 字段
