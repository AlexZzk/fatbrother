const app = getApp()
const merchantService = require('../../services/merchant')

const HISTORY_KEY = 'search_history'
const MAX_HISTORY = 20
const DEBOUNCE_MS = 300

Page({
  data: {
    keyword: '',
    history: [],
    results: [],
    loading: false,
    searched: false,
    hasMore: false,
    page: 1
  },

  _debounceTimer: null,

  onLoad() {
    this._loadHistory()
  },

  onShow() {
    // Auto-focus handled by WXML auto-focus
  },

  // ========== 搜索逻辑 ==========

  onInput(e) {
    const keyword = e.detail.value.trim()
    this.setData({ keyword })

    if (this._debounceTimer) clearTimeout(this._debounceTimer)

    if (!keyword) {
      this.setData({ results: [], searched: false })
      return
    }

    this._debounceTimer = setTimeout(() => {
      this._doSearch(keyword, true)
    }, DEBOUNCE_MS)
  },

  onConfirm(e) {
    const keyword = (e.detail.value || this.data.keyword).trim()
    if (!keyword) return
    this._saveHistory(keyword)
    this._doSearch(keyword, true)
  },

  async _doSearch(keyword, reset = false) {
    const page = reset ? 1 : this.data.page
    this.setData({ loading: true })
    try {
      const res = await merchantService.search({ keyword, page, pageSize: 20 })
      const list = res.list || []
      this.setData({
        results: reset ? list : this.data.results.concat(list),
        hasMore: res.hasMore || false,
        page: page + 1,
        searched: true,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false, searched: true })
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this._doSearch(this.data.keyword, false)
    }
  },

  // ========== 搜索历史 ==========

  _loadHistory() {
    const history = wx.getStorageSync(HISTORY_KEY) || []
    this.setData({ history })
  },

  _saveHistory(keyword) {
    let history = wx.getStorageSync(HISTORY_KEY) || []
    // 去重并放到最前面
    history = history.filter(h => h !== keyword)
    history.unshift(keyword)
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY)
    wx.setStorageSync(HISTORY_KEY, history)
    this.setData({ history })
  },

  onHistoryTap(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ keyword })
    this._saveHistory(keyword)
    this._doSearch(keyword, true)
  },

  onClearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空搜索历史吗？',
      success: (res) => {
        if (!res.confirm) return
        wx.removeStorageSync(HISTORY_KEY)
        this.setData({ history: [] })
      }
    })
  },

  // ========== 导航 ==========

  onClearInput() {
    this.setData({ keyword: '', results: [], searched: false })
  },

  onCancel() {
    wx.navigateBack()
  },

  onShopTap(e) {
    const { shopId } = e.detail
    wx.navigateTo({ url: `/pages/shop/index?id=${shopId}` })
  }
})
