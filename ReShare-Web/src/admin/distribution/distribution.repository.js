import { distributionFixtures } from './distribution.mock.js'

const clone = (value) => structuredClone(value)
const fail = (code, message, details = {}) => Object.assign(new Error(message), { code, ...details })

export function canDistribute(assignment, warehouseId) {
  return assignment?.active === true && (
    assignment.role === 'system_admin' ||
    (assignment.role === 'warehouse_admin' && Array.isArray(assignment.warehouseIds) && assignment.warehouseIds.includes(warehouseId))
  )
}

export function validateDistribution({ quantity, beneficiaryId, handedOver, note = '' }, item, beneficiaries) {
  const errors = {}
  const amount = Number(quantity)
  if (!item) errors.item = 'Chọn vật phẩm trong kho được phân công.'
  if (!/^\d+$/.test(String(quantity)) || !Number.isSafeInteger(amount) || amount <= 0) {
    errors.quantity = 'Số lượng phải là số nguyên dương.'
  } else if (item && amount > item.available) {
    errors.quantity = `Chỉ còn ${item.available} ${item.unit}. Vui lòng điều chỉnh số lượng.`
  }
  if (!beneficiaries.some((entry) => entry.id === beneficiaryId && entry.approved && entry.warehouseId === item?.warehouseId)) {
    errors.beneficiaryId = 'Chọn người thụ hưởng đã duyệt thuộc phạm vi kho.'
  }
  if (typeof note !== 'string' || note.length > 500) errors.note = 'Ghi chú tối đa 500 ký tự.'
  if (handedOver !== true) errors.handedOver = 'Cần xác nhận đã bàn giao thực tế.'
  return errors
}

// Deliberately has no Firebase, fetch, localStorage or production adapter.
// The synchronous commit below simulates concurrency ONLY within this instance.
// Actual stock safety, authorization and transactions must be enforced by BE.
export function createDemoDistributionRepository({ getAssignment, getActor }) {
  const data = clone(distributionFixtures)
  const vouchers = []
  const movements = []
  let sequence = 0

  function checkAccess(warehouseId) {
    if (!canDistribute(getAssignment(), warehouseId)) {
      throw fail('FORBIDDEN', 'Bạn không có quyền phân phối tại kho này.')
    }
  }

  function list() {
    const warehouses = data.warehouses.filter((entry) => canDistribute(getAssignment(), entry.id))
    const ids = new Set(warehouses.map((entry) => entry.id))
    return clone({
      warehouses,
      inventory: data.inventory.filter((entry) => ids.has(entry.warehouseId)),
      beneficiaries: data.beneficiaries.filter((entry) => ids.has(entry.warehouseId) && entry.approved),
    })
  }

  async function createVoucher(draft, scenario = 'normal') {
    // Let two simultaneous requests reach the commit boundary with the same version.
    await Promise.resolve()
    checkAccess(draft.warehouseId)
    const actor = getActor()
    if (!actor?.id) throw fail('UNAUTHENTICATED', 'Không xác định được nhân sự thực hiện.')
    const item = data.inventory.find((entry) => entry.id === draft.itemId && entry.warehouseId === draft.warehouseId)
    if (!item) throw fail('NOT_FOUND', 'Vật phẩm không thuộc kho đang thao tác.')
    if (!['normal', 'shortage', 'conflict'].includes(scenario)) throw fail('INVALID_SCENARIO', 'Kịch bản mẫu không hợp lệ.')
    draft = { ...draft, note: draft.note === undefined ? '' : draft.note }
    const fieldErrors = validateDistribution(draft, { ...item, available: Number.MAX_SAFE_INTEGER }, data.beneficiaries)
    if (Object.keys(fieldErrors).length) throw fail('VALIDATION', Object.values(fieldErrors)[0], { errors: fieldErrors })

    // An external change in the demo ledger, never a real warehouse write.
    if (scenario === 'shortage') { item.available = Math.min(item.available, Math.max(0, Number(draft.quantity) - 1)); item.version += 1 }
    if (scenario === 'conflict') { item.version += 1 }
    if (Number(draft.quantity) > item.available) {
      throw fail('INSUFFICIENT_STOCK', `Tồn mới: ${item.available} ${item.unit}. Vui lòng điều chỉnh số lượng và xác nhận lại.`, { item: clone(item) })
    }
    if (draft.expectedVersion !== item.version) {
      throw fail('STOCK_CONFLICT', `Sổ kho mẫu vừa thay đổi. Tồn mới: ${item.available} ${item.unit}. Vui lòng kiểm tra và xác nhận lại.`, { item: clone(item) })
    }
    const errors = validateDistribution(draft, item, data.beneficiaries)
    if (Object.keys(errors).length) throw fail('VALIDATION', Object.values(errors)[0], { errors })

    const quantity = Number(draft.quantity)
    const before = item.available
    const suffix = String(++sequence).padStart(4, '0')
    const timestamp = new Date().toISOString()
    const voucher = {
      id: `DEMO-PX-${suffix}`, movementId: `DEMO-MOV-${suffix}`, itemId: item.id, itemName: item.name,
      quantity, unit: item.unit, warehouseId: item.warehouseId, beneficiaryId: draft.beneficiaryId,
      actor: clone(actor), timestamp, note: draft.note.trim(), before, after: before - quantity, demo: true,
    }
    const movement = {
      id: voucher.movementId, voucherId: voucher.id, itemId: item.id, warehouseId: item.warehouseId,
      quantity: -quantity, before, after: voucher.after, actorId: actor.id, timestamp, demo: true,
    }
    item.available = voucher.after
    item.version += 1
    vouchers.push(voucher)
    movements.push(movement)
    return clone({ voucher, movement, item })
  }

  return { list, createVoucher }
}

export function createLiveDistributionRepository({
  apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_API_BASE_URL ? import.meta.env.VITE_ADMIN_API_BASE_URL : 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, ''),
  authInstance = null,
} = {}) {
  async function resolveAuth() {
    if (authInstance) return authInstance
    try {
      const mod = await import('../auth/firebase.js')
      return mod.auth
    } catch {
      return null
    }
  }

  async function getToken() {
    const authObj = await resolveAuth()
    const user = authObj?.currentUser
    if (!user) throw fail('UNAUTHENTICATED', 'Vui lòng đăng nhập lại để tiếp tục.')
    return user.getIdToken()
  }

  async function list() {
    const token = await getToken()
    let response
    try {
      response = await fetch(`${apiBase}/v1/admin/distribution/options`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      throw fail('NETWORK_ERROR', 'Không thể kết nối máy chủ phân phối.')
    }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw fail(result.code || 'ERROR', result.message || 'Không thể tải danh sách kho và vật phẩm.')
    }
    return result
  }

  async function createVoucher(draft) {
    const token = await getToken()
    let response
    try {
      response = await fetch(`${apiBase}/v1/admin/distribution`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouseId: draft.warehouseId,
          itemId: draft.itemId,
          beneficiaryId: draft.beneficiaryId,
          quantity: Number(draft.quantity),
          handedOver: draft.handedOver,
          note: draft.note || '',
          expectedVersion: draft.expectedVersion,
        }),
      })
    } catch {
      throw fail('NETWORK_ERROR', 'Không thể kết nối máy chủ phân phối.')
    }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw fail(result.code || 'ERROR', result.message || 'Không thể tạo phiếu xuất.', {
        item: result.details?.item,
        errors: result.details?.errors,
      })
    }
    return result
  }

  return { list, createVoucher }
}
