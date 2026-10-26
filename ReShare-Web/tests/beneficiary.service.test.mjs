import test, { beforeEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  BENEFICIARY_ERROR,
  MOCK_BENEFICIARIES,
  classifyBeneficiaryError,
  fetchBeneficiaries,
  fetchBeneficiary,
  resolveBeneficiaryAccess,
  saveBeneficiary,
} from '../src/admin/beneficiaries/beneficiary.service.js'
import { validateBeneficiaryForm } from '../src/admin/beneficiaries/beneficiary.validation.js'

const systemAdmin = { active: true, role: 'system_admin', warehouseIds: [] }
const warehouseAdmin = { active: true, role: 'warehouse_admin', warehouseIds: ['wh-hai-chau'] }
const inactiveAssignment = { ...warehouseAdmin, active: false }
const donorAssignment = { active: true, role: 'donor', warehouseIds: ['wh-hai-chau'] }

describe('beneficiary mock service and form validation', { concurrency: false }, () => {
  beforeEach(() => {
    MOCK_BENEFICIARIES.length = 0
  })

  test('mock service starts without fabricated beneficiary profiles', () => {
    assert.deepEqual(fetchBeneficiaries(systemAdmin), [])
  })

  test('beneficiary access honors existing active staff roles and warehouse assignments', () => {
    assert.equal(resolveBeneficiaryAccess(systemAdmin).isAllWarehouses, true)
    assert.equal(resolveBeneficiaryAccess(inactiveAssignment), null)
    assert.throws(() => fetchBeneficiary(inactiveAssignment, 'missing-id'), { code: BENEFICIARY_ERROR.forbidden })
    assert.equal(resolveBeneficiaryAccess(donorAssignment), null)
    assert.throws(() => fetchBeneficiaries(donorAssignment), { code: BENEFICIARY_ERROR.forbidden })
    assert.equal(fetchBeneficiary(warehouseAdmin, 'missing-id'), null)
  })

  test('beneficiary errors distinguish forbidden from unavailable', () => {
    assert.equal(classifyBeneficiaryError({ code: BENEFICIARY_ERROR.forbidden }), BENEFICIARY_ERROR.forbidden)
    assert.equal(classifyBeneficiaryError({ status: 403 }), BENEFICIARY_ERROR.forbidden)
    assert.equal(classifyBeneficiaryError({ status: 'NETWORK_ERROR' }), BENEFICIARY_ERROR.unavailable)
    assert.equal(classifyBeneficiaryError(new Error('network unavailable')), BENEFICIARY_ERROR.unavailable)
  })

  test('beneficiary mock reads stay within the assigned warehouse', () => {
    saveBeneficiary(systemAdmin, { id: 'B-MOCK-SCOPE-DN', name: 'Hồ sơ Đà Nẵng', warehouseId: 'wh-da-nang' })
    saveBeneficiary(systemAdmin, { id: 'B-MOCK-SCOPE-HC', name: 'Hồ sơ Hải Châu', warehouseId: 'wh-hai-chau' })

    assert.deepEqual(fetchBeneficiaries(warehouseAdmin).map(({ id }) => id), ['B-MOCK-SCOPE-HC'])
    assert.throws(() => fetchBeneficiary(warehouseAdmin, 'B-MOCK-SCOPE-DN'), { code: BENEFICIARY_ERROR.forbidden })
  })

  test('beneficiary search matches display name and profile ID within the allowed scope', () => {
    saveBeneficiary(systemAdmin, { id: 'B-MOCK-SEARCH-01', name: 'Nguyễn An', warehouseId: 'wh-hai-chau' })
    saveBeneficiary(systemAdmin, { id: 'B-MOCK-SEARCH-02', name: 'Trần Bình', warehouseId: 'wh-hai-chau' })
    saveBeneficiary(systemAdmin, { id: 'B-MOCK-SEARCH-03', name: 'Nguyễn Chi', warehouseId: 'wh-da-nang' })

    assert.deepEqual(fetchBeneficiaries(warehouseAdmin, { search: 'nguyễn' }).map(({ id }) => id), [
      'B-MOCK-SEARCH-01',
    ])
    assert.deepEqual(fetchBeneficiaries(warehouseAdmin, { search: 'search-02' }).map(({ id }) => id), [
      'B-MOCK-SEARCH-02',
    ])
    assert.deepEqual(fetchBeneficiaries(warehouseAdmin, { search: 'search-03' }), [])
    assert.deepEqual(fetchBeneficiaries(warehouseAdmin, { search: 'SEARCH-01' }).map(({ id }) => id), [
      'B-MOCK-SEARCH-01',
    ])
  })

  test('mock saves require an authorized warehouse and do not permit moving an existing profile', () => {
    const before = fetchBeneficiaries(systemAdmin).length
    assert.throws(
      () => saveBeneficiary(warehouseAdmin, { id: 'B-MOCK-OUTSIDE', warehouseId: 'wh-da-nang' }),
      { code: BENEFICIARY_ERROR.forbidden },
    )
    saveBeneficiary(systemAdmin, { id: 'B-MOCK-SCOPE-HC', name: 'Original', warehouseId: 'wh-hai-chau' })
    assert.throws(
      () => saveBeneficiary(systemAdmin, { id: 'B-MOCK-SCOPE-HC', name: 'Move attempt', warehouseId: 'wh-da-nang' }),
      { code: BENEFICIARY_ERROR.forbidden },
    )
    assert.equal(fetchBeneficiaries(systemAdmin).length, before + 1)
  })

  test('mock creation and update are reflected by subsequent reads without support data', () => {
    const created = saveBeneficiary(warehouseAdmin, {
      id: 'B-MOCK-EDIT',
      name: 'Hồ sơ thử nghiệm',
      phone: '0987654321',
      warehouseId: 'wh-hai-chau',
      notes: 'Chỉ là dữ liệu xem thử.',
      supportHistory: [{ distributionId: 'not-accepted' }],
      supportCount: 99,
      lastSupportAmount: '999₫',
      lastSupportDate: '2026-01-01',
    })

    assert.equal(fetchBeneficiary(warehouseAdmin, created.id).name, 'Hồ sơ thử nghiệm')
    assert.equal(Object.hasOwn(created, 'supportHistory'), false)
    assert.equal(Object.hasOwn(created, 'supportCount'), false)
    assert.equal(Object.hasOwn(created, 'lastSupportAmount'), false)
    assert.equal(Object.hasOwn(created, 'lastSupportDate'), false)

    saveBeneficiary(warehouseAdmin, { ...created, name: 'Đã cập nhật' })
    assert.equal(fetchBeneficiary(warehouseAdmin, created.id).name, 'Đã cập nhật')
  })

  test('beneficiary validation requires a display name and an assigned warehouse', () => {
    const allowedWarehouseIds = ['wh-hai-chau']
    assert.deepEqual(
      validateBeneficiaryForm({ name: '', phone: '', notes: '', warehouseId: 'wh-hai-chau' }, allowedWarehouseIds),
      { name: 'Tên hiển thị là bắt buộc.' },
    )
    assert.deepEqual(
      validateBeneficiaryForm({
        name: '  Lan  ',
        phone: '+1 415 555 0123',
        notes: 'Ghi chú'.repeat(100),
        warehouseId: 'wh-hai-chau',
      }, allowedWarehouseIds),
      {},
    )
    assert.deepEqual(
      validateBeneficiaryForm({ name: 'Lan', warehouseId: 'wh-other' }, allowedWarehouseIds),
      { warehouseId: 'Chưa có kho hợp lệ trong phạm vi được cấp.' },
    )
  })
})
