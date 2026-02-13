# 商品模块 接口文档

> 云函数名：`product`
> 负责 Sprint：S3
> 状态：已完成

## 接口列表

| Action | 说明 | 鉴权 |
|--------|------|------|
| getCategories | 获取分类列表（含商品数） | 否 |
| saveCategory | 新增/编辑分类 | 是(商户) |
| deleteCategory | 删除分类 | 是(商户) |
| sortCategories | 分类排序 | 是(商户) |
| getProduct | 获取商品详情 | 否 |
| saveProduct | 新增/编辑商品 | 是(商户) |
| deleteProduct | 删除商品 | 是(商户) |
| toggleSale | 商品上下架 | 是(商户) |
| getMenu | 获取完整菜单 | 否 |

---

## 1. getCategories - 获取分类列表

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| merchantId | string | 是 | 商户ID |

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "categories": [
      {
        "_id": "cat_001",
        "merchant_id": "m_001",
        "name": "热销",
        "sort_order": 0,
        "created_at": "2026-01-15T10:00:00.000Z",
        "product_count": 5
      }
    ]
  }
}
```

**迁移路由：** `GET /api/v1/merchants/{merchantId}/categories`

---

## 2. saveCategory - 新增/编辑分类

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| categoryId | string | 否 | 有则编辑，无则新增 |
| name | string | 是 | 分类名称 |

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": { "categoryId": "cat_001" }
}
```

**迁移路由：** `POST /api/v1/categories` (新增) / `PUT /api/v1/categories/{categoryId}` (编辑)

---

## 3. deleteCategory - 删除分类

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| categoryId | string | 是 | 分类ID |

**业务规则：**
- 分类下有商品时拒绝删除，返回错误码 2003

**错误码：**
| code | 说明 |
|------|------|
| 2003 | 请先移除该分类下的商品 |

**迁移路由：** `DELETE /api/v1/categories/{categoryId}`

---

## 4. sortCategories - 分类排序

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| categoryIds | string[] | 是 | 按新顺序排列的分类ID数组 |

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

**迁移路由：** `PUT /api/v1/categories/sort`

---

## 5. getProduct - 获取商品详情

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| productId | string | 是 | 商品ID |

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "product": {
      "_id": "prod_001",
      "merchant_id": "m_001",
      "category_id": "cat_001",
      "name": "招牌蛋炒饭",
      "description": "好吃不贵",
      "image": "cloud://xxx/products/abc.jpg",
      "base_price": 1200,
      "spec_groups": [
        {
          "name": "份量",
          "required": true,
          "multi_select": false,
          "specs": [
            { "name": "大份", "price_delta": 500 },
            { "name": "小份", "price_delta": 0 }
          ]
        }
      ],
      "is_on_sale": true,
      "sort_order": 0,
      "created_at": "2026-01-15T10:00:00.000Z",
      "updated_at": "2026-01-16T08:30:00.000Z"
    }
  }
}
```

**字段说明：**
- `base_price`：基础价格，单位为 **分（cents）**
- `spec_groups[].specs[].price_delta`：加价金额，单位为 **分（cents）**，可为负数
- `spec_groups[].required`：是否必选
- `spec_groups[].multi_select`：是否可多选

**迁移路由：** `GET /api/v1/products/{productId}`

---

## 6. saveProduct - 新增/编辑商品

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| productId | string | 否 | 有则编辑，无则新增 |
| name | string | 是 | 商品名称 |
| description | string | 否 | 商品描述 |
| image | string | 否 | 云存储文件ID |
| category_id | string | 是 | 所属分类ID |
| base_price | number | 是 | 基础价格（分） |
| spec_groups | array | 否 | 规格组数组 |

**spec_groups 结构：**
```json
[
  {
    "name": "杯型",
    "required": true,
    "multi_select": false,
    "specs": [
      { "name": "大杯", "price_delta": 300 },
      { "name": "中杯", "price_delta": 0 },
      { "name": "小杯", "price_delta": -200 }
    ]
  }
]
```

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": { "productId": "prod_001" }
}
```

**迁移路由：** `POST /api/v1/products` (新增) / `PUT /api/v1/products/{productId}` (编辑)

---

## 7. deleteProduct - 删除商品

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| productId | string | 是 | 商品ID |

**迁移路由：** `DELETE /api/v1/products/{productId}`

---

## 8. toggleSale - 商品上下架

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| productId | string | 是 | 商品ID |
| isOnSale | boolean | 是 | true=上架, false=下架 |

**迁移路由：** `PUT /api/v1/products/{productId}/sale`

---

## 9. getMenu - 获取完整菜单

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| merchantId | string | 是 | 商户ID |

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "menu": [
      {
        "_id": "cat_001",
        "name": "热销",
        "sort_order": 0,
        "products": [
          {
            "_id": "prod_001",
            "name": "招牌蛋炒饭",
            "description": "好吃不贵",
            "image": "cloud://xxx/products/abc.jpg",
            "base_price": 1200,
            "is_on_sale": true,
            "spec_groups": []
          }
        ]
      }
    ]
  }
}
```

**说明：** 返回按分类分组的完整菜单，每个分类包含其下所有商品。C端展示时需过滤 `is_on_sale=false` 的商品。

**迁移路由：** `GET /api/v1/merchants/{merchantId}/menu`

---

## 通用错误码

| code | 说明 |
|------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 2001 | 商户不存在或未通过审核 |
| 2003 | 分类下有商品，不能删除 |
| 5000 | 服务异常 |
