import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const preloadReloadKey = 'reshare:preload-reload-at'

function shouldReloadAfterPreloadError(lastReloadAt, now) {
  const elapsed = now - Number(lastReloadAt)
  return !Number.isFinite(elapsed) || elapsed >= 10_000
}

// Tab mở trước deploy có thể còn trỏ tới tệp cũ đã bị xoá. Thử lấy bản mới một lần.
window.addEventListener('vite:preloadError', (event) => {
  const now = Date.now()
  try {
    if (!shouldReloadAfterPreloadError(window.sessionStorage.getItem(preloadReloadKey), now)) return
    window.sessionStorage.setItem(preloadReloadKey, String(now))
  } catch {
    // Trạng thái lịch sử đi theo lần tải lại của tab khi trình duyệt chặn sessionStorage.
    try {
      const state = window.history.state
      if (!shouldReloadAfterPreloadError(state?.[preloadReloadKey], now)) return
      window.history.replaceState({ ...state, [preloadReloadKey]: now }, '')
    } catch {
      // Giữ lỗi gốc nếu không thể ghi dấu lần thử để tránh vòng lặp tải lại.
      return
    }
  }
  event.preventDefault()
  window.location.reload()
})

createApp(App).use(router).mount('#app')
