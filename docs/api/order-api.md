# 订单模块 接口文档

> 云函数名：`order`
> 负责 Sprint：S5-S6
> 状态：待开发

## 接口列表

| Action | 说明 | 鉴权 | 端 |
|--------|------|------|-----|
| create | 创建订单 | 是 | C端 |
| getList | 获取订单列表 | 是 | C端/B端 |
| getDetail | 获取订单详情 | 是 | C端/B端 |
| cancel | 取消订单 | 是 | C端 |
| accept | 接单 | 是(商户) | B端 |
| reject | 拒单 | 是(商户) | B端 |
| markReady | 标记出餐 | 是(商户) | B端 |
| complete | 确认完成 | 是 | C端/B端 |

> 详细接口文档将在 Sprint 5-6 开发时补充。
