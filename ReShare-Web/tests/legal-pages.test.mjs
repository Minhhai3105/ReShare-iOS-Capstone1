import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { LEGAL_CONTACT_EMAIL, LEGAL_LINKS, PRIVACY_POLICY_PATH } from '../src/landing/legal.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Chính sách quyền riêng tư có đường dẫn cố định mà app iOS đang trỏ tới', () => {
  assert.equal(PRIVACY_POLICY_PATH, '/chinh-sach-quyen-rieng-tu')
  const swiftConstants = read('../ReShare/ReShare/Core/Utilities/Constants.swift')
  assert.ok(swiftConstants.includes(`https://reshare.pages.dev${PRIVACY_POLICY_PATH}`), 'iOS phải mở đúng URL này')
  assert.ok(swiftConstants.includes(LEGAL_CONTACT_EMAIL), 'email hỗ trợ trong app phải trùng email trên trang')
  const router = read('src/router/index.js')
  assert.match(router, /path: PRIVACY_POLICY_PATH/)
  assert.match(router, /PrivacyPolicyPage\.vue/)
  assert.ok(LEGAL_LINKS.some((link) => link.to === PRIVACY_POLICY_PATH))
})

test('Trang nêu đủ các loại dữ liệu app thu thập, bên thứ ba và cách xoá', () => {
  const page = read('src/landing/PrivacyPolicyPage.vue')
  for (const phrase of ['họ tên', 'email', 'số điện thoại', 'mã người dùng', 'ảnh', 'địa chỉ nhận đồ', 'chat',
    'Google Firebase', 'Cloudinary', 'Render', 'Cloudflare Pages', 'Xoá tài khoản', 'ẩn danh', 'dưới 16 tuổi',
    'không</strong> thu thập vị trí GPS']) {
    assert.ok(page.includes(phrase), `thiếu "${phrase}"`)
  }
  assert.match(page, /LEGAL_CONTACT_EMAIL/)
})

test('Footer landing có link tới chính sách và email liên hệ thật thay cho chữ "sẽ được cập nhật"', () => {
  const footer = read('src/landing/components/LandingFooter.vue')
  assert.match(footer, /:to="PRIVACY_POLICY_PATH"/)
  assert.match(footer, /mailto:\$\{LEGAL_CONTACT_EMAIL\}/)
  assert.ok(!footer.includes('Kênh liên hệ sẽ được cập nhật'))
})

test('Chính sách nói đúng quyền xem khi có báo cáo vi phạm, loại ảnh công khai và điều kiện xoá tài khoản', () => {
  const page = read('src/landing/PrivacyPolicyPage.vue')
  // Quản trị hệ thống xem được tin nhắn bị báo cáo qua trang Báo cáo vi phạm: phải nói rõ, không ghi "chỉ hai người".
  assert.match(page, /Ngoại lệ duy nhất: khi một tin nhắn bị báo cáo vi phạm/)
  // Ảnh Kho đồ 0đ là delivery 'upload' (công khai), ảnh đơn quyên góp là 'authenticated' (image-api.cjs).
  assert.match(page, /Ảnh bài Kho đồ 0đ là ảnh công khai/)
  assert.match(page, /Ảnh đơn quyên góp lưu ở chế độ cần cấp quyền/)
  assert.match(page, /bàn giao dở/)
})
