# 订单模块接口文档

> 云函数名：`order`
> Sprint：S5（C端下单）、S6（B端接单）

---

## 接口列表

| Action | 说明 | 角色 | Sprint | 状态 |
|--------|------|------|--------|------|
| `create` | 创建订单（模拟支付） | C端用户 | S5 | **已完成** |
| `getList` | 获取订单列表 | C端用户 | S5 | **已完成** |
| `getDetail` | 获取订单详情 | C端用户/商户 | S5 | **已完成** |
| `cancel` | 用户取消订单 | C端用户 | S5 | **已完成** |
| `getMerchantOrders` | 商户获取订单列表 | B端商户 | S6 | 待开发 |
| `accept` | 商户接单 | B端商户 | S6 | 待开发 |
| `reject` | 商户拒单 | B端商户 | S6 | 待开发 |
| `markReady` | 商户标记出餐 | B端商户 | S6 | 待开发 |
| `complete` | 商户确认完成 | B端商户 | S6 | 待开发 |

---

## 订单状态流转

```
PENDING_ACCEPT → ACCEPTED → READY → COMPLETED
      ↓              ↓         ↓
   CANCELLED     CANCELLED  CANCELLED
```

| 状态 | 显示文本 | 颜色 | 说明 |
|------|---------|------|------|
| `PENDING_ACCEPT` | 待接单 | `#FF9500` | 已支付，等待商户接单 |
| `ACCEPTED` | 制作中 | `#1677FF` | 商户已接单，制作中 |
| `READY` | 待取餐 | `#00B578` | 出餐完成，等待取餐 |
| `COMPLETED` | 已完成 | `#999999` | 订单完成 |
| `CANCELLED` | 已取消 | `#FF3B30` | 订单已取消 |

---

## 1. create - 创建订单

**说明：** 用户提交购物车商品创建订单。服务端重新计算价格防篡改。当前模拟支付，直接跳到 PENDING_ACCEPT 状态。

**调用方式：**
```js
callFunction('order', {
  action: 'create',
  merchantId: 'merchant_xxx',
  items: [
    {
      productId: 'product_xxx',
      productName: '蛋炒饭',
      productImage: 'cloud://xxx',
      specs: [
        { groupName: '份量', itemName: '大份' },
        { groupName: '辣度', itemName: '中辣' }
      ],
      quantity: 1,
      unitPrice: 1700
    }
  ],
  remark: '不要香菜'
})
```

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| merchantId | string | 是 | 商家ID |
| items | array | 是 | 购物车商品列表 |
| items[].productId | string | 是 | 商品ID |
| items[].productName | string | 是 | 商品名称 |
| items[].productImage | string | 否 | 商品图片 |
| items[].specs | array | 否 | 已选规格列表 |
| items[].specs[].groupName | string | 是 | 规格组名 |
| items[].specs[].itemName | string | 是 | 规格项名 |
| items[].quantity | number | 是 | 数量 (1-99) |
| items[].unitPrice | number | 是 | 前端计算的单价（分），仅作参考 |
| remark | string | 否 | 备注（最多200字） |

**出参：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "orderId": "order_xxx",
    "orderNo": "202602101230001234",
    "actualPrice": 5300
  }
}
```

**错误码：**

| 错误码 | 说明 |
|--------|------|
| 1001 | 参数不完整 |
| 2001 | 商家不存在/未营业/商品已下架 |

**服务端逻辑：**
1. 校验商家状态（active + is_open）
2. 批量查询商品，验证存在且在售
3. 以服务端存储的 base_price + spec.price_delta 重新计算单价
4. 生成订单编号（年月日时分秒 + 4位随机数）
5. 创建订单记录，状态设为 PENDING_ACCEPT
6. 返回订单ID和实付金额

**迁移路由：** `POST /api/order/create`

---

## 2. getList - 获取订单列表

**说明：** 获取当前用户的订单列表，支持按状态筛选和分页。

**调用方式：**
```js
callFunction('order', {
  action: 'getList',
  status: 'PENDING_ACCEPT',  // 可选，空=全部
  page: 1,
  pageSize: 20
})
```

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 筛选状态（空=全部） |
| page | number | 否 | 页码，默认1 |
| pageSize | number | 否 | 每页条数，默认20 |

**出参：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "_id": "order_xxx",
        "order_no": "202602101230001234",
        "merchant_id": "merchant_xxx",
        "merchant_name": "胖子炒饭",
        "merchant_avatar": "cloud://xxx",
        "items": [
          {
            "product_id": "product_xxx",
            "name": "蛋炒饭",
            "image": "cloud://xxx",
            "specs": [{ "group": "份量", "selected": "大份" }],
            "unit_price": 1700,
            "quantity": 1,
            "subtotal": 1700
          }
        ],
        "total_price": 5300,
        "actual_price": 5300,
        "status": "PENDING_ACCEPT",
        "is_reviewed": false,
        "created_at": "2026-02-10T12:30:00Z"
      }
    ],
    "total": 15,
    "hasMore": true
  }
}
```

