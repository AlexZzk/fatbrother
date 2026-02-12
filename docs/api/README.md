# 胖兄弟外卖 - 接口文档

> 版本：v1.0.0
> 最后更新：2026-02-10

## 概述

本文档描述「胖兄弟外卖」小程序的全部接口。当前基于 **微信云开发** 实现，后续将迁移至 **Java Spring Boot** 后端。

### 调用约定

**当前（云开发阶段）**

所有接口统一通过 `wx.cloud.callFunction` 调用，前端通过 `services/request.js` 封装：

```js
const { callFunction } = require('../../services/request')
// callFunction(cloudFunctionName, { action, ...params })
```

**云函数路由模式**

每个云函数模块（如 `user`、`merchant`、`product`、`order`）内部通过 `action` 字段路由到具体方法：

```js
// 示例：调用用户登录
callFunction('user', { action: 'login' })

// 示例：调用获取商户信息
callFunction('merchant', { action: 'getMerchantInfo', merchantId: 'xxx' })
```

**统一响应格式**

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

**错误码约定**

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 未登录/登录过期 |
| 1003 | 无权限 |
| 1004 | 数据不存在 |
| 1005 | 业务逻辑错误 |
| 2001 | 邀请码无效 |
| 2002 | 商户不存在 |
| 2003 | 商户未营业 |
| 3001 | 商品不存在 |
| 3002 | 商品已下架 |
| 4001 | 订单不存在 |
| 4002 | 订单状态不允许此操作 |
| 4003 | 库存不足 |
| 5001 | 支付失败 |
| 9999 | 系统内部错误 |

### 迁移指南

迁移到 Java 后端时：
1. 将 `services/request.js` 中的 `callFunction` 改为 HTTP 请求
2. 云函数 action 路由转换为 RESTful URL：
   - `callFunction('user', { action: 'login' })` → `POST /api/user/login`
   - `callFunction('merchant', { action: 'getNearbyList', ... })` → `GET /api/merchant/nearby?...`
3. 响应格式保持不变
4. 鉴权从云函数内置 openid 改为 JWT Token

## 接口模块

| 模块 | 文档 | 云函数 | Sprint | 状态 |
|------|------|--------|--------|------|
| 用户模块 | [user-api.md](./user-api.md) | `user` | S1 | **已完成** |
| 商户模块 | [merchant-api.md](./merchant-api.md) | `merchant` | S2 | **已完成** |
| 商品模块 | [product-api.md](./product-api.md) | `product` | S3 | **已完成** |
| 订单模块 | [order-api.md](./order-api.md) | `order` | S5-S7 | **已完成** |
| 公共模块 | [common-api.md](./common-api.md) | `common` | S7 | **已完成** |
