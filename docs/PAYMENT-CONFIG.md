# 微信支付接入配置指南

> 版本：v2.0.0
> 适用范围：体验版发布 / 正式上线的真实支付接入

---

## 一、架构说明

**平台模式：** 用户直接付给商户，平台订单完成后通过**分账**抽取佣金。

```
用户下单
  │
  ▼
调用商户微信支付 JSAPI → 钱进入商户账户
  │
  ▼（订单完成时自动触发）
分账结算
  ├─ 佣金(10%) → 平台商户号
  ├─ 推荐人分成 → 直接推荐商户（若有）
  └─ 间接推荐分成 → 二级推荐商户（若有）
```

---

## 二、你已经拥有的材料

在微信支付商户平台「账户中心 → API安全」中，你已申请了：

| 材料 | 文件名 | 用途 |
|------|--------|------|
| 商户API证书 | `apiclient_cert.pem` | 获取证书序列号（serial_no） |
| 商户API私钥 | `apiclient_key.pem` | 对请求进行签名（private_key） |
| 商户API证书（P12） | `apiclient_cert.p12` | 备用，一般不需要 |
| 微信支付公钥 | `wechatpay_public_key.pem` | 验证微信返回的签名（暂存备用） |

**还缺少：** APIv3密钥（下一步设置）

---

## 三、APIv3密钥配置

APIv3密钥是一个由你自己设置的**32位字符串**，用于加密解密支付回调通知。

### 第一步：使用以下密钥

本次为你生成的密钥（已用于代码配置）：

```
TQ60X6FBINGEI67222NG40QF5BE4CNXF
```

> ⚠️ **重要：** 这个密钥必须原样填入微信支付商户平台，代码与平台必须完全一致。

### 第二步：在微信支付商户平台设置

