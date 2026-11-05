// fetch streaming cho phép gửi Bearer header; token không đi vào URL/log truy cập.
const SESSION_ERRORS = new Set([
  'auth/invalid-user-token', 'auth/user-token-expired', 'auth/user-disabled',
  'auth/user-not-found', 'auth/user-signed-out', 'auth/null-user',
])

export function watchInventoryEvents({ apiBase, warehouseId, getToken, onChange, onError, fetchImpl = fetch }) {
  const controller = new AbortController()
  let timer
  let retryDelay = 1000
  async function connect() {
    if (controller.signal.aborted) return
    let reader, connectedAt
    try {
      const url = new URL(`${apiBase}/v1/admin/inventory/events`)
      if (warehouseId) url.searchParams.set('warehouseId', warehouseId)
      const token = await getToken()
      if (controller.signal.aborted) return
      const response = await fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      })
      reader = response.body?.getReader()
      if (!response.ok || !response.body) throw Object.assign(new Error('Không kết nối được đồng bộ kho'), { status: response.status })
      connectedAt = Date.now()
      const decoder = new TextDecoder()
      let pending = ''
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read()
        if (done) throw new Error('Kết nối đồng bộ kho đã ngắt')
        pending = (pending + decoder.decode(value, { stream: true })).replaceAll('\r\n', '\n')
        let end
        while ((end = pending.indexOf('\n\n')) >= 0) {
          const message = pending.slice(0, end)
          pending = pending.slice(end + 2)
          if (message.includes('event: access_lost')) throw Object.assign(new Error('Quyền kho đã thay đổi'), { status: 403 })
          if (message.includes('event: inventory')) onChange()
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return
      const failure = SESSION_ERRORS.has(error?.code)
        ? Object.assign(new Error('Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.'), { status: 401, code: error.code })
        : error
      onError(failure)
      if ([401, 403].includes(failure?.status)) { controller.abort(); return }
      if (controller.signal.aborted) return
      // Chỉ reset sau 30 giây ổn định để kết nối chập chờn không lặp lại mức 1 giây.
      if (connectedAt !== undefined && Date.now() - connectedAt >= 30000) retryDelay = 1000
      const delay = Math.min(30000, Math.round(retryDelay * (0.8 + Math.random() * 0.4)))
      retryDelay = Math.min(retryDelay * 2, 30000)
      timer = setTimeout(connect, delay)
    } finally {
      if (reader) {
        try { await reader.cancel() } catch { /* A disconnected stream may already be closed. */ }
        reader.releaseLock()
      }
    }
  }
  connect()
  return () => { controller.abort(); clearTimeout(timer) }
}
