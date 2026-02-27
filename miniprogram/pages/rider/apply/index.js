const riderService = require('../../../services/rider')
const { RIDER_VEHICLE_TYPE } = require('../../../utils/constants')

const VEHICLE_OPTIONS = Object.entries(RIDER_VEHICLE_TYPE).map(([value, label]) => ({ value, label }))

Page({
  data: {
    form: {
      real_name: '',
      phone: '',
      id_card_no: '',
      vehicle_type: '',
      vehicle_desc: '',
      service_area: ''
    },
    vehicleTypeText: '',
    agreed: false,
    submitting: false
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onChooseVehicle() {
    wx.showActionSheet({
      itemList: VEHICLE_OPTIONS.map(o => o.label),
      success: (res) => {
        const selected = VEHICLE_OPTIONS[res.tapIndex]
        this.setData({
          'form.vehicle_type': selected.value,
          vehicleTypeText: selected.label
        })
      }
    })
  },

  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed })
  },

  async onSubmit() {
    const { form, agreed, submitting } = this.data
    if (submitting) return

    if (!form.real_name.trim()) {
      this.selectComponent('#toast').showToast({ message: '请填写真实姓名', type: 'error' })
      return
    }
    if (!form.phone.trim() || !/^1[3-9]\d{9}$/.test(form.phone.trim())) {
      this.selectComponent('#toast').showToast({ message: '请输入正确的手机号', type: 'error' })
      return
    }
    if (!form.vehicle_type) {
      this.selectComponent('#toast').showToast({ message: '请选择车辆类型', type: 'error' })
      return
    }
    if (!agreed) {
      this.selectComponent('#toast').showToast({ message: '请阅读并同意骑手服务协议', type: 'error' })
      return
    }

    this.setData({ submitting: true })
    try {
      await riderService.applyRider(form)
      wx.showToast({ title: '申请已提交', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/rider/status/index' })
      }, 1500)
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: err.message || '提交失败，请重试', type: 'error' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
