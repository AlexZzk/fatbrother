Component({
  properties: {
    count: { type: Number, value: 0 },
    totalPrice: { type: Number, value: 0 },
    merchantId: { type: String, value: '' }
  },

  methods: {
    onCartTap() {
      if (this.data.count > 0) {
        this.triggerEvent('toggle')
      }
    },

    onCheckout() {
      if (this.data.count <= 0) return
      this.triggerEvent('checkout', { merchantId: this.data.merchantId })
    }
  }
})
