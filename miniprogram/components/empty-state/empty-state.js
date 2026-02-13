Component({
  properties: {
    icon: {
      type: String,
      value: '\ud83d\udced'
    },
    text: {
      type: String,
      value: '\u6682\u65e0\u6570\u636e'
    },
    buttonText: {
      type: String,
      value: ''
    },
    description: {
      type: String,
      value: ''
    }
  },

  methods: {
    onActionTap() {
      this.triggerEvent('action');
    }
  }
});
