// Logic thuần cho trang Điểm tiếp nhận (không phụ thuộc Vue) để kiểm thử bằng node --test.
// Quy tắc thật nằm ở backend/hubs-api.cjs; ở đây chỉ kiểm sớm để báo lỗi rõ trên form.

export const HUB_STATUS = Object.freeze({
  active: { label: 'Đang hoạt động', tone: 'success' },
  inactive: { label: 'Đang tạm ẩn', tone: 'muted' },
})

const TEXT_LIMITS = Object.freeze({ name: 120, address: 200, openHours: 200 })

export const statusLabel = (status) => HUB_STATUS[status]?.label || status

export function emptyHubForm() {
  return { name: '', address: '', openHours: '', latitude: '', longitude: '', isDemo: true }
}

export function formFromHub(hub) {
  return {
    name: hub.name || '',
    address: hub.address || '',
    openHours: hub.openHours || '',
    latitude: typeof hub.latitude === 'number' ? String(hub.latitude) : '',
    longitude: typeof hub.longitude === 'number' ? String(hub.longitude) : '',
    isDemo: hub.isDemo !== false,
  }
}

// Nhận cả dấu phẩy thập phân kiểu Việt Nam (16,0678) vì hay dán từ nguồn khác vào.
export function parseCoordinate(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

export function validateHubForm(form) {
  const errors = {}
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    const text = String(form[key] || '').trim()
    if (!text) errors[key] = 'Không được để trống.'
    else if (text.length > max) errors[key] = `Tối đa ${max} ký tự.`
  }
  const latitude = parseCoordinate(form.latitude)
  const longitude = parseCoordinate(form.longitude)
  if (latitude === null || latitude < -90 || latitude > 90) errors.latitude = 'Vĩ độ là số từ -90 đến 90 (Đà Nẵng khoảng 16,0).'
  if (longitude === null || longitude < -180 || longitude > 180) errors.longitude = 'Kinh độ là số từ -180 đến 180 (Đà Nẵng khoảng 108,2).'
  return errors
}

// Payload gửi API. Khi sửa, chỉ gửi field đã đổi để không ghi đè sửa đổi của người khác ở field khác.
export function hubPayload(form, original = null) {
  const payload = {
    name: form.name.trim().replace(/\s+/g, ' '),
    address: form.address.trim().replace(/\s+/g, ' '),
    openHours: form.openHours.trim().replace(/\s+/g, ' '),
    latitude: parseCoordinate(form.latitude),
    longitude: parseCoordinate(form.longitude),
    isDemo: Boolean(form.isDemo),
  }
  if (!original) return payload
  const before = hubPayload(formFromHub(original))
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== before[key]))
}

export function mapsUrl(latitude, longitude) {
  const lat = parseCoordinate(latitude)
  const lng = parseCoordinate(longitude)
  if (lat === null || lng === null) return ''
  return `https://www.google.com/maps?q=${lat},${lng}`
}

export function nextStatusAction(hub) {
  if (hub?.status === 'active') return { status: 'inactive', label: 'Tạm ẩn' }
  if (hub?.status === 'inactive') return { status: 'active', label: 'Mở lại' }
  return null
}

// Câu báo lỗi tiếng Việt cho các thông báo backend trả về (backend giữ câu tiếng Anh ổn định).
const ERROR_MESSAGES = Object.freeze({
  'Hub changed; reload first': 'Điểm tiếp nhận vừa được người khác cập nhật. Tải lại rồi thử lại.',
  'Hub is unchanged': 'Chưa có thay đổi nào để lưu.',
  'Hub name already exists': 'Đã có điểm tiếp nhận trùng tên. Đặt tên khác để donor không nhầm.',
  'Invalid status transition': 'Không thể chuyển sang trạng thái này. Tải lại trang.',
  'Hub not found': 'Không tìm thấy điểm tiếp nhận.',
  'System Admin access required': 'Chỉ Quản trị hệ thống mới thêm, sửa hoặc tạm ẩn điểm tiếp nhận.',
  'Staff access required': 'Tài khoản của bạn không có quyền xem trang này.',
  'Staff access changed; reload session': 'Quyền của bạn vừa thay đổi. Đăng nhập lại.',
})

export function hubErrorMessage(error) {
  if (error?.code === 'HUB_IN_USE') {
    const titles = (error.details?.campaigns || []).map((campaign) => `“${campaign.title}”`).join(', ')
    const who = titles ? `chiến dịch đang mở ${titles}` : 'một chiến dịch đang mở'
    return `Không tạm ẩn được: ${who} vẫn dùng điểm này. Đóng chiến dịch hoặc bỏ điểm này khỏi chiến dịch trước.`
  }
  if (error?.code === 'UNCERTAIN') return 'Chưa rõ thao tác đã lưu hay chưa. Tải lại trang để kiểm tra trước khi thử lại.'
  if (error?.status === 0) return 'Không kết nối được máy chủ. Thử lại sau giây lát.'
  return ERROR_MESSAGES[error?.message] || 'Không thực hiện được thao tác. Thử lại sau.'
}
