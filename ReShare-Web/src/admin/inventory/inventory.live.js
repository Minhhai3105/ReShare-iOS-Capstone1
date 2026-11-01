// Nguồn dữ liệu tồn kho thật (bản build): gọi inventory-api (US14) và distribution-history-api (US17).
// Tách khỏi inventory.service.js và nhận fetch/getToken từ ngoài để test bằng node, không cần Firebase.
// Trả đúng hình dữ liệu mà các màn kho đang dùng với dữ liệu mẫu, nên view không phải sửa.

// API trả tối đa 50 dòng mỗi lần; màn hiện chưa có "tải thêm" nên số đếm ghi "50+" khi còn trang sau.
const PAGE_LIMIT = 50

const createError = (status) => Object.assign(new Error(String(status)), { status })

// 401 cũng hiện như mất quyền: màn kho chỉ có trạng thái forbidden, notFound và lỗi máy chủ.
function statusFrom(httpStatus, isDetail) {
  if (httpStatus === 401 || httpStatus === 403) return 403
  if (httpStatus === 404 || (isDetail && httpStatus === 400)) return 404
  return 500
}

const byTime = (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id)

function movementFrom(movement) {
  return {
    ...movement,
    // Phiếu nhập không có voucherId; cột "Chứng từ" hiện mã phiếu nhập như dữ liệu mẫu.
    voucherId: movement.voucherId || movement.stockEntryId || null,
    actor: movement.actorEmail || movement.actorUid || '—',
    note: movement.note || '—',
  }
}

export function createLiveInventorySource({ apiBase, getToken, fetchImpl = (...args) => fetch(...args) }) {
  async function request(path, params = {}, isDetail = false) {
    const url = new URL(`${apiBase}${path}`)
    for (const [key, value] of Object.entries(params)) {
      if (value !== '' && value !== undefined && value !== null) url.searchParams.set(key, String(value))
    }
    let response
    try {
      response = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${await getToken()}` } })
    } catch (error) {
      throw error?.status ? error : createError(500)
    }
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw createError(statusFrom(response.status, isDetail))
    return body
  }

  const itemDetail = (itemId) =>
    request(`/v1/admin/inventory/${encodeURIComponent(itemId)}`, { limit: PAGE_LIMIT }, true)

  /** @returns { items, counts } — counts lấy từ danh sách "Tất cả" cùng bộ lọc. */
  async function listInventory({ warehouseId, search, category, condition, stock }) {
    const params = { warehouseId, search: search?.trim(), category, condition, limit: PAGE_LIMIT }
    const all = await request('/v1/admin/inventory', { ...params, stock: 'all' })
    const tab = stock === 'all' ? all : await request('/v1/admin/inventory', { ...params, stock })
    const inStock = all.items.filter(({ quantityAvailable }) => quantityAvailable > 0).length
    const count = (value) => (all.nextCursor ? `${value}+` : value)
    return {
      items: tab.items,
      counts: { all: count(all.items.length), in_stock: count(inStock), out_of_stock: count(all.items.length - inStock) },
    }
  }

  /** @returns { item, movements } — movements mới nhất trước, như API trả. */
  async function getInventoryItem(itemId) {
    const { item, movements } = await itemDetail(itemId)
    return { item, movements: movements.map(movementFrom) }
  }

  /** @returns { voucher, beneficiary, lines } — tồn trước/sau tính từ lịch sử biến động của từng vật phẩm. */
  async function getDistributionVoucher(voucherId) {
    const { voucher, beneficiary } = await request(`/v1/admin/distributions/${encodeURIComponent(voucherId)}`, {}, true)
    const itemIds = [...new Set(voucher.lines.map(({ inventoryItemId }) => inventoryItemId))]
    // Thiếu một vật phẩm (đã xoá, lỗi mạng) chỉ làm dòng đó hiện "—", không làm hỏng cả phiếu.
    const details = new Map(await Promise.all(itemIds.map(async (itemId) => [itemId, await itemDetail(itemId).catch(() => null)])))
    const lines = voucher.lines.map(({ inventoryItemId, quantity, unitId }) => {
      const detail = details.get(inventoryItemId)
      // Chỉ tính tồn trước/sau khi có đủ lịch sử; lịch sử bị cắt trang thì tổng sẽ sai.
      const history = detail && !detail.nextCursor ? [...detail.movements].sort(byTime) : null
      const index = history ? history.findIndex((movement) => movement.voucherId === voucher.id) : -1
      const stockBefore = index < 0 ? null : history.slice(0, index).reduce((sum, movement) => sum + movement.quantity, 0)
      return {
        inventoryItemId,
        itemName: detail?.item.itemName || inventoryItemId,
        unitId: unitId || detail?.item.unitId || '',
        stockEntryId: detail?.item.stockEntryId || '',
        quantity,
        stockBefore,
        stockAfter: index < 0 ? null : stockBefore + history[index].quantity,
      }
    })
    return {
      voucher: {
        ...voucher,
        createdBy: voucher.createdByEmail || voucher.createdByUid || '—',
        confirmedBy: voucher.confirmedByEmail || voucher.confirmedByUid || '—',
      },
      beneficiary: beneficiary?.id
        ? { id: beneficiary.id, displayName: beneficiary.displayName || beneficiary.id, supportCount: beneficiary.supportCount ?? 0 }
        : null,
      lines,
    }
  }

  return { listInventory, getInventoryItem, getDistributionVoucher }
}
