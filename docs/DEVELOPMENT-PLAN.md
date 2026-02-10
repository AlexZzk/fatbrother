# 胖兄弟外卖小程序 - 开发拆分与排期文档

> 版本：v1.0.0
> 最后更新：2026-02-10
> 范围：V1.0 MVP 阶段

---

## 一、开发原则

### 1.1 拆分策略

按 **"基础设施 → 数据流通 → 核心链路 → 辅助功能"** 的顺序推进：

1. 先搭建项目骨架、公共组件、云函数基础 —— 后续所有页面依赖这一层
2. 先打通 B 端（商户有数据）再做 C 端（用户看到数据）
3. 每个 Sprint 交付可运行、可验证的功能闭环
4. 支付相关放到最后对接，前期用模拟状态跑通流程

### 1.2 开发规范要求

| 项目 | 规范 |
|------|------|
| 组件化 | 公共UI拆为独立组件（components/），页面级组件放各页面目录 |
| 接口文档 | 每个云函数同步维护接口文档（docs/api/），包含入参、出参、错误码 |
| 数据层抽象 | 云函数调用封装在 services/ 层，页面不直接调用 wx.cloud |
| 样式规范 | 全局变量定义在 styles/variables.wxss，组件样式 scoped |
| 状态管理 | 使用小程序全局 getApp() + 简易 Store 模式 |

### 1.3 项目目录规划

```
miniprogram/
├── app.js / app.json / app.wxss          # 小程序入口
├── styles/
│   ├── variables.wxss                     # 设计系统变量
│   ├── mixins.wxss                        # 公共样式 mixin
│   └── icons.wxss                         # 图标样式
├── components/                            # 公共组件
│   ├── nav-bar/                           # 自定义导航栏
│   ├── tab-bar/                           # 自定义TabBar (C端)
│   ├── shop-card/                         # 商家卡片
│   ├── product-item/                      # 商品条目
│   ├── spec-popup/                        # 规格选择弹窗
│   ├── cart-bar/                          # 购物车底栏
│   ├── cart-popup/                        # 购物车弹窗
│   ├── order-card/                        # 订单卡片
│   ├── stepper/                           # 数量步进器
│   ├── empty-state/                       # 空状态占位
│   ├── price/                             # 价格展示
│   ├── tag/                               # 标签
│   ├── cell/                              # 列表单元格
│   └── toast/                             # 轻提示
├── services/                              # 数据服务层（封装云函数调用）
│   ├── request.js                         # 统一请求封装
│   ├── user.js                            # 用户相关
│   ├── merchant.js                        # 商户相关
│   ├── product.js                         # 商品/分类相关
│   ├── order.js                           # 订单相关
│   └── upload.js                          # 文件上传
├── utils/
│   ├── auth.js                            # 登录态管理
│   ├── cart.js                            # 购物车工具（本地Storage）
│   ├── location.js                        # 定位工具
│   ├── format.js                          # 格式化（价格/距离/时间）
│   └── constants.js                       # 常量（订单状态码等）
├── pages/
│   ├── index/                             # C端-首页
│   ├── search/                            # C端-搜索
│   ├── shop/                              # C端-商家详情
│   ├── order-confirm/                     # C端-订单确认
│   ├── order-result/                      # C端-支付结果
│   ├── order-list/                        # C端-订单列表
│   ├── order-detail/                      # C端-订单详情
│   ├── review/                            # C端-评价
│   ├── mine/                              # C端-我的
│   ├── profile/                           # C端-个人信息
│   ├── bill/                              # C端-账单统计
│   ├── merchant/
│   │   ├── guide/                         # B端-入驻引导
│   │   ├── apply/                         # B端-入驻申请
│   │   ├── pending/                       # B端-审核等待
│   │   ├── dashboard/                     # B端-商户首页
│   │   ├── orders/                        # B端-订单管理
│   │   ├── menu/                          # B端-菜单管理
│   │   ├── product-edit/                  # B端-商品编辑
│   │   ├── spec-config/                   # B端-规格配置
│   │   ├── category/                      # B端-分类管理
│   │   ├── statistics/                    # B端-账单统计
│   │   ├── settings/                      # B端-店铺设置
│   │   └── invite/                        # B端-邀请码
│   └── common/
│       └── webview/                       # 通用WebView页
cloudfunctions/                            # 云函数
│   ├── user/                              # 用户相关
│   ├── merchant/                          # 商户相关
│   ├── product/                           # 商品相关
│   ├── order/                             # 订单相关
│   └── common/                            # 公共工具函数
docs/
│   ├── PRD.md                             # 需求文档
│   ├── UI-UX-DESIGN.md                    # UI/UX设计
│   ├── DEVELOPMENT-PLAN.md                # 本文档
│   └── api/                               # 接口文档
│       ├── README.md                      # 接口文档索引
│       ├── user-api.md                    # 用户接口
│       ├── merchant-api.md                # 商户接口
│       ├── product-api.md                 # 商品接口
│       └── order-api.md                   # 订单接口
```

