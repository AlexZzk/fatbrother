const uploadService = require('../../services/upload')

Component({
  properties: {
    src: { type: String, value: '' },
    dir: { type: String, value: 'images' },
    placeholder: { type: String, value: '+ 上传图片' }
  },

  data: {
    uploading: false
  },

  methods: {
    onChoose() {
      if (this.data.uploading) return
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: res => {
          const tempFilePath = res.tempFiles[0].tempFilePath
          this._upload(tempFilePath)
        }
      })
    },

    async _upload(filePath) {
      this.setData({ uploading: true })
      try {
        const fileID = await uploadService.uploadImage(filePath, this.data.dir)
        this.setData({ uploading: false })
        this.triggerEvent('change', { value: fileID })
      } catch (err) {
        this.setData({ uploading: false })
        wx.showToast({ title: '上传失败', icon: 'none' })
      }
    },

    onDelete() {
      this.triggerEvent('change', { value: '' })
    },

    onPreview() {
      if (!this.data.src) return
      wx.previewImage({ urls: [this.data.src], current: this.data.src })
    }
  }
})
