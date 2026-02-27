# 骑手配送功能需求说明文档

> 版本：v1.0
> 日期：2026-02-27
> 状态：已确认，分阶段落地

---

## 一、背景与目标

平台当前支持用户自取模式。为满足外卖配送场景，新增"骑手"角色，实现：
- 用户下单时可选择"外卖配送"并填写收货地址
- 骑手注册后可在线抢单并完成配送
- 平台提供派单追踪、送达确认等全流程管控

**当前阶段约束（第一阶段）：**
- 平台无支付牌照，不做资金归集
- 微信支付分账上限 30%，当前平台佣金已占 10%
- 配送费可能超出剩余可分账额度
- **配送费结算：第一阶段由商家线下（微信转账）直接支付给骑手，平台仅做账务记录**

---

## 二、前置需求（本次实现）

### 2.1 用户收货地址体系

用户可以管理多个收货地址，下单时选择送货地址。

#### 数据库集合：`user_addresses`

```javascript
{
  _id: string,           // 自动生成
  _openid: string,       // 用户 openid
  name: string,          // 收件人姓名
  phone: string,         // 联系电话
  address: string,       // 详细地址（省市区+门牌）
  address_detail: string,// 楼栋/单元/门牌号等补充信息
  lat: number,           // 纬度
  lng: number,           // 经度
  is_default: boolean,   // 是否默认地址
  created_at: timestamp,
  updated_at: timestamp
}
```

#### 云函数 Actions（user 云函数）

| Action | 说明 |
|--------|------|
| `getAddresses` | 获取用户地址列表 |
| `addAddress` | 新增地址 |
| `updateAddress` | 修改地址 |
| `deleteAddress` | 删除地址 |
| `setDefaultAddress` | 设为默认地址 |

#### 前端页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 地址列表 | `pages/address/list/index` | 显示所有地址，支持新增/编辑/删除/设默认 |
| 地址编辑 | `pages/address/edit/index` | 新增或编辑单个地址（含地图选点） |

#### 入口

- "我的" → 收货地址
- 下单确认页（后续骑手功能接入时使用）

---

### 2.2 商家退款功能

#### 现状问题
- 商家拒单已自动触发退款（`reject()` → `createRefund()`）
- 用户主动取消仅支持 `PENDING_PAY` / `PENDING_ACCEPT` 状态
- **缺失**：制作中（`ACCEPTED`）阶段用户无法申请退款

#### 需求扩展

**用户可申请退款的状态范围：**

| 订单状态 | 用户是否可主动退款 | 说明 |
|---------|-----------------|------|
| PENDING_PAY | ✅ | 直接取消（未付款，无需退款流程） |
| PENDING_ACCEPT | ✅ | 取消并退款 |
| ACCEPTED | ✅ **新增** | 制作中，用户仍可申请退款（商家出餐前） |
| READY | ❌ | 餐品已备好，不可退 |
| COMPLETED | ❌ | 已完成 |

**退款流程（ACCEPTED 状态）：**
1. 用户点击"申请退款" → 弹窗确认并填写原因
2. 调用 `cancel()` 云函数（扩展支持 ACCEPTED 状态）
3. 自动触发 `createRefund()` 发起微信退款
4. 订单状态变更为 `CANCELLED`，释放已用优惠券
5. 通知商家（订阅消息）

**UI 变更：**
- `order-detail` 页 ACCEPTED 状态增加"申请退款"按钮
- 退款弹窗需用户填写原因（必填）

---

### 2.3 骑手用户体系

#### 角色设计

用户角色新增 `rider`，用户可同时持有多个角色（普通用户身份保留，另建骑手档案）：

```
users.role: 'user' | 'merchant' | 'rider' | 'admin'
```

> 注：骑手注册后 role 更新为 `rider`，原有用户功能不受影响。骑手可正常下单点餐。

#### 数据库集合：`riders`

```javascript
{
  _id: string,
  user_id: string,          // 关联 users._id
  _openid: string,          // 用户 openid（冗余，便于查询）
  real_name: string,        // 真实姓名
  phone: string,            // 联系电话
  id_card_no: string,       // 身份证号（需加密存储，脱敏展示）
  vehicle_type: string,     // 'bicycle'|'electric'|'motorcycle'|'car'
  vehicle_desc: string,     // 车辆描述（如"红色电动车"）
  service_area: string,     // 配送区域描述（如"朝阳区望京街道"）
  status: string,           // 'pending'|'active'|'suspended'
  reject_reason: string,    // 审核拒绝原因
  is_online: boolean,       // 是否在线（接单状态），default: false
  total_orders: number,     // 累计完成配送单数，default: 0
  total_earnings_cents: number, // 累计配送费记账（分），仅记录，不作为资金流
  created_at: timestamp,
  approved_at: timestamp,   // 审核通过时间
  updated_at: timestamp
}
```

