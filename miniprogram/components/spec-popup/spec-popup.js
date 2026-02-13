const format = require('../../utils/format')

Component({
  properties: {
    show: { type: Boolean, value: false },
    product: { type: Object, value: null }
  },

  data: {
    quantity: 1,
    selectedSpecs: {},  // { groupIndex: [specIndex, ...] }
    totalPrice: 0,
    canSubmit: false,
    missingRequired: ''
  },

  observers: {
    'show, product': function (show, product) {
      if (show && product) {
        this._reset()
      }
    }
  },

  methods: {
    _reset() {
      const product = this.data.product
      if (!product) return
      const selectedSpecs = {}
      // Auto-select first option for required single-select groups
      ;(product.spec_groups || []).forEach((g, gi) => {
        if (g.required && !g.multi_select) {
          selectedSpecs[gi] = [0]
        } else {
          selectedSpecs[gi] = []
        }
      })
      this.setData({ selectedSpecs, quantity: 1 })
      this._calcPrice()
    },

    onSelectSpec(e) {
      const { gi, si } = e.currentTarget.dataset
      const product = this.data.product
      const group = product.spec_groups[gi]
      const selected = { ...this.data.selectedSpecs }
      let arr = [...(selected[gi] || [])]

      if (group.multi_select) {
        const idx = arr.indexOf(si)
        if (idx > -1) {
          arr.splice(idx, 1)
        } else {
          arr.push(si)
        }
      } else {
        arr = arr[0] === si ? [] : [si]
        // Required single-select: must have selection
        if (group.required && arr.length === 0) arr = [si]
      }

      selected[gi] = arr
      this.setData({ selectedSpecs: selected })
      this._calcPrice()
    },

    onQuantityChange(e) {
      this.setData({ quantity: e.detail.value })
      this._calcPrice()
    },

    _calcPrice() {
      const { product, selectedSpecs, quantity } = this.data
      if (!product) return

      let price = product.base_price
      let allRequired = true
      let missingRequired = ''

      ;(product.spec_groups || []).forEach((g, gi) => {
        const arr = selectedSpecs[gi] || []
        if (g.required && arr.length === 0) {
          allRequired = false
          if (!missingRequired) missingRequired = g.name
        }
        arr.forEach(si => {
          price += (g.specs[si].price_delta || 0)
        })
      })

      this.setData({
        totalPrice: price * quantity,
        canSubmit: allRequired,
        missingRequired
      })
    },

    onConfirm() {
      if (!this.data.canSubmit) return
      const { product, selectedSpecs, quantity, totalPrice } = this.data

      // Build spec summary
      const specs = []
      ;(product.spec_groups || []).forEach((g, gi) => {
        const arr = selectedSpecs[gi] || []
        arr.forEach(si => {
          specs.push({
            groupName: g.name,
            itemName: g.specs[si].name,
            priceDelta: g.specs[si].price_delta || 0
          })
        })
      })

      this.triggerEvent('confirm', {
        productId: product._id,
        productName: product.name,
        productImage: product.image || '',
        basePrice: product.base_price,
        specs,
        quantity,
        unitPrice: totalPrice / quantity
      })
      this.onClose()
    },

    onClose() {
      this.triggerEvent('close')
    },

    onMaskTap() {
      this.onClose()
    },

    // prevent scroll through
    noop() {},

    formatPrice(cents) {
      return format.price(cents)
    }
  }
})
