# 商户模块 接口文档

> 云函数名：`merchant`
> 负责 Sprint：S2, S7
> 状态：**已完成**

## 接口列表

| Action | 说明 | 鉴权 | 迁移后路由 |
|--------|------|------|-----------|
| verifyInviteCode | 验证邀请码 | 是 | `POST /api/merchant/verify-invite` |
| apply | 提交入驻申请 | 是 | `POST /api/merchant/apply` |
| getApplyStatus | 查询申请状态 | 是 | `GET /api/merchant/apply-status` |
| getMerchantInfo | 获取商户信息 | 部分 | `GET /api/merchant/info` |
| updateSettings | 更新店铺设置 | 是(商户) | `PUT /api/merchant/settings` |
| toggleStatus | 切换营业状态 | 是(商户) | `POST /api/merchant/toggle-status` |
| getInviteRecords | 获取推荐记录 | 是(商户) | `GET /api/merchant/invite-records` |
| getNearbyList | 获取附近商家 | 否 | `GET /api/merchant/nearby` |
| search | 搜索商家 | 否 | `GET /api/merchant/search` |

---

## verifyInviteCode

### 描述
验证邀请码是否有效。查找拥有该邀请码且状态为 active 的商户。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | `"verifyInviteCode"` |
| code | string | 是 | 6位邀请码 |

### 响应数据
```json
{ "code": 0, "message": "success", "data": { "valid": true, "referrerShopName": "胖兄弟奶茶" } }
```

### 错误码
| 错误码 | 说明 |
|--------|------|
| 1001 | 未输入邀请码 |
| 2001 | 邀请码无效或对应商户已停用 |

---

## apply

### 描述
提交商户入驻申请。自动验证邀请码、构建2级推荐链、生成新邀请码。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | `"apply"` |
| invite_code | string | 是 | 邀请码 |
| shop_name | string | 是 | 店铺名称(2-20字符) |
| contact_name | string | 是 | 联系人(2-10字符) |
| contact_phone | string | 是 | 手机号(11位) |
| mch_id | string | 否 | 微信商户号 |

### 响应数据
```json
{ "code": 0, "message": "success", "data": { "merchantId": "xxx", "status": "pending" } }
```

### 业务逻辑
1. 参数验证 → 2. 查用户 → 3. 检查重复申请 → 4. 验证邀请码 → 5. 构建推荐链(referrer_id + indirect_referrer_id) → 6. 生成新邀请码 → 7. 创建商户记录(status=pending) → 8. 更新用户role为merchant

### 错误码
| 错误码 | 说明 |
|--------|------|
| 1001 | 参数错误 |
| 1002 | 未登录 |
| 1005 | 已是商户/已有待审核申请 |
| 2001 | 邀请码无效 |

---

## getApplyStatus

### 描述
查询当前用户的商户申请状态。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | `"getApplyStatus"` |

### 响应数据
```json
{
  "code": 0, "message": "success",
  "data": {
    "hasApplied": true,
    "merchantInfo": { "_id": "xxx", "shop_name": "...", "status": "pending", "created_at": "..." }
  }
}
```

---

## getMerchantInfo

### 描述
获取商户详情。传 merchantId 查指定商户(C端)，不传查当前用户关联商户(B端)。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | `"getMerchantInfo"` |
| merchantId | string | 否 | 指定商户ID(C端用) |

### 响应数据
```json
{ "code": 0, "message": "success", "data": { "merchantInfo": { /* 完整商户字段 */ } } }
```

### 错误码
| 错误码 | 说明 |
|--------|------|
| 1002 | 未登录 |
| 2002 | 商户不存在 |

---

## updateSettings

### 描述
更新店铺设置(名称、头图、公告、电话)。仅传入的字段会被更新。需商户 active 状态。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | `"updateSettings"` |
| shop_name | string | 否 | 店铺名称 |
| shop_avatar | string | 否 | 店铺头图(云存储fileID) |
| announcement | string | 否 | 店铺公告 |
| contact_phone | string | 否 | 联系电话 |

### 响应数据
```json
{ "code": 0, "message": "success", "data": { "merchantInfo": { /* 更新后完整字段 */ } } }
```

---

## toggleStatus

### 描述
切换营业状态。开店时需传GPS坐标，会更新商户location字段(GeoPoint)。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | `"toggleStatus"` |
| isOpen | boolean | 是 | true=开店 false=闭店 |
| location | object | 开店时必填 | `{ latitude, longitude }` |

### 响应数据
```json
{ "code": 0, "message": "success", "data": { "is_open": true } }
```

---

## getInviteRecords

### 描述
获取当前商户的推荐记录(直接推荐+间接推荐)。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | `"getInviteRecords"` |

### 响应数据
```json
{
  "code": 0, "message": "success",
  "data": {
    "records": [
      { "_id": "xxx", "shop_name": "奶茶小站", "type": "direct", "status": "active", "created_at": "..." }
    ],
    "directCount": 2,
    "indirectCount": 1
  }
}
```

---

## getNearbyList

> 将在 Sprint 4 实现，此处仅占位。

---

## search

### 描述
搜索商家。支持按店铺名称模糊搜索，同时搜索商品名称并返回对应商家。仅返回 active 且营业中的商户。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | `"search"` |
| keyword | string | 是 | 搜索关键词 |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20 |

### 响应数据
```json
{
  "code": 0, "message": "success",
  "data": {
    "list": [
      {
        "_id": "merchant_id",
        "shop_name": "胖兄弟奶茶",
        "shop_avatar": "cloud://...",
        "announcement": "欢迎光临",
        "is_open": true,
        "location": { "type": "Point", "coordinates": [113.xx, 23.xx] }
      }
    ],
    "total": 5
  }
}
```

### 业务逻辑
1. 使用 `db.RegExp` 对 `shop_name` 进行模糊匹配
2. 同时搜索 `products` 集合的 `name` 字段，找到匹配商品对应的 merchant_id
3. 合并两个结果集并去重
4. 只返回 `status=active` 且 `is_open=true` 的商户

### 错误码
| 错误码 | 说明 |
|--------|------|
| 1001 | 未传入关键词 |
