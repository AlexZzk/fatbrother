Component({
  properties: {
    value: {
      type: Number,
      value: 1
    },
    min: {
      type: Number,
      value: 1
    },
    max: {
      type: Number,
      value: 99
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onMinus() {
      if (this.data.disabled || this.data.value <= this.data.min) {
        return;
      }
      const newValue = this.data.value - 1;
      this.triggerEvent('change', { value: newValue });
    },

    onPlus() {
      if (this.data.disabled || this.data.value >= this.data.max) {
        return;
      }
      const newValue = this.data.value + 1;
      this.triggerEvent('change', { value: newValue });
    }
  }
});