#### 审核流程

```
用户填写骑手信息 → 提交申请（status: 'pending'）
    ↓
平台管理员在后台审核（当前简化为：3个工作日内处理）
    ↓
通过 → status: 'active'，user.role 更新为 'rider'
拒绝 → status: 'pending' 保留，填写 reject_reason，用户可修改重新提交
```

#### 云函数：`rider`（新建独立云函数）

| Action | 调用方 | 说明 |
|--------|--------|------|
| `applyRider` | 用户 | 提交骑手申请（首次或修改后重新提交） |
| `getRiderInfo` | 骑手 | 获取自己的骑手档案及审核状态 |
| `updateOnlineStatus` | 骑手 | 切换在线/离线状态 |
| `reviewRider` | 管理员 | 审核通过/拒绝（需 admin 权限） |

#### 前端页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 骑手申请 | `pages/rider/apply/index` | 填写并提交骑手信息 |
| 申请状态 | `pages/rider/status/index` | 查看审核状态、pending 时可修改重提 |

#### 入口

- "我的" 页面：
  - 未申请过骑手：显示"成为骑手"入口
  - 已申请（pending）：显示"申请审核中"
  - 已通过（active）：显示"骑手中心"（跳转 status 页）

---

## 三、第二阶段规划（不在本次实现范围）

### 3.1 骑手配送主流程

**新增订单状态：**

| 状态 | 含义 |
|------|------|
| `DISPATCHING` | 待骑手接单（商家标记出餐后进入） |
| `DELIVERING` | 配送中（骑手接单并取餐后） |

**完整状态链（外卖配送模式）：**
```
PENDING_PAY → PENDING_ACCEPT → ACCEPTED → READY
                                              ↓
                                        DISPATCHING → DELIVERING → COMPLETED
```

**骑手接单流程：**
1. 骑手进入抢单大厅，看到附近商家发布的配送单
2. 骑手接单 → 订单状态：DELIVERING
3. 骑手到商家取餐 → 输入商家出示的取货码验证
4. 骑手送达用户 → 上传送达照片 + 用户确认（或30分钟超时自动完成）

### 3.2 位置追踪

- 骑手端：前台每 10 秒上报位置（`wx.getLocation()` 轮询，无需后台定位权限）
- 用户/商家端：每 10 秒轮询最新骑手位置，在 `<map>` 组件中显示

### 3.3 配送费记账到线上结算

**第一阶段记账方案（线下结算）：**
- 平台记录每笔配送单应付骑手的配送费金额
- 商家在订单完成后，手动通过微信转账给骑手
- 骑手在平台可查看每个商家的欠款明细

**第二阶段线上结算方案（需商家开通微信支付"商家转账到零钱"能力）：**
- 商家配置"转账到零钱"资质后，平台代商家自动发起转账
- 无需平台支付牌照，资金流为：商家 → 骑手（直接）
- 平台仅提供接口封装和转账触发能力

---

## 四、技术约束与合规说明

| 约束 | 说明 |
|------|------|
| 无支付牌照 | 平台不能做资金归集，不设骑手钱包 |
| 分账 30% 上限 | 现有佣金占 10%，剩余 20% 空间无法覆盖所有配送费场景 |
| 配送费结算 | 第一阶段：平台记账 + 商家线下转账给骑手 |
| 骑手身份证信息 | 需加密存储，接入第三方 OCR 实名核验（二期） |
| 后台定位权限 | 不申请，改用前台轮询上报（满足配送场景需求） |

---

## 五、验收标准

### 2.1 地址功能
- [ ] 用户可新增/编辑/删除收货地址
- [ ] 可设置默认地址
- [ ] 地址列表展示正常
- [ ] 我的页面有地址管理入口

### 2.2 退款功能
- [ ] ACCEPTED 状态可申请退款
- [ ] 退款需填写原因
- [ ] 退款成功后订单状态变为 CANCELLED
- [ ] 已用优惠券自动释放
- [ ] 商家收到取消通知

### 2.3 骑手申请
- [ ] 用户可填写骑手信息并提交
- [ ] 我的页面展示骑手入口/申请状态
- [ ] 已通过骑手可查看自己的骑手档案
- [ ] 待审核状态下可修改信息重新提交
