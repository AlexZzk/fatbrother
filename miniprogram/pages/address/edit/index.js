const addressService = require('../../../services/address')

Page({
  data: {
    isEdit: false,
    addressId: '',
    form: {
      name: '',
      phone: '',
      address: '',
      address_detail: '',
      lat: 0,
      lng: 0,
      is_default: false
    },
    saving: false
  },

  onLoad(options) {
    if (options.data) {
      try {
        const item = JSON.parse(decodeURIComponent(options.data))
        this.setData({
          isEdit: true,
          addressId: item._id,
          form: {
            name: item.name || '',
            phone: item.phone || '',
            address: item.address || '',
            address_detail: item.address_detail || '',
            lat: item.lat || 0,
            lng: item.lng || 0,
            is_default: item.is_default || false
          }
        })
      } catch (e) {}
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onToggleDefault() {
    this.setData({ 'form.is_default': !this.data.form.is_default })
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          'form.address': res.address || res.name || '',
          'form.lat': res.latitude,
          'form.lng': res.longitude
        })
      }
    })
  },

  async onSave() {
    const { form, isEdit, addressId, saving } = this.data
    if (saving) return

    if (!form.name.trim()) {
      this.selectComponent('#toast').showToast({ message: '请填写收件人姓名', type: 'error' })
      return
    }
    if (!form.phone.trim() || !/^1[3-9]\d{9}$/.test(form.phone.trim())) {
      this.selectComponent('#toast').showToast({ message: '请输入正确的手机号', type: 'error' })
      return
    }
    if (!form.address.trim()) {
      this.selectComponent('#toast').showToast({ message: '请选择配送地址', type: 'error' })
      return
    }

    this.setData({ saving: true })
    try {
      if (isEdit) {
        await addressService.updateAddress(addressId, form)
      } else {
        await addressService.addAddress(form)
      }
      wx.navigateBack()
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: err.message || '保存失败', type: 'error' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
