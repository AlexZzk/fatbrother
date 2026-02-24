# 商户入驻流程说明

## 1. 完整用户流程

### Step 1：引导页（merchant/guide）

用户在「我的」Tab 点击「商户管理」。若 `globalData.merchantInfo` 为 null，则跳转到引导页（`/pages/merchant/guide/index`）。

引导页展示入驻权益，并提供两个操作：
- **「我要入驻开店」** → 跳转到申请页
- **「已提交申请？查看审核进度 >」** → 跳转到审核进度页

---

### Step 2：申请页（merchant/apply）

用户填写申请表单：

| 字段 | 是否必填 | 说明 |
|---|---|---|
| invite_code | 否 | 现有激活商户的邀请码 |
| shop_name | 是 | 2～20 个字符 |
| contact_name | 是 | 2～10 个字符 |
| contact_phone | 是 | 11 位手机号 |
| mch_id | 否 | 微信支付商户号（可在设置中补填） |

提交后调用云函数 `merchant/apply`，该函数会：

1. 验证表单输入
2. 检查重复申请（已有 pending 或 active 记录时返回错误）
3. 若填写了邀请码，验证其有效性
4. 为新商户生成唯一 6 位邀请码
5. 在 merchants 集合中创建记录，`status: 'pending'`
6. 更新 users 集合中该用户的 role 为 `'merchant'`
7. 返回 `{ merchantId, status: 'pending' }`

申请成功后：
- 调用 `merchantService.getApplyStatus()` 获取 pending 状态
- 更新 `app.globalData.merchantInfo` 并写入本地存储
- 1.5 秒后跳转到审核进度页

---

### Step 3：审核进度页（merchant/pending）

页面加载时调用 `getApplyStatus()`。若 status 为 `'active'` 则立即跳转到商户后台；否则展示申请详情和「审核中」状态。

---

### Step 4：管理员审核（微信云开发控制台）

**V1.0 没有管理员审核 UI。** 审核操作通过微信云开发控制台手动完成：

1. 打开微信小程序管理后台，进入「云开发」→「数据库」
2. 选择对应环境，找到 **merchants** 集合
3. 使用右上角筛选条件：`status = "pending"`，找到待审核记录
4. 点击该记录右侧的「编辑」按钮
5. 将 `status` 字段的值从 `"pending"` 改为 `"active"`
6. 点击「确定」保存

> 注意：用户的 role 字段在申请时已由云函数更新为 `'merchant'`，审核通过时无需再修改 users 集合。

---

### Step 5：审核通过后的用户体验

管理员将 status 设置为 `'active'` 后：

- **用户下次打开 App**：
  - `app.js` 的 `_restoreLoginState()` 从本地存储恢复 merchantInfo
  - `mine/index.js` 的 `_refreshUserState()` 调用 `getApplyStatus()` 获取最新状态
  - 若 status 变为 `'active'`，更新 globalData 和本地存储
- **用户点击「商户管理」**：直接路由到商户后台（`/pages/merchant/dashboard/index`）
- **审核进度页**（若用户仍停留）：下次 `onShow` 时 `_loadStatus()` 检测到 `status === 'active'`，自动调用 `wx.redirectTo` 跳转到后台

---

## 2. 状态机说明

```
null（未申请）
  ↓ [提交申请]
'pending'（审核中）
  ↓ [管理员在云控制台设置 status='active']
'active'（已激活）
```

---

## 3. 本地存储 & globalData 关键字段

| 存储键 | 说明 |
|---|---|
| `wx.setStorageSync('merchantInfo', ...)` | 持久化商户信息，App 重启后可恢复 |
| `app.globalData.merchantInfo` | 运行时商户信息，mine 页路由决策依据 |

**持久化时机：**
- `app.login()` 登录成功后
- `merchant/apply` 申请成功后（`getApplyStatus()` 返回结果）
- `mine/_refreshUserState()` 服务端刷新后

**清除时机：**
- `app.logout()` 退出登录时

---

## 4. 后续计划：管理员审批 UI

V1.0 未开发管理员审批面板。未来版本应包含：

- 列出所有 pending 申请及申请人详情
- 支持一键通过 / 拒绝，拒绝时填写原因
- 审批结果通过微信订阅消息通知申请人
- 仅 `role: 'admin'` 的用户可访问
