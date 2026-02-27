const addressService = require('../../../services/address')

Page({
  data: {
    loading: true,
    addresses: [],
    // 是否为选择模式（从下单页跳来时传 mode=select）
    selectMode: false
  },

  onLoad(options) {
    this.setData({ selectMode: options.mode === 'select' })
  },

  onShow() {
    this._load()
  },

  async _load() {
    try {
      const res = await addressService.getAddresses()
      this.setData({ addresses: res.addresses, loading: false })
    } catch (err) {
      this.setData({ loading: false })
      this.selectComponent('#toast').showToast({ message: '加载失败', type: 'error' })
    }
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/address/edit/index' })
  },

  onEditTap(e) {
    const item = e.currentTarget.dataset.item
    const query = encodeURIComponent(JSON.stringify(item))
    wx.navigateTo({ url: `/pages/address/edit/index?data=${query}` })
  },

  // 选择模式下点击地址卡片 → 返回给上一页
  onSelectAddress(e) {
    if (!this.data.selectMode) return
    const id = e.currentTarget.dataset.id
    const address = this.data.addresses.find(a => a._id === id)
    if (!address) return
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage && prevPage.onAddressSelected) {
      prevPage.onAddressSelected(address)
    }
    wx.navigateBack()
  },

  async onSetDefault(e) {
    const id = e.currentTarget.dataset.id
    try {
      await addressService.setDefaultAddress(id)
      this.selectComponent('#toast').showToast({ message: '已设为默认', type: 'success' })
      this._load()
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: err.message || '操作失败', type: 'error' })
    }
  },

  onDeleteTap(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除地址',
      content: '确定要删除该地址吗？',
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (res.confirm) {
          try {
            await addressService.deleteAddress(id)
            this.selectComponent('#toast').showToast({ message: '已删除', type: 'success' })
            this._load()
          } catch (err) {
            this.selectComponent('#toast').showToast({ message: err.message || '删除失败', type: 'error' })
          }
        }
      }
    })
  }
})
