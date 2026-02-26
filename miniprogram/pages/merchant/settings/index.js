const app = getApp()
const merchantService = require('../../../services/merchant')
const uploadService = require('../../../services/upload')

// 数字类字段标题映射
const NUMERIC_FIELD_LABELS = {
  min_order_amount: '起送价',
  packing_fee: '包装费'
}

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    merchantInfo: null,
    feeLabels: { minOrder: '未设置', packing: '未设置', delivery: '未设置' },
    loading: true,
    editingField: '',
    editValue: '',
    editingNumeric: false
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
  },

  onShow() {
    this._loadMerchantInfo()
  },

  async _loadMerchantInfo() {
    try {
      const data = await merchantService.getMerchantInfo()
      const m = data.merchantInfo
      this.setData({
        merchantInfo: m,
        feeLabels: this._buildFeeLabels(m),
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  _buildFeeLabels(m) {
    if (!m) return { minOrder: '未设置', packing: '未设置', delivery: '未设置' }
    const fmt = (cents) => cents ? ('¥' + (cents / 100).toFixed(2)) : '未设置'
    const deliveryRules = m.delivery_fee_rules
    return {
      minOrder: fmt(m.min_order_amount),
      packing: fmt(m.packing_fee),
      delivery: (deliveryRules && deliveryRules.length) ? (deliveryRules.length + '条规则') : '未设置'
    }
  },

  onChangeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        try {
          const fileID = await uploadService.uploadImage(tempPath, 'shop-avatars')
          await this._updateField('shop_avatar', fileID)
        } catch (err) {
          this.selectComponent('#toast').showToast({ message: '上传失败', type: 'error' })
        }
      }
    })
  },

  onChangeBanner() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        try {
          const fileID = await uploadService.uploadImage(tempPath, 'shop-banners')
          await this._updateField('shop_banner', fileID)
        } catch (err) {
          this.selectComponent('#toast').showToast({ message: '上传失败', type: 'error' })
        }
      }
    })
  },

  onEditField(e) {
    const field = e.currentTarget.dataset.field
    const isNumeric = !!NUMERIC_FIELD_LABELS[field]
    let currentValue = this.data.merchantInfo[field]
    if (isNumeric) {
      // 以元显示
      currentValue = currentValue != null ? (currentValue / 100).toString() : '0'
    } else {
      currentValue = currentValue || ''
    }
    this.setData({
      editingField: field,
      editValue: currentValue,
      editingNumeric: isNumeric
    })
  },

  onEditInput(e) {
    this.setData({ editValue: e.detail.value })
  },

  onEditConfirm() {
    const { editingField, editValue, editingNumeric } = this.data
    if (!editingField) return

    let value = editValue.trim()
    if (editingNumeric) {
      const yuan = parseFloat(value)
      if (isNaN(yuan) || yuan < 0) {
        this.selectComponent('#toast').showToast({ message: '请输入有效金额', type: 'error' })
        return
      }
      // 转换为分，取整
      value = Math.round(yuan * 100)
    }
    this._updateField(editingField, value)
    this.setData({ editingField: '' })
  },

  onEditCancel() {
    this.setData({ editingField: '' })
  },

  async _updateField(field, value) {
    try {
      const data = await merchantService.updateSettings({ [field]: value })
      const m = data.merchantInfo
      this.setData({ merchantInfo: m, feeLabels: this._buildFeeLabels(m) })
      app.globalData.merchantInfo = m
      this.selectComponent('#toast').showToast({ message: '更新成功', type: 'success' })
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: err.message || '更新失败', type: 'error' })
    }
  },

  onInviteTap() {
    wx.navigateTo({ url: '/pages/merchant/invite/index' })
  },

  onDeliverySettingsTap() {
    wx.navigateTo({ url: '/pages/merchant/delivery-settings/index' })
  },

  onPromotionsTap() {
    wx.navigateTo({ url: '/pages/merchant/promotions/index' })
  },

  // 格式化金额展示（分 → 元）
  _formatFee(cents) {
    if (!cents) return '未设置'
    return '¥' + (cents / 100).toFixed(2)
  }
})
