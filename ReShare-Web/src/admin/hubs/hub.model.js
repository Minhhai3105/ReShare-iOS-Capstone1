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

function inUseMessage(campaigns) {
  const titles = (campaigns || []).map((campaign) => `“${campaign.title}”`).join(', ')
  const who = titles ? `chiến dịch đang mở ${titles}` : 'một chiến dịch đang mở'
  return `Không tạm ẩn được: ${who} vẫn dùng điểm này. Đóng chiến dịch hoặc bỏ điểm này khỏi chiến dịch trước.`
}

const STATUS_CONFIRM = Object.freeze({
  inactive: {
    message: 'Tạm ẩn điểm này? App iOS và form chiến dịch sẽ không hiện điểm này nữa. Đơn đã gửi vẫn giữ tên điểm.',
    confirmLabel: 'Xác nhận tạm ẩn',
  },
  active: { message: 'Mở lại điểm này? App iOS sẽ hiện lại điểm này cho donor chọn.', confirmLabel: 'Xác nhận mở lại' },
})

// Nội dung ô xác nhận khi bấm Tạm ẩn / Mở lại. Hub đang được chiến dịch mở dùng thì báo ngay là không
// tạm ẩn được (blocked), khỏi gửi request; backend vẫn kiểm lại trong transaction (409 HUB_IN_USE).
export function statusChangeCheck(hub) {
  const action = nextStatusAction(hub)
  if (!action) return null
  if (action.status === 'inactive' && hub.openCampaigns?.length) {
    return { ...action, blocked: true, message: inUseMessage(hub.openCampaigns), confirmLabel: '' }
  }
  return { ...action, blocked: false, ...STATUS_CONFIRM[action.status] }
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
  if (error?.code === 'HUB_IN_USE') return inUseMessage(error.details?.campaigns)
  if (error?.code === 'UNCERTAIN') return 'Chưa rõ thao tác đã lưu hay chưa. Tải lại trang để kiểm tra trước khi thử lại.'
  if (error?.status === 0) return 'Không kết nối được máy chủ. Thử lại sau giây lát.'
  return ERROR_MESSAGES[error?.message] || 'Không thực hiện được thao tác. Thử lại sau.'
}
