// Logic thuần cho trang Chiến dịch (không phụ thuộc Vue) để kiểm thử bằng node --test.
// Quy tắc nghiệp vụ thật nằm ở backend/campaigns-api.cjs; ở đây chỉ kiểm sớm để báo lỗi rõ trên form.
import { unitLabel } from '../shared/units.js'

export const CAMPAIGN_CATEGORIES = Object.freeze([
  { id: 'clothing', label: 'Quần áo' },
  { id: 'books', label: 'Sách vở' },
  { id: 'household', label: 'Đồ gia dụng' },
])

export const CAMPAIGN_UNITS = Object.freeze(['piece', 'kg', 'bag', 'box', 'set'])

export const CAMPAIGN_STATUS = Object.freeze({
  draft: { label: 'Bản nháp', tone: 'muted' },
  active: { label: 'Đang tiếp nhận', tone: 'success' },
  closed: { label: 'Đã đóng', tone: 'neutral' },
})

const TEXT_LIMITS = Object.freeze({ title: 120, summary: 200, description: 2000, organizer: 120 })
const MAX_GUIDELINES = 8

export const categoryLabel = (id) => CAMPAIGN_CATEGORIES.find((category) => category.id === id)?.label || id
export const statusLabel = (status) => CAMPAIGN_STATUS[status]?.label || status

export function emptyCampaignForm() {
  return {
    title: '', summary: '', description: '', organizer: '', category: 'clothing', unitId: 'piece',
    targetQuantity: '', urgent: false, endDate: '', hubIds: [], guidelinesText: '',
  }
}

export function formFromCampaign(campaign) {
  return {
    title: campaign.title || '',
    summary: campaign.summary || '',
    description: campaign.description || '',
    organizer: campaign.organizer || '',
    category: campaign.category || 'clothing',
    unitId: campaign.unitId || 'piece',
    targetQuantity: campaign.targetQuantity ? String(campaign.targetQuantity) : '',
    urgent: campaign.urgent === true,
    endDate: campaign.endDateLocal || '',
    hubIds: (campaign.hubs || []).map((hub) => hub.id),
    guidelinesText: (campaign.guidelines || []).join('\n'),
  }
}

export function guidelinesFrom(text) {
  return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean)
}

// Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (khớp cách backend hiểu endDate).
export function todayInVietnam(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now)
}

export function validateCampaignForm(form, { now = new Date() } = {}) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Nhập tên chiến dịch.'
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (String(form[key] || '').trim().length > max) errors[key] = `Tối đa ${max} ký tự.`
  }
  if (!form.organizer.trim()) errors.organizer = 'Nhập đơn vị thụ hưởng hoặc phát động.'
  if (!CAMPAIGN_CATEGORIES.some((category) => category.id === form.category)) errors.category = 'Chọn danh mục.'
  if (!CAMPAIGN_UNITS.includes(form.unitId)) errors.unitId = 'Chọn đơn vị.'
  const target = Number(form.targetQuantity)
  const decimals = String(form.targetQuantity).split('.')[1]?.length || 0
  if (!String(form.targetQuantity).trim() || !Number.isFinite(target) || target <= 0) {
    errors.targetQuantity = 'Mục tiêu phải là số lớn hơn 0.'
  } else if (form.unitId === 'kg' ? decimals > 3 : !Number.isInteger(target)) {
    errors.targetQuantity = form.unitId === 'kg' ? 'Tối đa 3 chữ số thập phân.' : 'Đơn vị này chỉ nhận số nguyên.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.endDate)) errors.endDate = 'Chọn ngày kết thúc.'
  else if (form.endDate < todayInVietnam(now)) errors.endDate = 'Ngày kết thúc phải từ hôm nay trở đi.'
  if (!form.hubIds.length) errors.hubIds = 'Chọn ít nhất một điểm tiếp nhận.'
  if (form.hubIds.length > 10) errors.hubIds = 'Tối đa 10 điểm tiếp nhận.'
  const guidelines = guidelinesFrom(form.guidelinesText)
  if (guidelines.length > MAX_GUIDELINES) errors.guidelinesText = `Tối đa ${MAX_GUIDELINES} dòng hướng dẫn.`
  else if (guidelines.some((line) => line.length > 200)) errors.guidelinesText = 'Mỗi dòng tối đa 200 ký tự.'
  return errors
}

