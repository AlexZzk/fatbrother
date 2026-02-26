const app = getApp()
const productService = require('../../../services/product')

// Quick templates (price_delta in cents)
const TEMPLATES = {
  cup: { name: '杯型', required: true, multi_select: false, specs: [{ name: '大杯', price_delta: 300 }, { name: '中杯', price_delta: 0 }, { name: '小杯', price_delta: -200 }] },
  spice: { name: '辣度', required: true, multi_select: false, specs: [{ name: '微辣', price_delta: 0 }, { name: '中辣', price_delta: 0 }, { name: '特辣', price_delta: 0 }] },
  sugar: { name: '甜度', required: true, multi_select: false, specs: [{ name: '全糖', price_delta: 0 }, { name: '七分糖', price_delta: 0 }, { name: '半糖', price_delta: 0 }, { name: '无糖', price_delta: 0 }] },
  temp: { name: '温度', required: true, multi_select: false, specs: [{ name: '热', price_delta: 0 }, { name: '常温', price_delta: 0 }, { name: '加冰', price_delta: 0 }] }
}

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    specGroups: [],
    // Set when launched from merchant menu (saves directly to DB).
    // Empty when launched from product-edit (uses app.globalData flow).
    productId: '',
    saving: false
  },

  onLoad(options) {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight,
      productId: options.productId || ''
    })

    if (options.productId) {
      // Launched from merchant menu → load existing specs from DB
      this._loadFromProduct(options.productId)
    } else {
      // Launched from product-edit → use in-memory globalData
      this.setData({ specGroups: this._toDisplay(app.globalData.tempSpecGroups || []) })
    }
  },

  async _loadFromProduct(productId) {
    try {
      const data = await productService.getProduct(productId)
      const specs = (data.product && data.product.spec_groups) || []
      this.setData({ specGroups: this._toDisplay(specs) })
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: '加载规格失败，请重试' })
    }
  },

  // Convert cents to yuan display strings
  _toDisplay(groups) {
    return groups.map(g => ({
      ...g,
      specs: g.specs.map(s => ({
        ...s,
        price_display: (s.price_delta / 100).toString()
      }))
    }))
  },

  // Convert yuan display strings back to cents
  _toStorage(groups) {
    return groups.map(g => ({
      name: g.name,
      required: g.required,
      multi_select: g.multi_select,
      specs: g.specs.map(s => ({
        name: s.name,
        price_delta: Math.round(parseFloat(s.price_display || '0') * 100) || 0
      }))
    }))
  },

  onAddTemplate(e) {
    const { key } = e.currentTarget.dataset
    const tpl = TEMPLATES[key]
    if (!tpl) return
    const newGroup = JSON.parse(JSON.stringify(tpl))
    newGroup.specs = newGroup.specs.map(s => ({ ...s, price_display: (s.price_delta / 100).toString() }))
    const groups = [...this.data.specGroups, newGroup]
    this.setData({ specGroups: groups })
  },

  onAddGroup() {
    const groups = [...this.data.specGroups, {
      name: '',
      required: false,
      multi_select: false,
      specs: [{ name: '', price_delta: 0, price_display: '0' }]
    }]
    this.setData({ specGroups: groups })
  },

  onDeleteGroup(e) {
    const { gi } = e.currentTarget.dataset
    const groups = this.data.specGroups.filter((_, i) => i !== gi)
    this.setData({ specGroups: groups })
  },

  onGroupNameInput(e) {
    const { gi } = e.currentTarget.dataset
    this.setData({ [`specGroups[${gi}].name`]: e.detail.value })
  },

  onToggleRequired(e) {
    const { gi } = e.currentTarget.dataset
    const val = !this.data.specGroups[gi].required
    this.setData({ [`specGroups[${gi}].required`]: val })
  },

  onToggleMulti(e) {
    const { gi } = e.currentTarget.dataset
    const val = !this.data.specGroups[gi].multi_select
    this.setData({ [`specGroups[${gi}].multi_select`]: val })
  },

  onSpecNameInput(e) {
    const { gi, si } = e.currentTarget.dataset
    this.setData({ [`specGroups[${gi}].specs[${si}].name`]: e.detail.value })
  },

  onSpecPriceInput(e) {
    const { gi, si } = e.currentTarget.dataset
    this.setData({ [`specGroups[${gi}].specs[${si}].price_display`]: e.detail.value })
  },

  onAddSpec(e) {
    const { gi } = e.currentTarget.dataset
    const specs = [...this.data.specGroups[gi].specs, { name: '', price_delta: 0, price_display: '0' }]
    this.setData({ [`specGroups[${gi}].specs`]: specs })
  },

  onDeleteSpec(e) {
    const { gi, si } = e.currentTarget.dataset
    const specs = this.data.specGroups[gi].specs.filter((_, i) => i !== si)
    this.setData({ [`specGroups[${gi}].specs`]: specs })
  },

  async onSave() {
    if (this.data.saving) return
    const { specGroups, productId } = this.data

    // Validate
    for (let i = 0; i < specGroups.length; i++) {
      const g = specGroups[i]
      if (!g.name.trim()) {
        this.selectComponent('#toast').showToast({ message: `第${i + 1}个规格组名称不能为空` })
        return
      }
      if (g.specs.length === 0) {
        this.selectComponent('#toast').showToast({ message: `"${g.name}" 至少需要1个选项` })
        return
      }
      for (let j = 0; j < g.specs.length; j++) {
        if (!g.specs[j].name.trim()) {
          this.selectComponent('#toast').showToast({ message: `"${g.name}" 的第${j + 1}个选项名称不能为空` })
          return
        }
      }
    }

    const storageGroups = this._toStorage(specGroups)

    if (productId) {
      // Launched from merchant menu → save directly to DB
      this.setData({ saving: true })
      try {
        await productService.saveSpecs(productId, storageGroups)
        this.selectComponent('#toast').showToast({ message: '规格已保存', type: 'success' })
        setTimeout(() => wx.navigateBack(), 500)
      } catch (err) {
        this.selectComponent('#toast').showToast({ message: err.message || '保存失败，请重试' })
        this.setData({ saving: false })
      }
    } else {
      // Launched from product-edit → pass back via globalData
      app.globalData.tempSpecGroups = storageGroups
      this.selectComponent('#toast').showToast({ message: '规格已保存', type: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    }
  }
})
