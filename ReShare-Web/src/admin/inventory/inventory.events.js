// fetch streaming cho phép gửi Bearer header; token không đi vào URL/log truy cập.
export function watchInventoryEvents({ apiBase, warehouseId, getToken, onChange, onError, fetchImpl = fetch }) {
  const controller = new AbortController()
  let timer
  async function connect() {
    try {
      const url = new URL(`${apiBase}/v1/admin/inventory/events`)
      if (warehouseId) url.searchParams.set('warehouseId', warehouseId)
      const response = await fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${await getToken()}` }, signal: controller.signal,
      })
      if (!response.ok || !response.body) throw Object.assign(new Error('Không kết nối được đồng bộ kho'), { status: response.status })
      const reader = response.body.getReader(), decoder = new TextDecoder()
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
      onError(error)
      if (![401, 403].includes(error.status)) timer = setTimeout(connect, 1000)
    }
  }
  connect()
  return () => { controller.abort(); clearTimeout(timer) }
}
