const app = getApp()
const merchantService = require('../../services/merchant')
const location = require('../../utils/location')
const { PAGE_SIZE } = require('../../utils/constants')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    locationName: '定位中...',
    latitude: 0,
    longitude: 0,
    shopList: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    locationFailed: false
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
    this._initLocation()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  onPullDownRefresh() {
    this._initLocation().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this._loadShops()
    }
  },

  async _initLocation() {
    this.setData({ page: 1, shopList: [], hasMore: true })
    try {
      const loc = await location.getLocation()
      this.setData({
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationName: loc.name || '当前位置',
        locationFailed: false
      })
      app.globalData.location = loc
    } catch (err) {
      // 定位失败仍然加载商户列表，只是不显示距离
      this.setData({
        latitude: 0,
        longitude: 0,
        locationFailed: false,
        locationName: '未定位'
      })
    }
    await this._loadShops()
  },

  async _loadShops() {
    const { page, latitude, longitude, shopList, loadingMore } = this.data
    if (loadingMore) return

    this.setData({ loadingMore: page > 1, loading: page === 1 })

    try {
      const data = await merchantService.getNearbyList({
        latitude,
        longitude,
        page,
        pageSize: PAGE_SIZE
      })

      this.setData({
        shopList: page === 1 ? data.list : [...shopList, ...data.list],
        hasMore: data.hasMore,
        page: page + 1,
        loading: false,
        loadingMore: false
      })
    } catch (err) {
      this.setData({ loading: false, loadingMore: false })
    }
  },

  onLocationTap() {
    this._initLocation()
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/index' })
  },

  onShopTap(e) {
    const { shopId } = e.detail
    wx.navigateTo({ url: `/pages/shop/index?id=${shopId}` })
  },

  onRetryLocation() {
    this._initLocation()
  }
})
