Component({
  properties: {
    show: { type: Boolean, value: false },
    items: { type: Array, value: [] },
    totalPrice: { type: Number, value: 0 }
  },

  methods: {
    onClose() {
      this.triggerEvent('close')
    },

    onMaskTap() {
      this.onClose()
    },

    onQuantityChange(e) {
      const { cartid } = e.currentTarget.dataset
      const value = e.detail.value
      this.triggerEvent('change', { cartId: cartid, quantity: value })
    },

    onClear() {
      wx.showModal({
        title: '提示',
        content: '确定清空购物车？',
        success: res => {
          if (res.confirm) {
            this.triggerEvent('clear')
          }
        }
      })
    },

    noop() {}
  }
})
