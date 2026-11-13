// Đường dẫn và thông tin liên hệ dùng chung cho các trang pháp lý.
// App iOS (Constants.Links) trỏ cứng vào các path này, đổi ở đây thì phải đổi cả app.
export const LEGAL_CONTACT_EMAIL = 'haicao206@gmail.com'

export const PRIVACY_POLICY_PATH = '/chinh-sach-quyen-rieng-tu'

export const LEGAL_LINKS = Object.freeze([
  { label: 'Chính sách quyền riêng tư', to: PRIVACY_POLICY_PATH },
])