---

## 二、Sprint 拆分（共 8 个 Sprint）

### Sprint 0：项目基础设施

**目标：搭建可运行的项目骨架，所有后续开发基于此**

| 编号 | 任务 | 类型 | 产出 |
|------|------|------|------|
| S0-1 | 初始化小程序项目结构 | 工程 | app.js/json/wxss、目录结构、project.config.json |
| S0-2 | 设计系统变量 & 全局样式 | 样式 | styles/variables.wxss、app.wxss |
| S0-3 | 基础公共组件开发 | 组件 | nav-bar、tab-bar、cell、tag、stepper、empty-state、price、toast |
| S0-4 | 云开发环境初始化 | 后端 | 云开发环境、数据库集合创建、安全规则 |
| S0-5 | services 层框架 & request 封装 | 工程 | services/request.js 统一调用云函数 |
| S0-6 | 工具函数 | 工具 | utils/ 下 auth.js、format.js、constants.js |
| S0-7 | 接口文档模板 & 索引 | 文档 | docs/api/README.md、文档模板 |

**依赖关系：** 无前置依赖，项目起点

---

### Sprint 1：用户登录 & "我的"页面

**目标：用户能微信授权登录，看到"我的"页面**

| 编号 | 任务 | 类型 | 产出 |
|------|------|------|------|
| S1-1 | 云函数：用户登录/注册 | 后端 | cloudfunctions/user/login |
| S1-2 | 云函数：获取用户信息 | 后端 | cloudfunctions/user/getUserInfo |
| S1-3 | services/user.js | 服务层 | login()、getUserInfo() |
| S1-4 | utils/auth.js 登录态管理 | 工具 | checkLogin()、getToken()、登录拦截逻辑 |
| S1-5 | "我的"页面 (pages/mine) | 页面 | 用户信息展示、菜单列表、未登录态 |
| S1-6 | 个人信息设置页 (pages/profile) | 页面 | 头像/昵称展示、手机号绑定入口（预留） |
| S1-7 | 接口文档：用户模块 | 文档 | docs/api/user-api.md |

**依赖关系：** Sprint 0 完成

**页面清单：**
- `pages/mine/index` — "我的"页面
- `pages/profile/index` — 个人信息

**组件清单：** 复用 S0 组件

**云函数清单：**
- `user/login` — 微信登录，创建/返回用户信息
- `user/getUserInfo` — 获取用户信息

---

### Sprint 2：B端 - 商户入驻 & 店铺基础

**目标：商户能通过邀请码提交入驻申请，审核通过后进入后台**

