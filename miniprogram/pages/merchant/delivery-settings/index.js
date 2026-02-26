const merchantService = require('../../../services/merchant')

Page({
  data: {
    merchantInfo: null,
    loading: true,
    // 规则列表（前端工作副本）
    rules: [],
    // 是否正在编辑某条规则
    editingIndex: -1,
    editForm: { max_distance_km: '', fee_yuan: '' },
    showForm: false
  },

  onShow() {
    this._load()
  },

  async _load() {
    try {
      const res = await merchantService.getMerchantInfo()
      const merchantInfo = res.merchantInfo
      const rules = (merchantInfo.delivery_fee_rules || []).map(r => ({
        max_distance: r.max_distance,
        fee: r.fee,
        // 用于显示
        label: r.max_distance === 0
          ? '超出以上距离'
          : (r.max_distance / 1000).toFixed(1) + 'km 以内',
        feeLabel: r.fee < 0 ? '不配送' : (r.fee === 0 ? '免费' : '¥' + (r.fee / 100).toFixed(2))
      }))
      this.setData({ merchantInfo, rules, loading: false })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  onAddRule() {
    this.setData({
      showForm: true,
      editingIndex: -1,
      editForm: { max_distance_km: '', fee_yuan: '' }
    })
  },

  onEditRule(e) {
    const index = e.currentTarget.dataset.index
    const rule = this.data.rules[index]
    this.setData({
      showForm: true,
      editingIndex: index,
      editForm: {
        max_distance_km: rule.max_distance === 0 ? '0' : (rule.max_distance / 1000).toString(),
        fee_yuan: rule.fee < 0 ? '-1' : (rule.fee / 100).toString()
      }
    })
  },

  onDeleteRule(e) {
    const index = e.currentTarget.dataset.index
    const rules = [...this.data.rules]
    rules.splice(index, 1)
    this.setData({ rules })
    this._save(rules)
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`editForm.${field}`]: e.detail.value })
  },

  onFormCancel() {
    this.setData({ showForm: false })
  },

  onFormConfirm() {
    const { editForm, editingIndex, rules } = this.data
    const distanceKm = parseFloat(editForm.max_distance_km)
    const feeYuan = parseFloat(editForm.fee_yuan)

    if (isNaN(distanceKm) || distanceKm < 0) {
      wx.showToast({ title: '请输入有效的距离（0表示兜底规则）', icon: 'none' })
      return
    }
    if (isNaN(feeYuan)) {
      wx.showToast({ title: '请输入有效的配送费（-1表示不配送）', icon: 'none' })
      return
    }

    const maxDistance = Math.round(distanceKm * 1000) // km → 米
    const fee = feeYuan < 0 ? -1 : Math.round(feeYuan * 100) // 元 → 分

    const newRule = {
      max_distance: maxDistance,
      fee,
      label: maxDistance === 0 ? '超出以上距离' : (maxDistance / 1000).toFixed(1) + 'km 以内',
      feeLabel: fee < 0 ? '不配送' : (fee === 0 ? '免费' : '¥' + (fee / 100).toFixed(2))
    }

    const newRules = [...rules]
    if (editingIndex >= 0) {
      newRules[editingIndex] = newRule
    } else {
      newRules.push(newRule)
    }

    // 按距离排序（0排最后）
    newRules.sort((a, b) => {
      if (a.max_distance === 0) return 1
      if (b.max_distance === 0) return -1
      return a.max_distance - b.max_distance
    })

    this.setData({ rules: newRules, showForm: false })
    this._save(newRules)
  },

  async _save(rules) {
    const saveRules = rules.map(r => ({ max_distance: r.max_distance, fee: r.fee }))
    try {
      await merchantService.updateSettings({ delivery_fee_rules: saveRules })
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  }
})
