Component({
  properties: {
    product: { type: Object, value: {} },
    count: { type: Number, value: 0 }
  },

  computed: {},

  methods: {
    onAdd() {
      const p = this.data.product
      const hasSpec = p.spec_groups && p.spec_groups.length > 0
      if (hasSpec) {
        this.triggerEvent('specadd', { product: p })
      } else {
        this.triggerEvent('add', { product: p })
      }
    },

    onMinus() {
      this.triggerEvent('minus', { product: this.data.product })
    },

    onTap() {
      this.triggerEvent('tap', { product: this.data.product })
    }
  }
})
