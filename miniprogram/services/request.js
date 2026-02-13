/**
 * 统一请求封装
 * 当前基于微信云开发，后续可切换为 HTTP 请求
 */

// Cloud function call wrapper
function callFunction(name, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: res => {
        const { result } = res
        if (result && result.code === 0) {
          resolve(result.data)
        } else {
          const error = new Error(result?.message || '请求失败')
          error.code = result?.code || -1
          reject(error)
        }
      },
      fail: err => {
        console.error(`[request] callFunction ${name} failed:`, err)
        reject(new Error('网络请求失败，请稍后重试'))
      }
    })
  })
}

module.exports = { callFunction }
