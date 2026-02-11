Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    message: {
      type: String,
      value: ''
    },
    type: {
      type: String,
      value: 'success'
    },
    duration: {
      type: Number,
      value: 1500
    }
  },

  observers: {
    show: function (show) {
      if (show) {
        this._startAutoHideTimer();
      } else {
        this._clearTimer();
      }
    }
  },

  lifetimes: {
    detached() {
      this._clearTimer();
    }
  },

  methods: {
    /**
     * Public method — parent pages call this via selectComponent:
     *   this.selectComponent('#toast').showToast({ message, type, duration })
     */
    showToast(options = {}) {
      const message = options.message || '';
      const type = options.type || 'success';
      const duration = options.duration !== undefined ? options.duration : this.data.duration;

      this.setData({ show: true, message, type, duration });
      this._startAutoHideTimer();
    },

    hideToast() {
      this._clearTimer();
      this.setData({ show: false });
      this.triggerEvent('close');
    },

    _startAutoHideTimer() {
      this._clearTimer();
      this._timer = setTimeout(() => {
        this.hideToast();
      }, this.data.duration);
    },

    _clearTimer() {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    }
  }
});
