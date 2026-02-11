# 胖兄弟外卖 - 数据库设计文档

本文档描述微信云开发数据库中所有集合的字段定义、索引设计以及安全规则建议。

---

## 目录

1. [users - 用户表](#users---用户表)
2. [merchants - 商户表](#merchants---商户表)
3. [categories - 分类表](#categories---分类表)
4. [products - 商品表](#products---商品表)
5. [orders - 订单表](#orders---订单表)
6. [reviews - 评价表](#reviews---评价表)
7. [settlements - 结算表](#settlements---结算表)
8. [安全规则总览](#安全规则总览)

---

## users - 用户表

存储小程序用户基本信息和角色。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 记录 ID |
| `_openid` | string | 自动 | 微信 OpenID（云开发自动填充） |
| `nick_name` | string | 否 | 用户昵称 |
| `avatar_url` | string | 否 | 头像 URL |
| `phone` | string | 否 | 手机号 |
| `role` | string | 是 | 角色：`user` / `merchant` / `admin` |
| `created_at` | timestamp | 是 | 创建时间 |
| `updated_at` | timestamp | 是 | 更新时间 |

### 索引

| 索引名 | 字段 | 排序 | 唯一 | 用途 |
|--------|------|------|------|------|
| `idx_openid` | `_openid` | asc | 是 | 通过 OpenID 快速查找用户 |

### 安全规则

```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

- 用户只能读写自己的记录。
- 创建记录时 `_openid` 由云开发自动注入，不可伪造。
- 角色变更（如升级为商户）应通过云函数操作，不允许客户端直接修改 `role` 字段。

---

## merchants - 商户表

存储商户（店铺）信息，包括位置、邀请码和推荐关系。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 记录 ID |
| `user_id` | string | 是 | 关联的用户 ID |
| `mch_id` | string | 否 | 微信支付商户号 |
| `shop_name` | string | 是 | 店铺名称 |
| `shop_avatar` | string | 否 | 店铺头像 URL |
| `announcement` | string | 否 | 店铺公告 |
| `contact_name` | string | 是 | 联系人姓名 |
| `contact_phone` | string | 是 | 联系人电话 |
| `status` | string | 是 | 状态：`pending` / `active` / `disabled` |
| `is_open` | boolean | 是 | 是否正在营业 |
| `location` | geopoint | 否 | 店铺 GPS 坐标 |
| `invite_code` | string | 是 | 唯一邀请码 |
| `referrer_id` | string | 否 | 直接推荐人商户 ID |
| `indirect_referrer_id` | string | 否 | 间接推荐人商户 ID |
| `rating` | number | 否 | 评分（默认 5.0） |
| `monthly_sales` | number | 否 | 月销量（默认 0） |
| `created_at` | timestamp | 是 | 创建时间 |
| `updated_at` | timestamp | 是 | 更新时间 |

### 索引

| 索引名 | 字段 | 排序 | 唯一 | 用途 |
|--------|------|------|------|------|
| `idx_user_id` | `user_id` | asc | 是 | 通过用户 ID 查找商户 |
| `idx_invite_code` | `invite_code` | asc | 是 | 通过邀请码查找商户 |
| `idx_location` | `location` | 2dsphere | 否 | 附近商户地理位置查询 |
| `idx_status_is_open` | `status` + `is_open` | asc, asc | 否 | 筛选营业中的有效商户 |

### 安全规则

```json
{
  "read": "doc.status == 'active' || resource.user_id == auth.openid",
  "write": "resource.user_id == auth.openid"
}
```

- C 端用户可以读取状态为 `active` 的商户信息（用于商户列表展示）。
- 商户仅可读写自己的记录（通过 `user_id` 匹配）。
- 状态变更（`status`）应通过云函数由管理员操作。

---

## categories - 分类表

存储商户的商品分类。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 记录 ID |
| `merchant_id` | string | 是 | 所属商户 ID |
| `name` | string | 是 | 分类名称 |
| `sort_order` | number | 是 | 排序权重（数字越小越靠前） |
| `created_at` | timestamp | 是 | 创建时间 |

### 索引

| 索引名 | 字段 | 排序 | 唯一 | 用途 |
|--------|------|------|------|------|
| `idx_merchant_sort` | `merchant_id` + `sort_order` | asc, asc | 否 | 按商户查询分类并排序 |

### 安全规则

```json
{
  "read": true,
  "write": "get('database.merchants.${resource.merchant_id}').user_id == auth.openid"
}
```

- 所有用户可读取分类（用于浏览商品菜单）。
- 只有该分类所属商户的拥有者可以增删改。

---

## products - 商品表

存储商品信息，包括规格组（内嵌数组）。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 记录 ID |
| `merchant_id` | string | 是 | 所属商户 ID |
| `category_id` | string | 是 | 所属分类 ID |
| `name` | string | 是 | 商品名称 |
| `image` | string | 否 | 商品图片 URL |
| `description` | string | 否 | 商品描述 |
| `base_price` | number | 是 | 基础价格（单位：分） |
| `spec_groups` | array | 否 | 规格组（内嵌文档数组） |
| `is_on_sale` | boolean | 是 | 是否在售 |
| `sort_order` | number | 是 | 排序权重 |
| `created_at` | timestamp | 是 | 创建时间 |
| `updated_at` | timestamp | 是 | 更新时间 |

#### spec_groups 内嵌结构

```json
{
  "name": "规格",
  "specs": [
    { "name": "大份", "price_delta": 500 },
    { "name": "小份", "price_delta": 0 }
  ]
}
```

`price_delta` 为在 `base_price` 基础上的加价（单位：分）。

### 索引

| 索引名 | 字段 | 排序 | 唯一 | 用途 |
|--------|------|------|------|------|
| `idx_merchant_category` | `merchant_id` + `category_id` | asc, asc | 否 | 按商户和分类查询商品 |
| `idx_merchant_on_sale` | `merchant_id` + `is_on_sale` | asc, asc | 否 | 筛选商户在售商品 |

### 安全规则

```json
{
  "read": "doc.is_on_sale == true || get('database.merchants.${resource.merchant_id}').user_id == auth.openid",
  "write": "get('database.merchants.${resource.merchant_id}').user_id == auth.openid"
}
```

- C 端用户可以读取 `is_on_sale == true` 的商品。
- 商户拥有者可以读写自己店铺的所有商品（包括已下架的）。

---

## orders - 订单表

存储订单信息。为防止客户端篡改，订单的创建和状态变更均应通过云函数执行。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 记录 ID |
| `order_no` | string | 是 | 展示用订单编号 |
| `user_id` | string | 是 | 下单用户 ID |
| `merchant_id` | string | 是 | 商户 ID |
| `items` | array | 是 | 订单商品快照 |
| `total_price` | number | 是 | 商品总价（分） |
| `packing_fee` | number | 是 | 打包费（分） |
| `delivery_fee` | number | 是 | 配送费（分） |
| `actual_price` | number | 是 | 实付金额（分） |
| `status` | string | 是 | 订单状态 |
| `remark` | string | 否 | 用户备注 |
| `cancel_reason` | string | 否 | 取消原因 |
| `payment_id` | string | 否 | 微信支付交易 ID |
| `paid_at` | timestamp | 否 | 支付时间 |
| `accepted_at` | timestamp | 否 | 接单时间 |
| `ready_at` | timestamp | 否 | 出餐时间 |
| `completed_at` | timestamp | 否 | 完成时间 |
| `cancelled_at` | timestamp | 否 | 取消时间 |
| `is_settled` | boolean | 是 | 是否已结算（默认 false） |
| `created_at` | timestamp | 是 | 创建时间 |
| `updated_at` | timestamp | 是 | 更新时间 |

#### 订单状态流转

```
pending_payment -> paid -> accepted -> ready -> completed
                     \        \          \-> cancelled
                      \        \-> cancelled
                       \-> cancelled
```

| 状态 | 说明 |
|------|------|
| `pending_payment` | 待支付 |
| `paid` | 已支付，待商户接单 |
| `accepted` | 商户已接单，制作中 |
| `ready` | 出餐完成，待取餐 |
| `completed` | 订单完成 |
| `cancelled` | 已取消 |

#### items 内嵌结构

```json
{
  "product_id": "xxx",
  "name": "宫保鸡丁",
  "image": "cloud://xxx",
  "specs": [{ "group": "规格", "selected": "大份" }],
  "unit_price": 2500,
  "quantity": 2,
  "subtotal": 5000
}
```

### 索引

| 索引名 | 字段 | 排序 | 唯一 | 用途 |
|--------|------|------|------|------|
| `idx_user_created` | `user_id` + `created_at` | asc, desc | 否 | 用户查看自己的订单列表（按时间倒序） |
| `idx_merchant_status_created` | `merchant_id` + `status` + `created_at` | asc, asc, desc | 否 | 商户按状态筛选订单 |
| `idx_order_no` | `order_no` | asc | 是 | 通过订单编号唯一查找 |

### 安全规则

```json
{
  "read": "doc.user_id == auth.openid || doc.merchant_id == auth.openid",
  "write": false
}
```

- 下单用户和对应商户可以读取订单。
- **所有写操作（创建、状态变更、取消）必须通过云函数执行**，客户端不允许直接写入。
- 这样可以确保价格计算、库存扣减和状态流转的正确性。

---

## reviews - 评价表

存储用户对已完成订单的评价。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 记录 ID |
| `order_id` | string | 是 | 关联的订单 ID |
| `user_id` | string | 是 | 评价用户 ID |
| `merchant_id` | string | 是 | 被评价商户 ID |
| `rating` | number | 是 | 评分（1-5） |
| `content` | string | 否 | 评价文字内容 |
| `created_at` | timestamp | 是 | 创建时间 |

### 索引

| 索引名 | 字段 | 排序 | 唯一 | 用途 |
|--------|------|------|------|------|
| `idx_order_id` | `order_id` | asc | 否 | 通过订单 ID 查找评价 |
| `idx_merchant_created` | `merchant_id` + `created_at` | asc, desc | 否 | 查看商户的评价列表（按时间倒序） |

### 安全规则

```json
{
  "read": true,
  "write": "doc._openid == auth.openid && !doc._id"
}
```

- 所有用户可以读取评价（商户详情页展示评价列表）。
- 用户仅可创建自己的评价（`_openid` 自动匹配），不可修改或删除。
- 建议在云函数中进一步校验：订单是否存在、是否已完成、是否已评价过。

---

## settlements - 结算表

存储订单结算明细，包括平台佣金和推荐人分成。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 记录 ID |
| `order_id` | string | 是 | 关联订单 ID |
| `merchant_id` | string | 是 | 商户 ID |
| `order_amount` | number | 是 | 订单金额（分） |
| `commission_rate` | number | 是 | 佣金比例（如 0.10 表示 10%） |
| `commission_amount` | number | 是 | 佣金总额（分） |
| `platform_amount` | number | 是 | 平台分成（分） |
| `referrer_amount` | number | 是 | 直接推荐人分成（分） |
| `indirect_referrer_amount` | number | 是 | 间接推荐人分成（分） |
| `status` | string | 是 | 状态：`pending` / `completed` / `reversed` |
| `created_at` | timestamp | 是 | 创建时间 |

### 索引

| 索引名 | 字段 | 排序 | 唯一 | 用途 |
|--------|------|------|------|------|
| `idx_order_id` | `order_id` | asc | 否 | 通过订单 ID 查找结算记录 |
| `idx_merchant_created` | `merchant_id` + `created_at` | asc, desc | 否 | 商户结算记录列表 |

### 安全规则

```json
{
  "read": false,
  "write": false
}
```

- **结算表不允许客户端直接读写。**
- 所有结算操作（创建、状态变更）必须通过云函数执行。
- 商户查看结算数据时，通过云函数查询并返回脱敏后的数据。

---

## 安全规则总览

下表汇总了所有集合的安全规则策略：

| 集合 | 客户端读 | 客户端写 | 说明 |
|------|----------|----------|------|
| `users` | 仅自己 | 仅自己 | 角色变更通过云函数 |
| `merchants` | 活跃商户公开 + 自己 | 仅自己 | 状态审核通过云函数 |
| `categories` | 全部公开 | 仅商户拥有者 | - |
| `products` | 在售商品公开 + 商户拥有者 | 仅商户拥有者 | - |
| `orders` | 用户 + 商户各自可见 | 禁止 | 全部通过云函数操作 |
| `reviews` | 全部公开 | 仅创建 | 不可修改删除 |
| `settlements` | 禁止 | 禁止 | 全部通过云函数操作 |

### 通用建议

1. **敏感字段保护**：`role`、`status`、`is_settled` 等关键状态字段不应允许客户端直接修改，统一通过云函数操作。
2. **价格校验**：订单中的金额必须在云函数中根据当前商品价格重新计算，不信任客户端传入的价格。
3. **数据快照**：订单中的 `items` 数组存储下单时的商品信息快照，与商品表解耦，确保历史订单数据不受商品修改影响。
4. **时间戳**：`created_at` 和 `updated_at` 建议在云函数中使用 `db.serverDate()` 生成，确保时间一致性。
5. **软删除**：建议不直接删除记录，而是通过状态字段（如 `disabled`）标记，保留数据完整性。
