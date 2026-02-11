const format = require('../../utils/format')

Component({
  properties: {
    shop: { type: Object, value: {} }
  },

  methods: {
    onTap() {
      this.triggerEvent('tap', { shopId: this.data.shop._id })
    }
  },

  lifetimes: {
    attached() {
      const { shop } = this.data
      if (shop.distance !== null && shop.distance !== undefined) {
        this.setData({ distanceText: format.distance(shop.distance) })
      }
    }
  }
})