// Payload gửi API. Khi sửa, chỉ gửi field đã đổi và bỏ danh mục/đơn vị nếu chiến dịch đã công khai.
export function campaignPayload(form, original = null) {
  const payload = {
    title: form.title.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    organizer: form.organizer.trim(),
    category: form.category,
    unitId: form.unitId,
    targetQuantity: Number(form.targetQuantity),
    urgent: Boolean(form.urgent),
    endDate: form.endDate,
    hubIds: [...form.hubIds],
    guidelines: guidelinesFrom(form.guidelinesText),
  }
  if (!original) return payload
  const before = campaignPayload(formFromCampaign(original))
  const changed = Object.fromEntries(Object.entries(payload)
    .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])))
  if (original.status !== 'draft') {
    delete changed.category
    delete changed.unitId
  }
  return changed
}

export function campaignProgress(campaign) {
  const target = Number(campaign?.targetQuantity) || 0
  const received = Number(campaign?.receivedQuantity) || 0
  const percent = target > 0 ? Math.min(100, Math.floor((received / target) * 100)) : 0
  const unit = unitLabel(campaign?.unitId)
  return {
    percent,
    text: `${formatNumber(received)} / ${formatNumber(target)} ${unit}`,
    donations: Number.isInteger(campaign?.receivedDonationCount) ? campaign.receivedDonationCount : 0,
  }
}

export function nextStatusActions(campaign) {
  if (campaign?.status === 'draft') return [{ status: 'active', label: 'Mở tiếp nhận' }]
  if (campaign?.status === 'active') return [{ status: 'closed', label: 'Đóng chiến dịch' }]
  if (campaign?.status === 'closed') return [{ status: 'active', label: 'Mở lại' }]
  return []
}

// Câu báo lỗi tiếng Việt cho các thông báo backend trả về (backend giữ câu tiếng Anh ổn định).
const ERROR_MESSAGES = Object.freeze({
  'Campaign changed; reload first': 'Chiến dịch vừa được người khác cập nhật. Tải lại rồi thử lại.',
  'Closed campaigns cannot be edited': 'Chiến dịch đã đóng, không sửa được nữa.',
  'Campaign is unchanged': 'Chưa có thay đổi nào để lưu.',
  'Category and unit can only change while the campaign is a draft': 'Chỉ đổi danh mục và đơn vị khi chiến dịch còn là bản nháp.',
  'Campaign end date has passed': 'Đã quá ngày kết thúc. Gia hạn ngày kết thúc trước khi mở lại.',
  'Campaign end date must be in the future': 'Ngày kết thúc phải sau thời điểm hiện tại.',
  'Hub is inactive or missing': 'Có điểm tiếp nhận đã ngừng hoạt động. Chọn lại điểm tiếp nhận.',
  'Invalid status transition': 'Không thể chuyển sang trạng thái này.',
  'targetQuantity does not match unit rules': 'Mục tiêu không hợp lệ với đơn vị đã chọn.',
  'System Admin access required': 'Chỉ Quản trị hệ thống mới quản lý được chiến dịch.',
  'Staff access changed; reload session': 'Quyền của bạn vừa thay đổi. Đăng nhập lại.',
})

export function campaignErrorMessage(error) {
  if (error?.code === 'UNCERTAIN') return 'Chưa rõ thao tác đã lưu hay chưa. Tải lại trang để kiểm tra trước khi thử lại.'
  if (error?.status === 0) return 'Không kết nối được máy chủ. Thử lại sau giây lát.'
  return ERROR_MESSAGES[error?.message] || 'Không thực hiện được thao tác. Thử lại sau.'
}

export function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(Number(value) || 0)
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
}
