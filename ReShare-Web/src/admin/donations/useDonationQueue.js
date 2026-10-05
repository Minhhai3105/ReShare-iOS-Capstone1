import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { fetchDonationQueue, fetchQueueWarehouses } from './donation.service'
import { DEFAULT_DONATION_FILTERS, DONATION_QUEUE_ERROR } from './donation.constants'

const SEARCH_DEBOUNCE_MS = 300

export const QUEUE_VIEW_STATE = Object.freeze({
  loading: 'loading',
  ready: 'ready',
  empty: 'empty',
  error: 'error',
  forbidden: 'forbidden',
})

/** @param getAccess hàm trả về phạm vi hiện tại (resolveQueueAccess), gọi lại mỗi lần tải. */
export function useDonationQueue(getAccess) {
  const filters = reactive({ ...DEFAULT_DONATION_FILTERS })
  const page = ref(1)
  const result = ref(null)
  const warehouses = ref([])
  const errorStatus = ref(null)
  const isLoading = ref(false)
  const lastUpdatedAt = ref(null)
  let latestRequestId = 0
  let reloadTimer = null

  // Chỉ nhận kết quả của lần gọi mới nhất để bỏ phản hồi đến muộn khi đổi bộ lọc liên tục.
  async function load() {
    const requestId = ++latestRequestId
    isLoading.value = true
    errorStatus.value = null
    try {
      const data = await fetchDonationQueue(getAccess(), { ...filters, page: page.value })
      if (requestId !== latestRequestId) return
      result.value = data
      page.value = data.page
      lastUpdatedAt.value = new Date()
    } catch (error) {
      if (requestId !== latestRequestId) return
      errorStatus.value = error.status ?? DONATION_QUEUE_ERROR.server
    } finally {
      if (requestId === latestRequestId) isLoading.value = false
    }
  }

  async function loadWarehouses() {
    try {
      warehouses.value = await fetchQueueWarehouses(getAccess())
    } catch {
      warehouses.value = []
    }
  }

  function refresh() {
    loadWarehouses()
    load()
  }

  function goToPage(nextPage) {
    page.value = nextPage
    load()
  }

  function resetFilters() {
    Object.assign(filters, DEFAULT_DONATION_FILTERS)
  }

  // Mọi thay đổi bộ lọc quay về trang 1; riêng ô tìm kiếm được debounce.
  watch(
    () => ({ ...filters }),
    (next, previous) => {
      clearTimeout(reloadTimer)
      reloadTimer = setTimeout(
        () => {
          page.value = 1
          load()
        },
        next.search !== previous.search ? SEARCH_DEBOUNCE_MS : 0,
      )
    },
  )

  onBeforeUnmount(() => {
    clearTimeout(reloadTimer)
    latestRequestId += 1
  })

  const viewState = computed(() => {
    if (errorStatus.value === DONATION_QUEUE_ERROR.forbidden) return QUEUE_VIEW_STATE.forbidden
    if (errorStatus.value) return QUEUE_VIEW_STATE.error
    if (!result.value) return QUEUE_VIEW_STATE.loading
    return result.value.items.length ? QUEUE_VIEW_STATE.ready : QUEUE_VIEW_STATE.empty
  })

  const hasActiveFilters = computed(() =>
    Object.keys(DEFAULT_DONATION_FILTERS).some((key) => filters[key] !== DEFAULT_DONATION_FILTERS[key]),
  )

  return {
    filters,
    page,
    result,
    warehouses,
    errorStatus,
    isLoading,
    lastUpdatedAt,
    viewState,
    hasActiveFilters,
    refresh,
    goToPage,
    resetFilters,
  }
}
