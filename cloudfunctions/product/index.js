const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// Action routing
const actions = {
  getCategories,
  saveCategory,
  deleteCategory,
  sortCategories,
  getProduct,
  saveProduct,
  deleteProduct,
  toggleSale,
  getMenu
}

exports.main = async (event, context) => {
  const { action } = event
  const handler = actions[action]
  if (!handler) {
    return { code: 1001, message: `未知操作: ${action}` }
  }
  try {
    const wxContext = cloud.getWXContext()
    event._openid = wxContext.OPENID
    const data = await handler(event)
    return { code: 0, message: 'success', data }
  } catch (err) {
    console.error(`[product/${action}] error:`, err)
    const code = err.customCode || 5000
    return { code, message: err.message || '服务异常' }
  }
}

// ===================== Category =====================

async function getCategories(event) {
  const { merchantId } = event
  if (!merchantId) throw createError(1001, '缺少商户ID')

  const { data } = await db.collection('categories')
    .where({ merchant_id: merchantId })
    .orderBy('sort_order', 'asc')
    .limit(50)
    .get()

  // Attach product count per category
  const countTasks = data.map(cat =>
    db.collection('products')
      .where({ merchant_id: merchantId, category_id: cat._id })
      .count()
      .then(res => ({ ...cat, product_count: res.total }))
  )
  return { categories: await Promise.all(countTasks) }
}

async function saveCategory(event) {
  const { _openid, categoryId, name } = event
  if (!name || !name.trim()) throw createError(1001, '分类名称不能为空')

  const merchant = await getMerchantByOpenid(_openid)

  if (categoryId) {
    // Update existing
    await db.collection('categories').doc(categoryId).update({
      data: { name: name.trim() }
    })
    return { categoryId }
  } else {
    // Create new - get max sort_order
    const { data: existing } = await db.collection('categories')
      .where({ merchant_id: merchant._id })
      .orderBy('sort_order', 'desc')
      .limit(1)
      .get()
    const maxSort = existing.length > 0 ? existing[0].sort_order : 0

    const res = await db.collection('categories').add({
      data: {
        merchant_id: merchant._id,
        name: name.trim(),
        sort_order: maxSort + 1,
        created_at: db.serverDate()
      }
    })
    return { categoryId: res._id }
  }
}

async function deleteCategory(event) {
  const { _openid, categoryId } = event
  if (!categoryId) throw createError(1001, '缺少分类ID')

  await getMerchantByOpenid(_openid)

  // Check if category has products
  const { total } = await db.collection('products')
    .where({ category_id: categoryId })
    .count()
  if (total > 0) {
    throw createError(2003, '请先移除该分类下的商品')
  }

  await db.collection('categories').doc(categoryId).remove()
  return {}
}

async function sortCategories(event) {
  const { _openid, categoryIds } = event
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    throw createError(1001, '缺少分类排序数据')
  }

  await getMerchantByOpenid(_openid)

  const tasks = categoryIds.map((id, index) =>
    db.collection('categories').doc(id).update({
      data: { sort_order: index }
    })
  )
  await Promise.all(tasks)
  return {}
}

// ===================== Product =====================

async function getProduct(event) {
  const { productId } = event
  if (!productId) throw createError(1001, '缺少商品ID')

  const { data } = await db.collection('products').doc(productId).get()
  return { product: data }
}

async function saveProduct(event) {
  const { _openid, productId, name, description, image, category_id, base_price, spec_groups } = event
  if (!name || !name.trim()) throw createError(1001, '商品名称不能为空')
  if (!category_id) throw createError(1001, '请选择分类')
  if (base_price === undefined || base_price === null || base_price < 0) {
    throw createError(1001, '请输入有效价格')
  }

  const merchant = await getMerchantByOpenid(_openid)
  const now = db.serverDate()

  const productData = {
    name: name.trim(),
    description: (description || '').trim(),
    image: image || '',
    category_id,
    base_price: Math.round(Number(base_price)),
    spec_groups: spec_groups || [],
    updated_at: now
  }

  if (productId) {
    // Update existing
    await db.collection('products').doc(productId).update({
      data: productData
    })
    return { productId }
  } else {
    // Create new
    const { data: existing } = await db.collection('products')
      .where({ merchant_id: merchant._id, category_id })
      .orderBy('sort_order', 'desc')
      .limit(1)
      .get()
    const maxSort = existing.length > 0 ? existing[0].sort_order : 0

    const res = await db.collection('products').add({
      data: {
        merchant_id: merchant._id,
        ...productData,
        is_on_sale: true,
        sort_order: maxSort + 1,
        created_at: now
      }
    })
    return { productId: res._id }
  }
}

async function deleteProduct(event) {
  const { _openid, productId } = event
  if (!productId) throw createError(1001, '缺少商品ID')

  await getMerchantByOpenid(_openid)
  await db.collection('products').doc(productId).remove()
  return {}
}

async function toggleSale(event) {
  const { _openid, productId, isOnSale } = event
  if (!productId) throw createError(1001, '缺少商品ID')

  await getMerchantByOpenid(_openid)
  await db.collection('products').doc(productId).update({
    data: {
      is_on_sale: !!isOnSale,
      updated_at: db.serverDate()
    }
  })
  return {}
}

async function getMenu(event) {
  const { merchantId } = event
  if (!merchantId) throw createError(1001, '缺少商户ID')

  // Get categories
  const { data: categories } = await db.collection('categories')
    .where({ merchant_id: merchantId })
    .orderBy('sort_order', 'asc')
    .limit(50)
    .get()

  // Get all products for this merchant
  const { data: products } = await db.collection('products')
    .where({ merchant_id: merchantId })
    .orderBy('sort_order', 'asc')
    .limit(200)
    .get()

  // Group products by category
  const menu = categories.map(cat => ({
    ...cat,
    products: products.filter(p => p.category_id === cat._id)
  }))

  return { menu }
}

// ===================== Helpers =====================

async function getMerchantByOpenid(openid) {
  const { data } = await db.collection('merchants')
    .where({ user_id: openid, status: 'active' })
    .limit(1)
    .get()
  if (data.length === 0) {
    throw createError(2001, '商户不存在或未通过审核')
  }
  return data[0]
}

function createError(code, message) {
  const err = new Error(message)
  err.customCode = code
  return err
}
