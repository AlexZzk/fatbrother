const app = getApp()
const productService = require('../../../services/product')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    isEdit: false,
    productId: '',
    image: '',
    name: '',
    description: '',
    categoryIndex: -1,
    categories: [],
    priceYuan: '',
    specGroups: [],
    saving: false,
    loading: false
  },

  onLoad(options) {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
    this._loadCategories()
    if (options.id) {
      this.setData({ isEdit: true, productId: options.id, loading: true })
      this._loadProduct(options.id)
    }
  },

  onShow() {
    // Check if spec_groups were updated from spec-config page
    if (app.globalData.tempSpecGroups !== undefined) {
      this.setData({ specGroups: app.globalData.tempSpecGroups || [] })
      delete app.globalData.tempSpecGroups
    }
  },

  async _loadCategories() {
    try {
      const merchant = app.globalData.merchantInfo
      if (!merchant) return
      let data = await productService.getCategories(merchant._id)
      let categories = data.categories || []

      // Auto-create a default category if none exist
      if (categories.length === 0) {
        await productService.saveCategory({ name: '默认分类' })
        data = await productService.getCategories(merchant._id)
        categories = data.categories || []
      }

      const updates = { categories }
      // For new products, default to first category
      if (!this.data.isEdit && categories.length > 0 && this.data.categoryIndex < 0) {
        updates.categoryIndex = 0
      }
      this.setData(updates)

      // If editing, match category index after both loaded
      if (this.data._pendingCategoryId) {
        this._matchCategoryIndex(this.data._pendingCategoryId)
      }
    } catch (err) { /* ignore */ }
  },

  async _loadProduct(id) {
    try {
      const data = await productService.getProduct(id)
      const p = data.product
      this.setData({
        image: p.image || '',
        name: p.name,
        description: p.description || '',
        priceYuan: (p.base_price / 100).toFixed(2),
        specGroups: p.spec_groups || [],
        loading: false
      })
      if (this.data.categories.length > 0) {
        this._matchCategoryIndex(p.category_id)
      } else {
        this.data._pendingCategoryId = p.category_id
      }
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  _matchCategoryIndex(categoryId) {
    const idx = this.data.categories.findIndex(c => c._id === categoryId)
    if (idx >= 0) this.setData({ categoryIndex: idx })
  },

  onImageChange(e) {
    this.setData({ image: e.detail.value })
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onDescInput(e) {
    this.setData({ description: e.detail.value })
  },

  onCategoryChange(e) {
    this.setData({ categoryIndex: Number(e.detail.value) })
  },

  onPriceInput(e) {
    this.setData({ priceYuan: e.detail.value })
  },

  onGoSpec() {
    app.globalData.tempSpecGroups = this.data.specGroups
    wx.navigateTo({ url: '/pages/merchant/spec-config/index' })
  },

  async onSave() {
    const { name, categoryIndex, categories, priceYuan, productId, image, description, specGroups } = this.data
    if (!name.trim()) {
      this.selectComponent('#toast').showToast({ message: '请输入商品名称' })
      return
    }
    if (categoryIndex < 0 || !categories[categoryIndex]) {
      this.selectComponent('#toast').showToast({ message: '请选择分类' })
      return
    }
    const price = parseFloat(priceYuan)
    if (isNaN(price) || price < 0) {
      this.selectComponent('#toast').showToast({ message: '请输入有效价格' })
      return
    }

    this.setData({ saving: true })
    try {
      await productService.saveProduct({
        productId: productId || undefined,
        name: name.trim(),
        description: description.trim(),
        image,
        category_id: categories[categoryIndex]._id,
        base_price: Math.round(price * 100),
        spec_groups: specGroups
      })
      this.selectComponent('#toast').showToast({ message: '保存成功', type: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: err.message || '保存失败' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
