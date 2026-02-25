const app = getApp()
const merchantService = require('../../../services/merchant')
const uploadService = require('../../../services/upload')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    merchantInfo: null,
    loading: true,
    editingField: '',
    editValue: ''
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
      this.setData({ merchantInfo: data.merchantInfo, loading: false })
    } catch (err) {
      this.setData({ loading: false })
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
    const currentValue = this.data.merchantInfo[field] || ''
    this.setData({ editingField: field, editValue: currentValue })
  },

  onEditInput(e) {
    this.setData({ editValue: e.detail.value })
  },

  onEditConfirm() {
    const { editingField, editValue } = this.data
    if (!editingField) return
    this._updateField(editingField, editValue.trim())
    this.setData({ editingField: '' })
  },

  onEditCancel() {
    this.setData({ editingField: '' })
  },

  async _updateField(field, value) {
    try {
      const data = await merchantService.updateSettings({ [field]: value })
      this.setData({ merchantInfo: data.merchantInfo })
      app.globalData.merchantInfo = data.merchantInfo
      this.selectComponent('#toast').showToast({ message: '更新成功', type: 'success' })
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: '更新失败', type: 'error' })
    }
  },

  onInviteTap() {
    wx.navigateTo({ url: '/pages/merchant/invite/index' })
  },

  onComingSoon() {
    this.selectComponent('#toast').showToast({ message: '该功能即将上线', type: 'info' })
  }
})
