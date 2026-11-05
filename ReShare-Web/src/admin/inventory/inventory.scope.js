export function resolveInventoryScope(queryWarehouseId, access) {
  const denied = { warehouseId: '', allowed: false }
  if (!access || (queryWarehouseId != null && typeof queryWarehouseId !== 'string')) return denied
  const requested = queryWarehouseId?.trim() || ''
  if (requested && !/^[A-Za-z0-9_-]{1,64}$/.test(requested)) return denied
  if (access.isAllWarehouses) return { warehouseId: requested, allowed: true }
  const ids = Array.isArray(access.warehouseIds) ? access.warehouseIds : []
  const warehouseId = requested || ids[0] || ''
  return { warehouseId, allowed: Boolean(warehouseId && /^[A-Za-z0-9_-]{1,64}$/.test(warehouseId) && ids.includes(warehouseId)) }
}
