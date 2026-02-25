const app = getApp()
const productService = require('../../../services/product')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    loading: true,
    categories: [],
    allProducts: [],
    filteredProducts: [],
    activeCategory: 'all',
    merchantId: ''
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
  },

  onShow() {
    this._loadData()
  },

  /**
   * Load menu data (categories + products)
   */
  async _loadData() {
    const merchantInfo = app.globalData.merchantInfo
    if (!merchantInfo || !merchantInfo._id) {
      this.setData({ loading: false })
      return
    }

    const merchantId = merchantInfo._id
    this.setData({ merchantId, loading: true })

    try {
      const res = await productService.getMenu(merchantId)
      const menu = res.menu || []

      // Extract categories and flatten products
      const categories = []
      let allProducts = []

      menu.forEach(cat => {
        categories.push({
          _id: cat._id,
          name: cat.name,
          sort: cat.sort
        })

        const products = (cat.products || []).map(p => ({
          ...p,
          categoryId: cat._id,
          categoryName: cat.name,
          priceYuan: (p.base_price / 100).toFixed(2),
          isOnSale: p.is_on_sale,
          imageUrl: p.image
        }))

        allProducts = allProducts.concat(products)
      })

      const activeCategory = this.data.activeCategory
      // If previous active category no longer exists, reset to 'all'
      const validCategory = activeCategory === 'all' || categories.some(c => c._id === activeCategory)
      const finalCategory = validCategory ? activeCategory : 'all'

      this.setData({
        categories,
        allProducts,
        activeCategory: finalCategory,
        loading: false
      })

      this._filterProducts(finalCategory)
    } catch (err) {
      console.error('[menu] loadData failed:', err)
      this.setData({ loading: false })
      this._showToast('加载失败，请重试', 'error')
    }
  },

  /**
   * Filter products by category
   */
  _filterProducts(categoryId) {
    const { allProducts } = this.data

    if (categoryId === 'all') {
      this.setData({ filteredProducts: allProducts })
    } else {
      const filtered = allProducts.filter(p => p.categoryId === categoryId)
      this.setData({ filteredProducts: filtered })
    }
  },

  /**
   * Category tab click
   */
  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id
    if (id === this.data.activeCategory) return

    this.setData({ activeCategory: id })
    this._filterProducts(id)
  },

  /**
   * Navigate to add product page
   */
  onAddProduct() {
    wx.navigateTo({
      url: '/pages/merchant/product-edit/index'
    })
  },

  /**
   * Navigate to category management page
   */
  onEditCategory() {
    wx.navigateTo({
      url: '/pages/merchant/category/index'
    })
  },

  /**
   * Navigate to edit product page
   */
  onEditProduct(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/merchant/product-edit/index?id=${id}`
    })
  },

  /**
   * Navigate to spec config page
   */
  onSpecConfig(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/merchant/spec-config/index?productId=${id}`
    })
  },

  /**
   * Toggle product on/off sale
   */
  async onToggleSale(e) {
    const { id, status } = e.currentTarget.dataset
    const newStatus = !status
    const actionText = newStatus ? '上架' : '下架'

    try {
      await productService.toggleSale(id, newStatus)
      this._showToast(`${actionText}成功`, 'success')
      await this._loadData()
    } catch (err) {
      console.error('[menu] toggleSale failed:', err)
      this._showToast(`${actionText}失败，请重试`, 'error')
    }
  },

  /**
   * Delete product with confirmation
   */
  onDeleteProduct(e) {
    const { id, name } = e.currentTarget.dataset

    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${name}」吗？删除后不可恢复。`,
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (!res.confirm) return

        try {
          await productService.deleteProduct(id)
          this._showToast('删除成功', 'success')
          await this._loadData()
        } catch (err) {
          console.error('[menu] deleteProduct failed:', err)
          this._showToast('删除失败，请重试', 'error')
        }
      }
    })
  },

  /**
   * Show toast message
   */
  _showToast(message, type) {
    const toast = this.selectComponent('#toast')
    if (toast) {
      toast.showToast({ message, type })
    }
  }
})
