const app = getApp()
const merchantService = require('../../../services/merchant')
const { formatTime } = require('../../../utils/format')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    inviteCode: '',
    records: [],
    directCount: 0,
    indirectCount: 0,
    loading: true
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
    this._loadData()
  },

  async _loadData() {
    try {
      const merchantInfo = app.globalData.merchantInfo
      if (merchantInfo) {
        this.setData({ inviteCode: merchantInfo.invite_code || '' })
      }

      const data = await merchantService.getInviteRecords()
      const records = (data.records || []).map(r => ({
        ...r,
        created_at_text: r.created_at ? formatTime(new Date(r.created_at), 'YYYY-MM-DD') : ''
      }))
      this.setData({
        records,
        directCount: data.directCount || 0,
        indirectCount: data.indirectCount || 0,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  onCopyCode() {
    if (!this.data.inviteCode) return
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => {
        this.selectComponent('#toast').showToast({ message: '邀请码已复制', type: 'success' })
      }
    })
  }
})
