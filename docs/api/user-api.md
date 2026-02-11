# 用户模块 接口文档

> 云函数名：`user`
> 负责 Sprint：S1
> 状态：**已完成**

## 接口列表

| Action | 说明 | 鉴权 | 迁移后路由 |
|--------|------|------|-----------|
| login | 微信登录/注册 | 否（云函数自动获取 openid） | `POST /api/user/login` |
| getUserInfo | 获取用户信息 | 是 | `GET /api/user/info` |
| updateProfile | 更新用户信息 | 是 | `PUT /api/user/profile` |

---

## login

### 描述

微信授权登录。如用户不存在则自动创建用户记录，返回用户信息及关联的商户信息（如有）。
云函数内部通过 `cloud.getWXContext()` 获取 `OPENID`，无需客户端传递。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 固定值 `"login"` |

### 响应数据

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userInfo": {
      "_id": "user_xxx",
      "nick_name": "微信用户",
      "avatar_url": "https://...",
      "phone": "",
      "role": "user",
      "created_at": "2026-02-10T12:00:00.000Z"
    },
    "merchantInfo": null,
    "isNew": false
  }
}
```

### data 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| userInfo | Object | 用户信息 |
| userInfo._id | string | 用户ID |
| userInfo.nick_name | string | 昵称（新用户为空字符串） |
| userInfo.avatar_url | string | 头像URL（新用户为空字符串） |
| userInfo.phone | string | 手机号（未绑定为空字符串） |
| userInfo.role | string | 角色：`user` / `merchant` / `admin` |
| userInfo.created_at | timestamp | 创建时间 |
| merchantInfo | Object\|null | 关联商户信息，未入驻为 `null` |
| isNew | boolean | 是否新注册用户 |

### 业务逻辑

1. 通过 `_openid` 查询 `users` 集合
2. 如存在 → 更新 `updated_at`，返回已有用户信息
3. 如不存在 → 创建新用户记录（role 默认为 `user`）
4. 查询 `merchants` 集合，返回关联商户信息

### 调用示例

```js
const data = await userService.login()
// data = { userInfo, merchantInfo, isNew }
```

---

## getUserInfo

### 描述

获取当前登录用户的详细信息，包括关联的商户信息。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 固定值 `"getUserInfo"` |

### 响应数据

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userInfo": {
      "_id": "user_xxx",
      "nick_name": "微信用户",
      "avatar_url": "https://...",
      "phone": "138****8888",
      "role": "merchant",
      "created_at": "2026-02-10T12:00:00.000Z"
    },
    "merchantInfo": {
      "_id": "merchant_xxx",
      "shop_name": "胖兄弟奶茶",
      "status": "active",
      "is_open": true
    }
  }
}
```

### data 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| userInfo | Object | 用户完整信息（字段同 login） |
| merchantInfo | Object\|null | 商户信息，包含完整商户字段 |

### 错误码

| 错误码 | 说明 |
|--------|------|
| 1002 | 用户未登录或不存在 |

### 调用示例

```js
const data = await userService.getUserInfo()
// data = { userInfo, merchantInfo }
```

---

## updateProfile

### 描述

更新用户个人信息（昵称、头像）。仅传入的字段会被更新。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 固定值 `"updateProfile"` |
| nick_name | string | 否 | 新昵称 |
| avatar_url | string | 否 | 新头像URL（来自微信头像选择器或云存储） |

### 响应数据

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userInfo": {
      "_id": "user_xxx",
      "nick_name": "新昵称",
      "avatar_url": "https://...",
      "phone": "",
      "role": "user",
      "created_at": "2026-02-10T12:00:00.000Z"
    }
  }
}
```

### data 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| userInfo | Object | 更新后的用户信息 |

### 错误码

| 错误码 | 说明 |
|--------|------|
| 1002 | 用户未登录或不存在 |

### 调用示例

```js
const data = await userService.updateProfile({
  nick_name: '新昵称',
  avatar_url: 'cloud://xxx/avatar.jpg'
})
// data = { userInfo }
```

---

## 前端集成说明

### 登录流程

1. 用户点击"登录"按钮 → 弹出授权弹窗
2. 确认授权 → 调用 `app.login()`
3. `app.login()` 调用 `userService.login()` → 云函数 `user/login`
4. 返回后保存到 `app.globalData` 和 `wx.setStorageSync`
5. 刷新页面状态

### 登录态恢复

- `app.onLaunch()` 时调用 `_restoreLoginState()` 从 Storage 恢复
- 页面 `onShow()` 时从 `app.globalData` 读取最新状态

### 服务层调用

```js
const userService = require('../../services/user')

// 登录
const { userInfo, merchantInfo, isNew } = await userService.login()

// 获取用户信息
const { userInfo, merchantInfo } = await userService.getUserInfo()

// 更新个人信息
const { userInfo } = await userService.updateProfile({ nick_name: '新名字' })
```