| 编号 | 任务 | 类型 | 产出 |
|------|------|------|------|
| S2-1 | 云函数：验证邀请码 | 后端 | cloudfunctions/merchant/verifyInviteCode |
| S2-2 | 云函数：提交入驻申请 | 后端 | cloudfunctions/merchant/apply |
| S2-3 | 云函数：查询申请状态 | 后端 | cloudfunctions/merchant/getApplyStatus |
| S2-4 | 云函数：获取商户信息 | 后端 | cloudfunctions/merchant/getMerchantInfo |
| S2-5 | 云函数：更新店铺设置 | 后端 | cloudfunctions/merchant/updateSettings |
| S2-6 | 云函数：切换营业状态（含定位） | 后端 | cloudfunctions/merchant/toggleStatus |
| S2-7 | services/merchant.js | 服务层 | 全部商户相关方法 |
| S2-8 | utils/location.js 定位工具 | 工具 | getLocation()、calculateDistance() |
| S2-9 | 入驻引导页 (merchant/guide) | 页面 | 入驻卖点展示 |
| S2-10 | 入驻申请页 (merchant/apply) | 页面 | 表单：邀请码+店铺信息 |
| S2-11 | 审核等待页 (merchant/pending) | 页面 | 审核状态展示 |
| S2-12 | 商户首页 (merchant/dashboard) | 页面 | 营业状态、今日数据（空数据）、快捷入口 |
| S2-13 | 店铺设置页 (merchant/settings) | 页面 | 基本信息编辑 |
| S2-14 | 邀请码页 (merchant/invite) | 页面 | 邀请码展示与推荐记录 |
| S2-15 | "我的"页面增加商户入口判断 | 页面 | 根据身份显示不同文案 |
| S2-16 | 接口文档：商户模块 | 文档 | docs/api/merchant-api.md |

**依赖关系：** Sprint 1 完成（需要用户登录）

**页面清单：**
- `pages/merchant/guide/index` — 入驻引导
- `pages/merchant/apply/index` — 入驻申请
- `pages/merchant/pending/index` — 审核等待
- `pages/merchant/dashboard/index` — 商户首页
- `pages/merchant/settings/index` — 店铺设置
- `pages/merchant/invite/index` — 邀请码

**云函数清单：**
- `merchant/verifyInviteCode` — 校验邀请码有效性
- `merchant/apply` — 提交入驻申请
- `merchant/getApplyStatus` — 查询审核状态
- `merchant/getMerchantInfo` — 获取商户详情
- `merchant/updateSettings` — 更新店铺信息
- `merchant/toggleStatus` — 开店/闭店（含GPS坐标）

---

### Sprint 3：B端 - 菜单管理（含规格系统）

**目标：商户能管理分类和商品，配置规格/加料**

| 编号 | 任务 | 类型 | 产出 |
|------|------|------|------|
| S3-1 | 云函数：分类 CRUD | 后端 | cloudfunctions/product/categoryManage |
| S3-2 | 云函数：商品 CRUD | 后端 | cloudfunctions/product/productManage |
| S3-3 | 云函数：商品上下架 | 后端 | cloudfunctions/product/toggleSale |
| S3-4 | 云函数：获取商户菜单 | 后端 | cloudfunctions/product/getMenu |
| S3-5 | services/product.js | 服务层 | 分类和商品全部方法 |
| S3-6 | services/upload.js 文件上传 | 服务层 | 图片上传到云存储 |
| S3-7 | 菜单管理页 (merchant/menu) | 页面 | 分类Tab + 商品列表 + 操作按钮 |
| S3-8 | 分类管理页 (merchant/category) | 页面 | 分类增删改排序 |
| S3-9 | 商品编辑页 (merchant/product-edit) | 页面 | 商品表单（含图片上传） |
| S3-10 | 规格配置页 (merchant/spec-config) | 页面 | 规格组增删改、快捷模板 |
| S3-11 | 接口文档：商品模块 | 文档 | docs/api/product-api.md |

**依赖关系：** Sprint 2 完成（需要商户身份）

**页面清单：**
- `pages/merchant/menu/index` — 菜单管理
- `pages/merchant/category/index` — 分类管理
- `pages/merchant/product-edit/index` — 商品编辑
- `pages/merchant/spec-config/index` — 规格配置

**组件清单：** 新增
- `components/image-uploader/` — 图片上传组件

