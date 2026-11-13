import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  ADMIN_PAGES,
  ADMIN_SECTIONS,
  canGoBackInHistory,
  pageFor,
  parentLocation,
  visibleSections,
} from '../src/admin/layout/admin.navigation.js'

test('System Admin thấy đủ 10 mục, Warehouse Admin không thấy Chiến dịch, Nhân sự, Liên hệ và Báo cáo vi phạm', () => {
  assert.equal(visibleSections('system_admin').length, 10)
  const warehouseKeys = visibleSections('warehouse_admin').map((section) => section.key)
  assert.deepEqual(warehouseKeys, ['home', 'donations', 'inventory', 'beneficiaries', 'distribution', 'reports'])
  assert.equal(visibleSections('').some((section) => section.key === 'staff'), false)
})

test('Mỗi mục trên sidebar trỏ tới một trang có khai báo và là gốc của chính mục đó', () => {
  for (const section of ADMIN_SECTIONS) {
    const page = pageFor(section.to.name)
    assert.ok(page, `thiếu khai báo trang cho ${section.to.name}`)
    assert.equal(page.section, section.key)
  }
})

test('Mọi route con trong khung quản trị đều có tiêu đề, mục và trang cha (trừ Tổng quan)', () => {
  const source = readFileSync(new URL('../src/admin/admin.routes.js', import.meta.url), 'utf8')
  const block = source.slice(source.indexOf('const adminPageRoutes = ['), source.indexOf('// Route xem thử'))
  const constants = readFileSync(new URL('../src/admin/auth/auth.constants.js', import.meta.url), 'utf8')
  const names = [...block.matchAll(/name: (ADMIN_ROUTE\.(\w+)|'([^']+)')/g)].map(([, , key, literal]) => {
    if (literal) return literal
    return constants.match(new RegExp(`\\b${key}: '([^']+)'`))[1]
  })
  assert.equal(names.length, 22)
  for (const name of names) {
    const page = pageFor(name)
    assert.ok(page?.title && page.section, `thiếu khai báo cho ${name}`)
    if (name !== 'admin-home') assert.ok(page.parent, `${name} thiếu trang cha`)
  }
  assert.deepEqual(Object.keys(ADMIN_PAGES).sort(), [...names].sort())
})

test('Trang cha dùng đúng tham số của route hiện tại', () => {
  assert.deepEqual(
    parentLocation({ name: 'admin-donation-receipt', params: { donationId: 'd1' } }),
    { name: 'admin-donation-detail', params: { donationId: 'd1' } },
  )
  assert.deepEqual(
    parentLocation({ name: 'admin-beneficiary-edit', params: { beneficiaryId: 'b9' } }),
    { name: 'admin-beneficiary-detail', params: { beneficiaryId: 'b9' } },
  )
  assert.deepEqual(parentLocation({ name: 'admin-reports', params: {} }), { name: 'admin-home' })
  assert.equal(parentLocation({ name: 'admin-home', params: {} }), null)
  assert.equal(parentLocation({ name: 'khong-ton-tai', params: {} }), null)
})

test('Chỉ quay lại theo lịch sử khi trang trước nằm trong khu quản trị và không phải trang đăng nhập', () => {
  assert.equal(canGoBackInHistory({ back: '/admin/donations' }), true)
  assert.equal(canGoBackInHistory({ back: '/admin/login?redirect=%2Fadmin' }), false)
  assert.equal(canGoBackInHistory({ back: '/' }), false)
  assert.equal(canGoBackInHistory({ back: null }), false)
  assert.equal(canGoBackInHistory(null), false)
})
