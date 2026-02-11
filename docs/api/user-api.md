# 用户模块 接口文档

> 云函数名：`user`
> 负责 Sprint：S1
> 状态：待开发

## 接口列表

| Action | 说明 | 鉴权 |
|--------|------|------|
| login | 微信登录/注册 | 否 |
| getUserInfo | 获取用户信息 | 是 |
| updateProfile | 更新用户信息 | 是 |

---

## [POST] login

### 描述
微信授权登录。如用户不存在则自动创建，返回用户信息。云函数自动获取 `openid`。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 固定值 `"login"` |

### 响应数据

| 字段 | 类型 | 说明 |
|------|------|------|
| userInfo | Object | 用户信息 |
| userInfo._id | string | 用户ID |
| userInfo.nick_name | string | 昵称 |
| userInfo.avatar_url | string | 头像URL |
| userInfo.phone | string | 手机号 |
| userInfo.role | string | 角色 |
| isNew | boolean | 是否新注册用户 |

---

## [GET] getUserInfo

### 描述
获取当前登录用户的详细信息。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 固定值 `"getUserInfo"` |

### 响应数据

| 字段 | 类型 | 说明 |
|------|------|------|
| userInfo | Object | 用户完整信息 |
| merchantInfo | Object\|null | 商户信息（如果用户是商户） |

---

## [PUT] updateProfile

### 描述
更新用户个人信息（昵称、头像）。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 固定值 `"updateProfile"` |
| nick_name | string | 否 | 新昵称 |
| avatar_url | string | 否 | 新头像URL |

### 响应数据

| 字段 | 类型 | 说明 |
|------|------|------|
| userInfo | Object | 更新后的用户信息 |

---
