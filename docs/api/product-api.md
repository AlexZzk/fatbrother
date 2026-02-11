# 商品模块 接口文档

> 云函数名：`product`
> 负责 Sprint：S3
> 状态：待开发

## 接口列表

| Action | 说明 | 鉴权 |
|--------|------|------|
| getCategories | 获取分类列表 | 部分 |
| saveCategory | 新增/编辑分类 | 是(商户) |
| deleteCategory | 删除分类 | 是(商户) |
| sortCategories | 分类排序 | 是(商户) |
| getProduct | 获取商品详情 | 否 |
| saveProduct | 新增/编辑商品 | 是(商户) |
| deleteProduct | 删除商品 | 是(商户) |
| toggleSale | 商品上下架 | 是(商户) |
| getMenu | 获取完整菜单 | 否 |

> 详细接口文档将在 Sprint 3 开发时补充。
