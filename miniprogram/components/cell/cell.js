Component({
  properties: {
    icon: {
      type: String,
      value: ''
    },
    title: {
      type: String,
      value: ''
    },
    value: {
      type: String,
      value: ''
    },
    arrow: {
      type: Boolean,
      value: true
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onClick() {
      if (this.data.disabled) {
        return;
      }
      this.triggerEvent('click');
    }
  }
});
