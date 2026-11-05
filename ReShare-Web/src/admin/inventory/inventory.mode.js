// Mock phải được bật rõ ràng và chỉ được dùng trong môi trường phát triển.
export function inventoryMode(env = {}) {
  const source = (env.VITE_INVENTORY_SOURCE || 'live').trim()
  if (!['live', 'mock'].includes(source)) throw new Error('VITE_INVENTORY_SOURCE must be live or mock')
  if (source === 'mock' && !env.DEV) throw new Error('Mock inventory is not allowed in a build')
  return source
}