1. 登录 [微信支付商户平台](https://pay.weixin.qq.com)
2. 进入：**账户中心 → API安全 → APIv3密钥**
3. 点击「设置APIv3密钥」
4. 将上方密钥 `TQ60X6FBINGEI67222NG40QF5BE4CNXF` **原样粘贴**，保存

---

## 四、从证书文件中提取配置信息

### 4.1 获取证书序列号（serial_no）

**方法A：从商户平台直接查看**（推荐）
```
账户中心 → API安全 → API证书 → 证书序列号（查看）
```

**方法B：用命令从证书文件提取**
```bash
# 在 apiclient_cert.pem 所在目录执行
openssl x509 -in apiclient_cert.pem -noout -serial

# 输出示例:
# serial=1EF234567890ABCDEF1234567890ABCDEF123456
# 去掉 "serial=" 前缀，剩下的就是 serial_no
```

### 4.2 获取私钥内容（private_key）

私钥就是 `apiclient_key.pem` 文件的**完整内容**，格式如下：

```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7...
（多行 Base64 内容）
...abc123xyz
-----END PRIVATE KEY-----
```

**提取方式：**
```bash
cat apiclient_key.pem
# 复制全部输出内容，包含 -----BEGIN PRIVATE KEY----- 和 -----END PRIVATE KEY----- 行
```

在存入数据库时，需要将换行符替换为 `\n`，例如：
```
"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADA...\n-----END PRIVATE KEY-----"
```

---

## 五、代码配置（需要手动替换）

以下配置项需要根据实际情况填写。

### 5.1 `cloudfunctions/order/payment-helper.js`

```js
// 第 28 行：替换为你的小程序 AppID（微信公众平台 → 开发管理 → AppID）
const APP_ID = 'wx_your_appid_here'  // ← 替换这里

// 第 33 行：替换为你的云函数 HTTP 触发地址（见第六章）
const NOTIFY_URL = 'https://your-env-id.service.tcloudbase.com/order'  // ← 替换这里
```

### 5.2 `cloudfunctions/order/index.js`

```js
// 第 15 行：体验版/正式版改为 true
const USE_REAL_PAYMENT = true  // ← 改为 true

// 第 17-21 行：填入平台商户号
const PLATFORM_CONFIG = {
  commissionRate: 0.10,
  platformMchId: '你的平台商户号'  // ← 替换这里
}
```

---

## 六、支付回调地址配置

支付成功后微信需要回调一个公网 HTTPS 地址，步骤如下：

### 第一步：开启云函数 HTTP 访问

1. 进入**微信云开发控制台** → 选择你的环境
2. 点击**环境设置** → **HTTP 访问服务**
3. 点击**新建**，填写：
   - 路径：`/order`
   - 云函数：`order`
4. 保存后，回调地址格式为：

```
https://<你的云环境ID>.service.tcloudbase.com/order
```

### 第二步：在代码中填写

将上述地址填入 `payment-helper.js` 第 33 行的 `NOTIFY_URL`：
```js
const NOTIFY_URL = 'https://prod-9g123abc.service.tcloudbase.com/order'
```

### 第三步：在微信支付商户平台配置

微信支付平台本身**不需要**单独配置回调地址——回调地址已经在每次下单请求的 `notify_url` 字段中传入，微信会自动回调。

---

## 七、数据库商户配置

每个商户入驻后，需要在 `merchants` 集合的对应文档中添加 `payment_config` 字段。

### 7.1 字段说明

| 字段 | 来源 | 示例 |
|------|------|------|
| `mch_id` | 商户平台 → 账户中心 → 商户号 | `"1900123456"` |
| `api_key_v3` | 本文第三章设置的密钥 | `"TQ60X6FBINGEI67222NG40QF5BE4CNXF"` |
| `serial_no` | 本文第四章提取的证书序列号 | `"1EF2345678..."` |
| `private_key` | `apiclient_key.pem` 完整内容 | `"-----BEGIN PRIVATE KEY-----\n..."` |

### 7.2 数据库写入示例

在云开发数据库控制台，找到该商户的 `merchants` 文档，点击「添加字段」，添加：

```json
{
  "payment_config": {
    "mch_id": "1900123456",
    "api_key_v3": "TQ60X6FBINGEI67222NG40QF5BE4CNXF",
    "serial_no": "1EF234567890ABCDEF1234567890ABCDEF123456",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----"
  }
}
```

### 7.3 private_key 格式注意

私钥在数据库中存储时，**换行必须用 `\n` 表示**（JSON 字符串格式），不能真实换行。

用以下命令一键格式化（Mac/Linux）：
```bash
# 将 pem 文件内容格式化为 JSON 可用的单行字符串
cat apiclient_key.pem | awk '{printf "%s\\n", $0}' | sed 's/\\n$//'
```

---

## 八、分账功能前置配置（如需佣金抽成）

如果需要启用分账功能，每个商户还需完成：

### 8.1 在商户平台开通分账

```
商户平台 → 产品中心 → 我的产品 → 申请开通「电商收付通」或「分账」功能
```

### 8.2 添加平台为分账接收方

每个商户入驻时，需要在其商户平台添加平台为接收方：

```
商户平台 → 交易中心 → 分账 → 分账接收方管理 → 添加接收方
  - 接收方类型：商户号
  - 接收方账号：（平台商户号，见 PLATFORM_CONFIG.platformMchId）
  - 接收方全称：胖兄弟外卖平台
  - 关系：服务商
```

---

## 九、快速上线检查清单

在将 `USE_REAL_PAYMENT` 改为 `true` 并发布前，逐项确认：

**平台级（一次性配置）**
- [ ] `payment-helper.js` 中 `APP_ID` 已替换为真实 AppID
- [ ] `payment-helper.js` 中 `NOTIFY_URL` 已替换为真实回调地址
- [ ] 云函数 HTTP 访问服务已开启，`/order` 路由已绑定
- [ ] `PLATFORM_CONFIG.platformMchId` 已填写平台商户号
- [ ] `USE_REAL_PAYMENT` 已改为 `true`

**商户级（每个商户入驻时）**
- [ ] 商户拥有已激活的微信支付商户号
- [ ] 商户平台已开通 JSAPI 支付权限
- [ ] 商户已在平台设置 APIv3 密钥（`TQ60X6FBINGEI67222NG40QF5BE4CNXF`）
- [ ] `merchants` 数据库文档中 `payment_config` 四个字段已填写
- [ ] 如需分账：商户平台已添加平台为分账接收方

**订阅消息（可选，影响推送通知）**
- [ ] 6个订阅消息模板已申请并配置到 `common/index.js`
- [ ] `order-confirm/index.js` 中 3 个模板ID已更新

---

## 十、常见错误排查

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `商户支付配置不完整` | `payment_config` 字段缺失或字段不全 | 检查数据库，确认四个字段均已填写 |
| `签名验证失败` | `private_key` 格式错误或 `serial_no` 有误 | 检查私钥是否包含完整的 BEGIN/END 行 |
| `回调解密失败` | `api_key_v3` 与商户平台设置的不一致 | 确认商户平台 APIv3 密钥与数据库中一致 |
| `JSAPI支付失败` | AppID 未关联商户号，或 openid 不属于该 AppID | 在商户平台关联小程序 AppID |
| `分账接收方不存在` | 未在商户平台添加平台为分账接收方 | 参考第八章完成分账配置 |

---

*最后更新：配置本次体验版发布*
