/**
 * File upload service (cloud storage)
 */

const uploadService = {
  /**
   * Upload image to cloud storage
   * @param {string} filePath - Local temp file path
   * @param {string} dir - Cloud storage directory (e.g. 'shop-avatars', 'products')
   * @returns {Promise<string>} Cloud file ID
   */
  uploadImage(filePath, dir = 'images') {
    const ext = filePath.split('.').pop()
    const cloudPath = `${dir}/${Date.now()}-${Math.random().toString(36).substr(2, 8)}.${ext}`

    return new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: res => {
          resolve(res.fileID)
        },
        fail: err => {
          console.error('[upload] uploadImage failed:', err)
          reject(new Error('图片上传失败'))
        }
      })
    })
  },

  /**
   * Get temporary URL for cloud file
   * @param {string[]} fileList - Array of cloud file IDs
   * @returns {Promise<Object[]>} Array of { fileID, tempFileURL }
   */
  getTempFileURL(fileList) {
    return new Promise((resolve, reject) => {
      wx.cloud.getTempFileURL({
        fileList,
        success: res => {
          resolve(res.fileList)
        },
        fail: err => {
          console.error('[upload] getTempFileURL failed:', err)
          reject(new Error('获取文件链接失败'))
        }
      })
    })
  },

  /**
   * Delete cloud files
   * @param {string[]} fileList - Array of cloud file IDs
   * @returns {Promise}
   */
  deleteFiles(fileList) {
    return new Promise((resolve, reject) => {
      wx.cloud.deleteFile({
        fileList,
        success: res => {
          resolve(res.fileList)
        },
        fail: err => {
          console.error('[upload] deleteFiles failed:', err)
          reject(new Error('文件删除失败'))
        }
      })
    })
  }
}

module.exports = uploadService
