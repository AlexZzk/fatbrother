# 公共模块接口文档

> 云函数名：`common`
> Sprint：S7（订阅消息通知）

---

## 接口列表

| Action | 说明 | 调用方 | Sprint | 状态 |
|--------|------|--------|--------|------|
| `sendMessage` | 发送订阅消息 | 内部调用 | S7 | **已完成** |

---

## 1. sendMessage - 发送订阅消息

**说明：** 发送微信订阅消息通知。由订单状态变更时在云函数内部调用，不直接暴露给前端。

**调用方式：**（云函数内部调用）
```js
await cloud.callFunction({
  name: 'common',
  data: {
    action: 'sendMessage',
    type: 'MERCHANT_ACCEPTED',
    toOpenid: 'user_openid_xxx',
    orderData: {
      orderId: 'order_xxx',
      orderNo: '202602101230001234',
      merchantName: '胖子炒饭',
      actualPrice: 5300,
      createTime: '2026-02-10T12:30:00Z'
    }
  }
})
```

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 消息类型，见下方类型表 |
| toOpenid | string | 是 | 接收者 openid |
| orderData | object | 是 | 订单相关数据 |
| page | string | 否 | 点击跳转页面（默认自动推导） |

**消息类型：**

| type | 接收者 | 说明 | 触发节点 |
|------|--------|------|---------|
| `ORDER_SUBMITTED` | 用户 | 订单提交成功 | 创建订单 / 支付成功 |
| `MERCHANT_ACCEPTED` | 用户 | 商家已接单 | 商户接单 |
| `FOOD_READY` | 用户 | 餐品已出餐 | 商户标记出餐 |
| `ORDER_CANCELLED` | 用户 | 订单已取消 | 商户拒单 / 超时取消 |
| `NEW_ORDER` | 商户 | 新订单通知 | 创建订单 / 支付成功 |
| `ORDER_TIMEOUT_WARNING` | 商户 | 订单即将超时 | 定时器（25分钟） |

**orderData 字段：**

| 字段 | 类型 | 说明 | 使用的消息类型 |
|------|------|------|---------------|
| orderId | string | 订单ID | 全部 |
| orderNo | string | 订单编号 | 全部 |
| merchantName | string | 商家名称 | ORDER_SUBMITTED, MERCHANT_ACCEPTED, FOOD_READY |
| actualPrice | number | 实付金额(分) | ORDER_SUBMITTED, ORDER_CANCELLED, NEW_ORDER |
| createTime | string | 下单时间 | ORDER_SUBMITTED, MERCHANT_ACCEPTED, NEW_ORDER, ORDER_TIMEOUT_WARNING |
| cancelReason | string | 取消原因 | ORDER_CANCELLED |
| itemSummary | string | 商品概要 | NEW_ORDER |
| remainMinutes | number | 剩余分钟数 | ORDER_TIMEOUT_WARNING |

**出参：**
```json
{
  "code": 0,
  "message": "success",
  "data": { "sent": true }
}
```

**注意事项：**
1. 用户必须先通过 `wx.requestSubscribeMessage` 授权对应模板
2. 每次授权仅允许发送一条消息
3. 模板未配置或用户未授权时静默跳过，不影响主流程
4. 模板字段名需根据微信后台实际分配的名称调整

---

## 前端订阅授权

在 `pages/order-confirm/index.js` 中，下单前调用：

```js
wx.requestSubscribeMessage({
  tmplIds: [
    'ORDER_SUBMITTED模板ID',
    'MERCHANT_ACCEPTED模板ID',
    'FOOD_READY模板ID'
  ]
})
```

用户同意后，对应模板可发送一次消息。用户拒绝不影响下单流程。