**云函数清单：**
- `product/categoryManage` — 分类增删改查排序
- `product/productManage` — 商品增删改查
- `product/toggleSale` — 商品上下架
- `product/getMenu` — 获取指定商户完整菜单（分类+商品）

---

### Sprint 4：C端 - 首页 & 商家详情 & 购物车

**目标：用户能浏览商家列表、进入商家点餐、选规格、加入购物车**

| 编号 | 任务 | 类型 | 产出 |
|------|------|------|------|
| S4-1 | 云函数：获取附近商家列表 | 后端 | cloudfunctions/merchant/getNearbyList |
| S4-2 | 组件：商家卡片 shop-card | 组件 | 商家头像、名称、评分、距离、公告 |
| S4-3 | 组件：商品条目 product-item | 组件 | 图片、名称、描述、价格、加购按钮 |
| S4-4 | 组件：规格选择弹窗 spec-popup | 组件 | 必选/可选、单选/多选、实时计价 |
| S4-5 | 组件：购物车底栏 cart-bar | 组件 | 图标角标、件数、总价、去结算 |
| S4-6 | 组件：购物车弹窗 cart-popup | 组件 | 商品列表、增减数量、清空 |
| S4-7 | utils/cart.js 购物车工具 | 工具 | 本地Storage管理、按商家隔离 |
| S4-8 | 首页 (pages/index) | 页面 | 定位、搜索框、Banner、商家列表 |
| S4-9 | 商家详情页 (pages/shop) | 页面 | 商家信息、左右联动菜单、购物车 |

**依赖关系：** Sprint 3 完成（数据库中需要有商品数据）

**页面清单：**
- `pages/index/index` — 首页
- `pages/shop/index` — 商家详情

**组件清单：** 新增
- `components/shop-card/` — 商家卡片
- `components/product-item/` — 商品条目
- `components/spec-popup/` — 规格选择弹窗
- `components/cart-bar/` — 购物车底栏
- `components/cart-popup/` — 购物车弹窗

**云函数清单：**
- `merchant/getNearbyList` — 获取营业中的商家列表（含距离排序）

---

### Sprint 5：C端 - 下单流程（不含真实支付）

**目标：用户能提交订单、查看订单列表和详情（支付用模拟）**

| 编号 | 任务 | 类型 | 产出 |
|------|------|------|------|
| S5-1 | 云函数：创建订单 | 后端 | cloudfunctions/order/create |
| S5-2 | 云函数：获取订单列表 | 后端 | cloudfunctions/order/getList |
| S5-3 | 云函数：获取订单详情 | 后端 | cloudfunctions/order/getDetail |
| S5-4 | 云函数：用户取消订单 | 后端 | cloudfunctions/order/cancel |
| S5-5 | services/order.js | 服务层 | 订单全部方法 |
| S5-6 | 组件：订单卡片 order-card | 组件 | 商家名、商品摘要、状态标签、操作按钮 |
| S5-7 | 订单确认页 (pages/order-confirm) | 页面 | 取餐方式、商品清单、价格明细、备注 |
| S5-8 | 支付结果页 (pages/order-result) | 页面 | 成功/失败展示 |
| S5-9 | 订单列表页 (pages/order-list) | 页面 | Tab筛选、订单卡片列表 |
| S5-10 | 订单详情页 (pages/order-detail) | 页面 | 状态、商品明细、订单元信息、操作 |
| S5-11 | 接口文档：订单模块 | 文档 | docs/api/order-api.md |

**依赖关系：** Sprint 4 完成（需要购物车数据）

**页面清单：**
- `pages/order-confirm/index` — 订单确认
- `pages/order-result/index` — 支付结果
- `pages/order-list/index` — 订单列表
- `pages/order-detail/index` — 订单详情

**组件清单：** 新增
- `components/order-card/` — 订单卡片

**云函数清单：**
- `order/create` — 创建订单（含商品快照、价格校验）
- `order/getList` — 获取订单列表（支持按状态筛选、分页）
- `order/getDetail` — 获取订单详情
- `order/cancel` — 用户取消订单

