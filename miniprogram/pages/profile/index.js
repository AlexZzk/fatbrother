const app = getApp()
const userService = require('../../services/user')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    userInfo: null,
    editingNickname: false,
    nicknameInput: ''
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight,
      userInfo: app.globalData.userInfo
    })
  },

  onShow() {
    this.setData({
      userInfo: app.globalData.userInfo
    })
  },

  /**
   * 选择头像（微信头像选择器）
   */
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    if (!avatarUrl) return

    this._updateProfile({ avatar_url: avatarUrl })
  },

  /**
   * 点击昵称行 → 打开编辑
   */
  onNicknameTap() {
    this.setData({
      editingNickname: true,
      nicknameInput: this.data.userInfo?.nick_name || ''
    })
  },

  /**
   * 昵称输入
   */
  onNicknameInput(e) {
    this.setData({ nicknameInput: e.detail.value })
  },

  /**
   * 昵称输入完成（type="nickname" 自动填充微信昵称）
   */
  onNicknameConfirm(e) {
    const nickName = (e.detail.value || '').trim()
    if (!nickName) {
      this.setData({ editingNickname: false })
      return
    }
    this.setData({ editingNickname: false })
    this._updateProfile({ nick_name: nickName })
  },

  /**
   * 昵称失焦 → 保存
   */
  onNicknameBlur(e) {
    const nickName = (e.detail.value || '').trim()
    this.setData({ editingNickname: false })
    if (nickName && nickName !== this.data.userInfo?.nick_name) {
      this._updateProfile({ nick_name: nickName })
    }
  },

  /**
   * 获取手机号
   */
  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      return
    }
    // 注意：真实场景需要将 e.detail.code 发送到云函数解密获取手机号
    // 这里先用 Toast 提示，后续对接
    this.selectComponent('#toast').showToast({
      message: '手机号绑定功能即将上线',
      type: 'info'
    })
  },

  /**
   * 调用服务更新个人信息
   */
  async _updateProfile(data) {
    try {
      const result = await userService.updateProfile(data)
      // 更新全局和本地状态
      app.globalData.userInfo = result.userInfo
      wx.setStorageSync('userInfo', result.userInfo)
      this.setData({ userInfo: result.userInfo })
      this.selectComponent('#toast').showToast({
        message: '更新成功',
        type: 'success'
      })
    } catch (err) {
      console.error('[profile] updateProfile failed:', err)
      this.selectComponent('#toast').showToast({
        message: '更新失败，请重试',
        type: 'error'
      })
    }
  }
})
