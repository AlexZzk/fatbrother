const userService = require('../../services/user')

function fmtAmount(cents) {
  const val = cents / 100
  return val % 1 === 0 ? String(val) : val.toFixed(2)
}

function fmtCondition(minOrderAmount) {
  return minOrderAmount > 0 ? ('满¥' + (minOrderAmount / 100).toFixed(2) + '可用') : '无门槛使用'
}

Page({
  data: {
    activeTab: 0, // 0=未使用, 1=已使用, 2=已过期
    tabs: ['未使用', '已使用', '已过期'],
    coupons: [],
    activities: [],
    loading: true,
    showActivities: false
  },

  onLoad() {
    this._loadCoupons()
    this._loadActivities()
  },

  onShow() {
    this._loadCoupons()
  },

  async _loadCoupons() {
    this.setData({ loading: true })
    try {
      const statusMap = ['unused', 'used', 'expired']
      const res = await userService.getUserCoupons(statusMap[this.data.activeTab])
      const coupons = (res.coupons || []).map(c => ({
        ...c,
        amountLabel: fmtAmount(c.amount),
        conditionLabel: fmtCondition(c.min_order_amount)
      }))
      this.setData({ coupons, loading: false })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  async _loadActivities() {
    try {
      const res = await userService.getCouponActivities()
      const activities = (res.activities || []).map(a => ({
        ...a,
        amountLabel: fmtAmount(a.amount),
        conditionLabel: a.min_order_amount > 0 ? ('满¥' + (a.min_order_amount / 100).toFixed(2) + '可用') : '无门槛'
      }))
      this.setData({ activities })
    } catch (err) {
      this.setData({ activities: [] })
    }
  },

  onTabChange(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ activeTab: index, coupons: [] }, () => {
      this._loadCoupons()
    })
  },

  onShowActivities() {
    this.setData({ showActivities: true })
  },

  onHideActivities() {
    this.setData({ showActivities: false })
  },

  async onClaimCoupon(e) {
    const activityId = e.currentTarget.dataset.id
    try {
      const res = await userService.claimCoupon(activityId)
      wx.showToast({ title: `领取成功！¥${(res.amount / 100).toFixed(0)}元红包已到账`, icon: 'success', duration: 2000 })
      this._loadActivities()
      if (this.data.activeTab === 0) {
        this._loadCoupons()
      }
    } catch (err) {
      wx.showToast({ title: err.message || '领取失败', icon: 'none' })
    }
  }
})