---

### Sprint 6：B端 - 订单管理 & 商户看板数据

**目标：商户能接单/拒单/出餐，看板展示真实数据**

| 编号 | 任务 | 类型 | 产出 |
|------|------|------|------|
| S6-1 | 云函数：商户获取订单列表 | 后端 | cloudfunctions/order/getMerchantOrders |
| S6-2 | 云函数：商户接单 | 后端 | cloudfunctions/order/accept |
| S6-3 | 云函数：商户拒单 | 后端 | cloudfunctions/order/reject |
| S6-4 | 云函数：商户标记出餐 | 后端 | cloudfunctions/order/markReady |
| S6-5 | 云函数：商户确认完成 | 后端 | cloudfunctions/order/complete |
| S6-6 | 云函数：商户今日统计 | 后端 | cloudfunctions/merchant/getTodayStats |
| S6-7 | 云函数：订单超时自动取消（定时触发） | 后端 | cloudfunctions/order/autoCancel |
| S6-8 | B端订单管理页 (merchant/orders) | 页面 | Tab筛选、订单卡片、倒计时、接单/拒单/出餐 |
| S6-9 | B端拒单弹窗 | 组件 | 拒单原因选择 |
| S6-10 | B端新订单提醒（轮询 + 声音 + 振动） | 功能 | 10秒轮询、innerAudioContext 播放提示音 |
| S6-11 | 商户首页看板数据对接 | 页面 | 接入真实今日统计数据 |

**依赖关系：** Sprint 5 完成（需要有订单数据）

**页面清单：**
- `pages/merchant/orders/index` — B端订单管理

**云函数清单：**
- `order/getMerchantOrders` — 商户订单列表（按状态筛选）
- `order/accept` — 商户接单
- `order/reject` — 商户拒单（含原因）
- `order/markReady` — 标记出餐
- `order/complete` — 确认完成
- `merchant/getTodayStats` — 今日订单数/营业额/退款
- `order/autoCancel` — 定时触发器：超时30分钟自动取消

---

### Sprint 7：微信支付对接 & 消息通知 & 收尾

**目标：对接真实微信支付（分账模式）、订阅消息通知、搜索功能**

| 编号 | 任务 | 类型 | 产出 |
|------|------|------|------|
| S7-1 | 云函数：创建支付订单（微信支付） | 后端 | cloudfunctions/order/createPayment |
| S7-2 | 云函数：支付回调处理 | 后端 | cloudfunctions/order/paymentCallback |
| S7-3 | 云函数：发起退款 | 后端 | cloudfunctions/order/refund |
| S7-4 | 云函数：订单完成触发分账 | 后端 | cloudfunctions/order/settlement |
| S7-5 | 云函数：发送订阅消息 | 后端 | cloudfunctions/common/sendMessage |
| S7-6 | C端搜索页 (pages/search) | 页面 | 搜索历史、模糊搜索商家 |
| S7-7 | 云函数：搜索商家 | 后端 | cloudfunctions/merchant/search |
| S7-8 | 订单确认页对接真实支付 | 页面 | wx.requestPayment 调起支付 |
| S7-9 | 订阅消息授权引导 | 功能 | 下单前请求订阅消息权限 |
| S7-10 | 各订单状态变更节点触发通知 | 功能 | 用户侧 + 商户侧消息推送 |
| S7-11 | 全局联调、Bug修复、边界case处理 | 测试 | 全流程测试 |

**依赖关系：** Sprint 6 完成

**页面清单：**
- `pages/search/index` — 搜索页

**云函数清单：**
- `order/createPayment` — 调用微信支付统一下单（分账标记）
- `order/paymentCallback` — 支付成功回调
- `order/refund` — 发起退款
- `order/settlement` — 分账（订单完成后）
- `common/sendMessage` — 发送订阅消息
- `merchant/search` — 商家名称/商品名称模糊搜索

---

## 三、Sprint 依赖关系图

