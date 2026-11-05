export function inventoryRevision(value) {
  if (typeof value === 'string' && value.length > 0 && value.length <= 128) return value
  if (Number.isSafeInteger(value) && value >= 0) return String(value)
  return null
}

export function createInventorySyncState() {
  let observed = null, loaded = null
  return {
    observe(value) { observed = inventoryRevision(value); return observed !== null && observed !== loaded },
    acknowledge(value) { loaded = inventoryRevision(value) },
    clear() { observed = null; loaded = null },
    get needsRefresh() { return observed !== null && observed !== loaded },
  }
}
