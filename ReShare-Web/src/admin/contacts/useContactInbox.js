import { reactive } from 'vue'
import { fetchContactInbox } from './contact-inbox.service.js'

export function useContactInbox(loadPage = fetchContactInbox) {
  const state = reactive({ contacts: [], loading: false, error: null, page: 1, hasMore: false, selectedId: null, syncedAt: null })
  let generation = 0, controller, timer, nextCursor = null, cursors = [null]

  function clear() {
    generation++
    controller?.abort()
    clearTimeout(timer)
    nextCursor = null; cursors = [null]
    Object.assign(state, { contacts: [], loading: false, error: null, page: 1, hasMore: false, selectedId: null, syncedAt: null })
  }

  async function load(cursor, page) {
    const requestId = ++generation
    controller?.abort()
    clearTimeout(timer)
    controller = new AbortController()
    const requestController = controller
    const signal = requestController.signal
    const timeout = setTimeout(() => requestController.abort(), 90000)
    timer = timeout
    Object.assign(state, { contacts: [], loading: true, error: null, hasMore: false, selectedId: null, syncedAt: null })
    try {
      const result = await loadPage({ cursor, signal })
      if (requestId !== generation) return
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      cursors[page - 1] = cursor
      nextCursor = result.nextCursor
      Object.assign(state, { contacts: result.contacts, page, hasMore: result.hasMore, selectedId: result.contacts[0]?.id || null, syncedAt: new Date().toISOString() })
    } catch (error) {
      if (requestId !== generation) return
      state.error = signal.aborted ? 'TIMEOUT' : error?.status || 'NETWORK'
    } finally {
      clearTimeout(timeout)
      if (requestId === generation) state.loading = false
    }
  }

  return {
    state, clear,
    refresh() { cursors = [null]; return load(null, 1) },
    next() { if (!state.loading && state.hasMore) return load(nextCursor, state.page + 1) },
    previous() { if (!state.loading && state.page > 1) return load(cursors[state.page - 2], state.page - 1) },
    select(id) { if (state.contacts.some(item => item.id === id)) state.selectedId = id },
  }
}