```
Sprint 0 (基础设施)
    │
    ▼
Sprint 1 (用户登录 & 我的)
    │
    ▼
Sprint 2 (B端-商户入驻 & 店铺)
    │
    ▼
Sprint 3 (B端-菜单管理 & 规格)
    │
    ▼
Sprint 4 (C端-首页 & 商家详情 & 购物车)
    │
    ▼
Sprint 5 (C端-下单流程)
    │
    ▼
Sprint 6 (B端-订单管理 & 看板)
    │
    ▼
Sprint 7 (支付 & 通知 & 收尾)
```

---

## 四、公共组件清单

### 4.1 Sprint 0 交付的基础组件

| 组件 | 功能 | Props |
|------|------|-------|
| `nav-bar` | 自定义导航栏 | title, leftArrow, rightText, bgColor, onBack, onRight |
| `custom-tab-bar` | C端底部TabBar | active, list |
| `cell` | 列表单元格 | icon, title, value, arrow, onClick |
| `tag` | 标签 | type(default/primary/success/warning/danger), text |
| `stepper` | 数量步进器 | value, min, max, onChange |
| `empty-state` | 空状态 | icon, text, btnText, onBtnClick |
| `price` | 价格展示 | value(分), size(sm/md/lg), color |
| `toast` | 轻提示 | 通过全局方法调用 showToast(msg, type) |

### 4.2 Sprint 3-4 交付的业务组件

| 组件 | 功能 | 所属Sprint |
|------|------|-----------|
| `image-uploader` | 图片上传（云存储） | S3 |
| `shop-card` | 商家卡片 | S4 |
| `product-item` | 商品条目（含加购按钮） | S4 |
| `spec-popup` | 规格选择弹窗 | S4 |
| `cart-bar` | 购物车底栏 | S4 |
| `cart-popup` | 购物车弹窗 | S4 |
| `order-card` | 订单卡片（C端/B端复用） | S5 |

---

## 五、云函数清单汇总

### 5.1 按模块分类

#### user（用户模块）

| 函数名 | 方法 | 说明 | Sprint |
|--------|------|------|--------|
| user/login | POST | 微信授权登录，自动创建/返回用户 | S1 |
| user/getUserInfo | GET | 获取当前用户信息 | S1 |

#### merchant（商户模块）

| 函数名 | 方法 | 说明 | Sprint |
|--------|------|------|--------|
| merchant/verifyInviteCode | POST | 校验邀请码有效性 | S2 |
| merchant/apply | POST | 提交入驻申请 | S2 |
| merchant/getApplyStatus | GET | 查询审核状态 | S2 |
| merchant/getMerchantInfo | GET | 获取商户详情 | S2 |
| merchant/updateSettings | PUT | 更新店铺信息 | S2 |
| merchant/toggleStatus | POST | 开店/闭店（含GPS） | S2 |
| merchant/getNearbyList | GET | 获取附近营业商家列表 | S4 |
| merchant/search | GET | 搜索商家 | S7 |
| merchant/getTodayStats | GET | 商户今日统计数据 | S6 |

#### product（商品模块）

| 函数名 | 方法 | 说明 | Sprint |
|--------|------|------|--------|
| product/categoryManage | POST | 分类增删改查排序 | S3 |
| product/productManage | POST | 商品增删改查 | S3 |
| product/toggleSale | POST | 商品上/下架 | S3 |
| product/getMenu | GET | 获取商户完整菜单 | S3 |

#### order（订单模块）

| 函数名 | 方法 | 说明 | Sprint |
|--------|------|------|--------|
| order/create | POST | 创建订单（含价格校验） | S5 |
| order/getList | GET | 用户订单列表（分页+筛选） | S5 |
| order/getDetail | GET | 订单详情 | S5 |
| order/cancel | POST | 用户取消订单 | S5 |
| order/getMerchantOrders | GET | 商户订单列表 | S6 |
| order/accept | POST | 商户接单 | S6 |
| order/reject | POST | 商户拒单 | S6 |
| order/markReady | POST | 标记出餐 | S6 |
| order/complete | POST | 确认完成 | S6 |
| order/autoCancel | TRIGGER | 定时：超时自动取消 | S6 |
| order/createPayment | POST | 创建微信支付 | S7 |
| order/paymentCallback | POST | 支付回调 | S7 |
| order/refund | POST | 发起退款 | S7 |
| order/settlement | POST | 订单分账 | S7 |