**迁移路由：** `GET /api/order/list?status=xxx&page=1&pageSize=20`

---

## 3. getDetail - 获取订单详情

**说明：** 获取单个订单完整信息。下单用户和对应商户均可查看。

**调用方式：**
```js
callFunction('order', {
  action: 'getDetail',
  orderId: 'order_xxx'
})
```

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| orderId | string | 是 | 订单ID |

**出参：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "order": {
      "_id": "order_xxx",
      "order_no": "202602101230001234",
      "user_id": "openid_xxx",
      "merchant_id": "merchant_xxx",
      "merchant_name": "胖子炒饭",
      "merchant_avatar": "cloud://xxx",
      "items": [
        {
          "product_id": "product_xxx",
          "name": "蛋炒饭",
          "image": "cloud://xxx",
          "specs": [{ "group": "份量", "selected": "大份" }],
          "unit_price": 1700,
          "quantity": 1,
          "subtotal": 1700
        }
      ],
      "total_price": 5300,
      "packing_fee": 0,
      "delivery_fee": 0,
      "actual_price": 5300,
      "status": "PENDING_ACCEPT",
      "remark": "不要香菜",
      "cancel_reason": "",
      "is_reviewed": false,
      "is_settled": false,
      "paid_at": "2026-02-10T12:30:00Z",
      "accepted_at": null,
      "ready_at": null,
      "completed_at": null,
      "cancelled_at": null,
      "created_at": "2026-02-10T12:30:00Z",
      "updated_at": "2026-02-10T12:30:00Z"
    }
  }
}
```

**错误码：**

| 错误码 | 说明 |
|--------|------|
| 1001 | 缺少订单ID |
| 2001 | 订单不存在/无权查看 |

**迁移路由：** `GET /api/order/:orderId`

---

## 4. cancel - 用户取消订单

**说明：** 用户取消订单。仅 PENDING_ACCEPT 状态可取消。

**调用方式：**
```js
callFunction('order', {
  action: 'cancel',
  orderId: 'order_xxx',
  reason: '不想吃了'
})
```

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| orderId | string | 是 | 订单ID |
| reason | string | 否 | 取消原因（最多200字） |

**出参：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "orderId": "order_xxx"
  }
}
```

**错误码：**

| 错误码 | 说明 |
|--------|------|
| 1001 | 缺少订单ID |
| 2001 | 订单不存在/无权操作 |
| 2002 | 当前状态不可取消 |

**服务端逻辑：**
1. 校验订单存在且属于当前用户
2. 校验状态为 PENDING_ACCEPT
3. 更新状态为 CANCELLED，记录取消原因和时间

**迁移路由：** `POST /api/order/:orderId/cancel`

---

## 5-9. B端接口（Sprint 6 待开发）

| Action | 迁移路由 | 说明 |
|--------|---------|------|
| `getMerchantOrders` | `GET /api/merchant/orders` | 商户获取订单列表 |
| `accept` | `POST /api/order/:id/accept` | 商户接单 |
| `reject` | `POST /api/order/:id/reject` | 商户拒单（含原因） |
| `markReady` | `POST /api/order/:id/ready` | 标记出餐 |
| `complete` | `POST /api/order/:id/complete` | 确认完成 |

---

## 订单数据结构

### orders 集合

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 记录ID |
| `order_no` | string | 展示用订单编号 |
| `user_id` | string | 下单用户 openid |
| `merchant_id` | string | 商户ID |
| `merchant_name` | string | 商家名称（快照） |
| `merchant_avatar` | string | 商家头像（快照） |
| `items` | array | 商品快照列表 |
| `total_price` | number | 商品总价（分） |
| `packing_fee` | number | 打包费（分） |
| `delivery_fee` | number | 配送费（分） |
| `actual_price` | number | 实付金额（分） |
| `status` | string | 订单状态 |
| `remark` | string | 用户备注 |
| `cancel_reason` | string | 取消原因 |
| `is_reviewed` | boolean | 是否已评价 |
| `is_settled` | boolean | 是否已结算 |
| `paid_at` | timestamp | 支付时间 |
| `accepted_at` | timestamp | 接单时间 |
| `ready_at` | timestamp | 出餐时间 |
| `completed_at` | timestamp | 完成时间 |
| `cancelled_at` | timestamp | 取消时间 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

### items 内嵌结构

```json
{
  "product_id": "xxx",
  "name": "蛋炒饭",
  "image": "cloud://xxx",
  "specs": [{ "group": "份量", "selected": "大份" }],
  "unit_price": 1700,
  "quantity": 1,
  "subtotal": 1700
}
```

### 索引

| 索引名 | 字段 | 用途 |
|--------|------|------|
| `idx_user_created` | `user_id` + `created_at desc` | 用户订单列表 |
| `idx_merchant_status_created` | `merchant_id` + `status` + `created_at desc` | 商户按状态筛选 |
| `idx_order_no` | `order_no` (唯一) | 订单编号查找 |
