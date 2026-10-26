import { ADMIN_ROLES, USER_ROLE } from '../auth/auth.constants.js'

export const BENEFICIARY_ERROR = Object.freeze({
  forbidden: 'forbidden',
  unavailable: 'unavailable',
})

export const MOCK_BENEFICIARIES = []

export function classifyBeneficiaryError(error) {
  return error?.code === BENEFICIARY_ERROR.forbidden || error?.status === 403
    ? BENEFICIARY_ERROR.forbidden
    : BENEFICIARY_ERROR.unavailable
}

export function resolveBeneficiaryAccess(assignment) {
  if (!assignment || assignment.active !== true || !ADMIN_ROLES.includes(assignment.role)) return null
  return {
    role: assignment.role,
    warehouseIds: Array.isArray(assignment.warehouseIds) ? assignment.warehouseIds : [],
    isAllWarehouses: assignment.role === USER_ROLE.systemAdmin,
  }
}

export function canAccessBeneficiary(assignment, beneficiaryWarehouseId) {
  const access = resolveBeneficiaryAccess(assignment)
  if (!access) return false
  if (access.isAllWarehouses) return true
  return Boolean(beneficiaryWarehouseId && access.warehouseIds.includes(beneficiaryWarehouseId))
}

export function fetchBeneficiaries(assignment, query = {}) {
  const resolvedAccess = resolveBeneficiaryAccess(assignment)
  if (!resolvedAccess) throw Object.assign(new Error(BENEFICIARY_ERROR.forbidden), { code: BENEFICIARY_ERROR.forbidden })

  const filtered = MOCK_BENEFICIARIES.filter((beneficiary) => {
    const queryText = String(query.search || '').trim().toLowerCase()
    const matchesWarehouse = !query.warehouseId || beneficiary.warehouseId === query.warehouseId
    const matchesText = !queryText ||
      beneficiary.name.toLowerCase().includes(queryText) ||
      beneficiary.id.toLowerCase().includes(queryText)
    const inScope = resolvedAccess.isAllWarehouses || resolvedAccess.warehouseIds.includes(beneficiary.warehouseId)
    return inScope && matchesWarehouse && matchesText
  })

  return filtered.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
}

export function fetchBeneficiary(assignment, id) {
  if (!resolveBeneficiaryAccess(assignment)) {
    throw Object.assign(new Error(BENEFICIARY_ERROR.forbidden), { code: BENEFICIARY_ERROR.forbidden })
  }

  const beneficiary = MOCK_BENEFICIARIES.find((item) => item.id === id)
  if (!beneficiary) return null
  if (!canAccessBeneficiary(assignment, beneficiary.warehouseId)) {
    throw Object.assign(new Error(BENEFICIARY_ERROR.forbidden), { code: BENEFICIARY_ERROR.forbidden })
  }
  return beneficiary
}

export function saveBeneficiary(assignment, nextBeneficiary) {
  const index = MOCK_BENEFICIARIES.findIndex((beneficiary) => beneficiary.id === nextBeneficiary.id)
  const existing = index >= 0 ? MOCK_BENEFICIARIES[index] : null
  if (
    !resolveBeneficiaryAccess(assignment) ||
    (existing && !canAccessBeneficiary(assignment, existing.warehouseId)) ||
    typeof nextBeneficiary.warehouseId !== 'string' ||
    !nextBeneficiary.warehouseId.trim() ||
    !canAccessBeneficiary(assignment, nextBeneficiary.warehouseId) ||
    (existing && existing.warehouseId !== nextBeneficiary.warehouseId)
  ) {
    throw Object.assign(new Error(BENEFICIARY_ERROR.forbidden), { code: BENEFICIARY_ERROR.forbidden })
  }

  const profile = Object.fromEntries(
    Object.entries(nextBeneficiary).filter(([key]) =>
      !['supportHistory', 'supportCount', 'lastSupportAmount', 'lastSupportDate'].includes(key)),
  )

  if (index >= 0) {
    MOCK_BENEFICIARIES[index] = { ...MOCK_BENEFICIARIES[index], ...profile }
    return MOCK_BENEFICIARIES[index]
  }
  MOCK_BENEFICIARIES.unshift(profile)
  return profile
}
