Component({
  properties: {
    value: {
      type: Number,
      value: 0
    },
    size: {
      type: String,
      value: 'md'
    },
    color: {
      type: String,
      value: '#FF6B35'
    }
  },

  data: {
    intPart: '0',
    decPart: ''
  },

  observers: {
    'value': function (value) {
      var yuan = Math.abs(value) / 100;
      var parts = yuan.toFixed(2).split('.');
      var intPart = parts[0];
      var decPart = parts[1] === '00' ? '' : parts[1];

      this.setData({
        intPart: intPart,
        decPart: decPart
      });
    }
  }
});
