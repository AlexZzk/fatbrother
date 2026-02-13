const app = getApp()
const productService = require('../../../services/product')

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    categories: [],
    loading: true,
    showModal: false,
    editingId: '',
    editName: '',
    modalTitle: '新增分类'
  },

  onLoad() {
    this.setData({
      navBarHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })
    this._loadCategories()
  },

  async _loadCategories() {
    try {
      const merchant = app.globalData.merchantInfo
      if (!merchant) return
      const data = await productService.getCategories(merchant._id)
      this.setData({ categories: data.categories || [], loading: false })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  onAddCategory() {
    this.setData({ showModal: true, editingId: '', editName: '', modalTitle: '新增分类' })
  },

  onEditCategory(e) {
    const { id, name } = e.currentTarget.dataset
    this.setData({ showModal: true, editingId: id, editName: name, modalTitle: '编辑分类' })
  },

  onNameInput(e) {
    this.setData({ editName: e.detail.value })
  },

  onModalCancel() {
    this.setData({ showModal: false })
  },

  async onModalConfirm() {
    const { editName, editingId } = this.data
    if (!editName.trim()) {
      this.selectComponent('#toast').showToast({ message: '请输入分类名称' })
      return
    }
    try {
      await productService.saveCategory({ categoryId: editingId || undefined, name: editName.trim() })
      this.setData({ showModal: false })
      this.selectComponent('#toast').showToast({ message: editingId ? '修改成功' : '添加成功', type: 'success' })
      this._loadCategories()
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: err.message || '操作失败' })
    }
  },

  onDeleteCategory(e) {
    const { id, count } = e.currentTarget.dataset
    if (count > 0) {
      this.selectComponent('#toast').showToast({ message: '请先移除该分类下的商品' })
      return
    }
    wx.showModal({
      title: '提示',
      content: '确认删除该分类？',
      success: async res => {
        if (!res.confirm) return
        try {
          await productService.deleteCategory(id)
          this.selectComponent('#toast').showToast({ message: '删除成功', type: 'success' })
          this._loadCategories()
        } catch (err) {
          this.selectComponent('#toast').showToast({ message: err.message || '删除失败' })
        }
      }
    })
  },

  async onMoveUp(e) {
    const { index } = e.currentTarget.dataset
    if (index <= 0) return
    const cats = [...this.data.categories]
    ;[cats[index - 1], cats[index]] = [cats[index], cats[index - 1]]
    this.setData({ categories: cats })
    await this._saveSort(cats)
  },

  async onMoveDown(e) {
    const { index } = e.currentTarget.dataset
    const cats = [...this.data.categories]
    if (index >= cats.length - 1) return
    ;[cats[index], cats[index + 1]] = [cats[index + 1], cats[index]]
    this.setData({ categories: cats })
    await this._saveSort(cats)
  },

  async _saveSort(cats) {
    try {
      await productService.sortCategories(cats.map(c => c._id))
    } catch (err) {
      this.selectComponent('#toast').showToast({ message: '排序保存失败' })
    }
  }
})
