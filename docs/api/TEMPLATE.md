# [模块名] 接口文档

> 云函数名：`[function_name]`
> 负责 Sprint：S[x]

## 接口列表

| Action | 说明 | 鉴权 |
|--------|------|------|
| actionName | 描述 | 是/否 |

---

## [action] actionName

### 描述
简要说明

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 固定值 `"actionName"` |
| param1 | string | 是 | 说明 |

### 响应数据

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "field1": "value1"
  }
}
```

### data 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| field1 | string | 说明 |

### 错误码

| 错误码 | 说明 |
|--------|------|
| 1001 | 参数错误 |

### 调用示例

```js
const result = await callFunction('functionName', {
  action: 'actionName',
  param1: 'value1'
})
```

---
