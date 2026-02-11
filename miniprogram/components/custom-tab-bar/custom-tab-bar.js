Component({
  properties: {
    active: {
      type: Number,
      value: 0
    }
  },

  methods: {
    switchTab(e) {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      const path = e.currentTarget.dataset.path;

      if (index === this.properties.active) {
        return;
      }

      this.triggerEvent('change', { index, path });

      wx.switchTab({
        url: path
      });
    }
  }
});
