const merchantService = require('../../../services/merchant')

Page({
  data: {
    promotions: [],
    loading: true,
    // 编辑表单
    showForm: false,
    editingId: '',
    formData: {
      type: 'delivery_discount',
      name: '',
      min_amount_yuan: '',
      discount_amount_yuan: ''
    }
  },

  onShow() {
    this._load()
  },

  async _load() {
    try {
      const res = await merchantService.getPromotions()
      const promotions = (res.promotions || []).map(p => ({
        ...p,
        minAmountLabel: '¥' + (p.min_amount / 100).toFixed(2),
        discountLabel: '¥' + (p.discount_amount / 100).toFixed(2)
      }))
      this.setData({ promotions, loading: false })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  onAddTap() {
    this.setData({
      showForm: true,
      editingId: '',
      formData: { type: 'delivery_discount', name: '', min_amount_yuan: '', discount_amount_yuan: '' }
    })
  },

  onEditTap(e) {
    const promo = e.currentTarget.dataset.promo
    this.setData({
      showForm: true,
      editingId: promo._id,
      formData: {
        type: promo.type,
        name: promo.name,
        min_amount_yuan: (promo.min_amount / 100).toString(),
        discount_amount_yuan: (promo.discount_amount / 100).toString()
      }
    })
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`formData.${field}`]: e.detail.value })
  },

  onFormCancel() {
    this.setData({ showForm: false })
  },

  async onFormConfirm() {
    const { editingId, formData } = this.data
    const minAmountYuan = parseFloat(formData.min_amount_yuan)
    const discountYuan = parseFloat(formData.discount_amount_yuan)

    if (!formData.name.trim()) {
      wx.showToast({ title: '请填写活动名称', icon: 'none' })
      return
    }
    if (isNaN(minAmountYuan) || minAmountYuan < 0) {
      wx.showToast({ title: '请填写有效的起效金额', icon: 'none' })
      return
    }
    if (isNaN(discountYuan) || discountYuan <= 0) {
      wx.showToast({ title: '请填写有效的优惠金额', icon: 'none' })
      return
    }

    try {
      await merchantService.savePromotion({
        promotionId: editingId || undefined,
        type: formData.type,
        name: formData.name.trim(),
        min_amount: Math.round(minAmountYuan * 100),
        discount_amount: Math.round(discountYuan * 100),
        status: 'active'
      })
      this.setData({ showForm: false })
      wx.showToast({ title: '保存成功', icon: 'success' })
      this._load()
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  },

  async onToggle(e) {
    const promo = e.currentTarget.dataset.promo
    const newStatus = promo.status === 'active' ? 'inactive' : 'active'
    try {
      await merchantService.savePromotion({
        promotionId: promo._id,
        type: promo.type,
        name: promo.name,
        min_amount: promo.min_amount,
        discount_amount: promo.discount_amount,
        status: newStatus
      })
      this._load()
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onDeleteTap(e) {
    const promotionId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确认删除该活动？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await merchantService.deletePromotion(promotionId)
          wx.showToast({ title: '已删除', icon: 'success' })
          this._load()
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})