#### common（公共模块）

| 函数名 | 方法 | 说明 | Sprint |
|--------|------|------|--------|
| common/sendMessage | POST | 发送订阅消息 | S7 |

### 5.2 接口文档格式规范

每个接口文档需包含：

```markdown
## 接口名称

### 基本信息
- 云函数：xxx/yyy
- 方法：GET/POST/PUT
- 需要登录：是/否
- 需要商户权限：是/否

### 请求参数
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|

### 返回结果
| 字段名 | 类型 | 说明 |
|--------|------|------|

### 返回示例
(JSON)

### 错误码
| 错误码 | 说明 |
|--------|------|

### 备注
（补充说明，如迁移到后端时的注意事项）
```

---

## 六、数据库集合与安全规则

### 6.1 集合清单（Sprint 0 创建）

| 集合名 | 说明 | 创建时机 |
|--------|------|---------|
| users | 用户表 | S0 |
| merchants | 商户表 | S0 |
| merchant_applications | 商户入驻申请表 | S0 |
| categories | 商品分类表 | S0 |
| products | 商品表 | S0 |
| orders | 订单表 | S0 |
| reviews | 评价表 | S0（预留） |
| settlements | 分账记录表 | S0（预留） |

### 6.2 安全规则原则

| 规则 | 说明 |
|------|------|
| users | 仅允许用户读取自己的数据，写操作通过云函数 |
| merchants | C端用户可读营业中商户基本信息，写操作通过云函数 |
| products | C端可读上架商品，写操作通过云函数（需商户权限） |
| orders | 用户只能读自己的订单，商户只能读自己店的订单，写操作通过云函数 |
| 其他所有集合 | 客户端不可直接读写，全部通过云函数操作 |

---

## 七、每个Sprint的验收标准

| Sprint | 验收标准 |
|--------|---------|
| S0 | 小程序能编译运行，空白首页+TabBar正常显示，公共组件可在Demo页预览 |
| S1 | 微信授权登录成功，"我的"页面展示真实用户信息，未登录态正确展示 |
| S2 | 填写邀请码+店铺信息 → 提交申请 → 审核通过 → 进入商户后台 → 开/闭店切换正常 |
| S3 | 创建分类 → 添加商品（含图片） → 配置规格/加料 → 上/下架切换 → 菜单数据持久化 |
| S4 | 首页展示商家列表（按距离排序）→ 进入商家详情 → 选规格加购 → 购物车增减清空正常 |
| S5 | 购物车 → 确认订单 → 模拟支付 → 订单列表可见 → 订单详情正确 → 可取消订单 |
| S6 | B端收到新订单 → 接单/拒单 → 出餐 → 完成 → 看板数据正确 → 超时自动取消 |
| S7 | 真实微信支付 → 支付回调 → 退款 → 分账 → 订阅消息推送 → 搜索功能 → 全流程联调通过 |

---

## 八、风险与注意事项

| 风险点 | 应对措施 |
|--------|---------|
| 微信支付分账接口审核 | S7 开始前确保商户号已开通分账功能，否则先用普通支付模式 |
| 云开发数据库性能 | 商家列表的地理位置查询需建立地理位置索引（geoNear） |
| 规格系统复杂度 | S3 的规格配置页是 B 端最复杂的交互，预留充足时间 |
| 订阅消息模板审核 | 提前在微信后台申请订阅消息模板，S7 直接使用 |
| 图片上传体积 | 上传时需在客户端压缩，限制 200KB 以内 |
| 购物车跨页面状态 | 使用 globalData + Storage 双重保障，防止数据丢失 |
