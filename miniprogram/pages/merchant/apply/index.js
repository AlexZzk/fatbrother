const app = getApp()
const merchantService = require('../../../services/merchant')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    form: {
      invite_code: '',
      shop_name: '',
      contact_name: '',
      contact_phone: '',
      mch_id: ''
    },
    inviteVerified: false,
    referrerShopName: '',
    submitting: false
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
    // 邀请码变动时重置验证状态
    if (field === 'invite_code') {
      this.setData({ inviteVerified: false, referrerShopName: '' })
    }
  },

  async onVerifyCode() {
    const code = this.data.form.invite_code.trim()
    if (!code) {
      this.selectComponent('#toast').showToast({ message: '请输入邀请码', type: 'error' })
      return
    }
    try {
      const data = await merchantService.verifyInviteCode(code)
      this.setData({
        inviteVerified: true,
        referrerShopName: data.referrerShopName
      })
      this.selectComponent('#toast').showToast({ message: '邀请码有效', type: 'success' })
    } catch (err) {
      this.setData({ inviteVerified: false, referrerShopName: '' })
      this.selectComponent('#toast').showToast({ message: err.message || '邀请码无效', type: 'error' })
    }
  },

  async onSubmit() {
    const { form, submitting } = this.data
    if (submitting) return

    // 表单验证
    if (form.invite_code.trim() && !this.data.inviteVerified) {
      this.selectComponent('#toast').showToast({ message: '请先验证邀请码', type: 'error' }); return
    }
    if (!form.shop_name.trim() || form.shop_name.trim().length < 2) {
      this.selectComponent('#toast').showToast({ message: '店铺名称至少2个字符', type: 'error' }); return
    }
    if (!form.contact_name.trim() || form.contact_name.trim().length < 2) {
      this.selectComponent('#toast').showToast({ message: '联系人姓名至少2个字符', type: 'error' }); return
    }
    if (!/^1\d{10}$/.test(form.contact_phone)) {
      this.selectComponent('#toast').showToast({ message: '请输入正确的手机号', type: 'error' }); return
    }

    this.setData({ submitting: true })
    try {
      await merchantService.apply(form)
      this.selectComponent('#toast').showToast({ message: '申请提交成功', type: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/merchant/pending/index' })
      }, 1500)
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: err.message || '提交失败', type: 'error' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
