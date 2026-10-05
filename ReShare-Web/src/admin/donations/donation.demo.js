// DEMO ONLY: no Firestore writes or donation decision endpoint.
// Backend must authorize hubId, validate transitions and atomically compare version.
export const statusLabels = Object.freeze({
  pending: 'Chờ kiểm duyệt', approved: 'Đã duyệt', received: 'Đã tiếp nhận tại trạm',
  in_stock: 'Trong kho Hub', distributed: 'Đã trao tặng', rejected: 'Đã từ chối',
})
export const steps = ['pending', 'approved', 'received', 'in_stock', 'distributed']
const records = new Map()
const clone = (value) => JSON.parse(JSON.stringify(value))
const pause = () => new Promise((resolve) => setTimeout(resolve, 450))
const fail = (code) => Object.assign(new Error(code), { code })
const key = (warehouseId, id) => JSON.stringify([warehouseId, id])

function illustration(label, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="#edf2eb"/><rect x="220" y="130" width="520" height="340" rx="18" fill="${color}"/><path d="M480 130v340M250 185h190M520 185h190M250 220h190M520 220h190" stroke="white" stroke-width="8" opacity=".7"/><text x="480" y="550" text-anchor="middle" font-size="28" font-family="sans-serif" fill="#263d30">${label} · DEMO</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
const photos = ['Mặt trước', 'Trang bên trong', 'Mặt sau'].map((label, i) => ({
  url: illustration(label, ['#497658', '#aa8354', '#557986'][i]), alt: `Bộ sách giáo khoa — ${label.toLowerCase()} (ảnh minh họa demo)`,
}))

export async function loadDemoDonation(warehouseId, id, scenario = 'normal') {
  await pause()
  if (scenario === 'network') throw fail('NETWORK')
  if (id !== 'demo-001' || scenario === 'missing') throw fail('NOT_FOUND')
  const recordKey = key(warehouseId, id)
  if (!records.has(recordKey)) records.set(recordKey, {
    id, hubId: warehouseId, title: 'Bộ sách giáo khoa lớp 11',
    description: '12 cuốn sách, còn đủ trang. Một số bìa có dấu sử dụng; đã phân loại và đóng gói.',
    category: 'Sách & học tập', condition: 'Đã sử dụng — còn tốt', quantity: 12,
    donor: { name: 'Nguyễn An (demo)', email: 'donor@example.test' },
    deliveryMethod: 'Người tặng mang đến trạm', createdAt: '2026-10-01T02:30:00Z',
    status: 'pending', reviewState: null, version: 1, statusNote: '', internalNote: '',
    donorConfirmation: 'Donor xác nhận khai báo tình trạng và số lượng là chính xác (demo).',
    aiPrediction: { label: 'Sách giáo khoa — tình trạng tốt (kết quả mock)', confidence: 92 },
    images: photos, history: [{ at: '2026-10-01T02:30:00Z', label: 'Người tặng gửi donation (demo)' }],
  })
  const record = clone(records.get(recordKey))
  if (steps.includes(scenario) || scenario === 'rejected') record.status = scenario
  if (scenario === 'rejected') record.statusNote = 'Sách bị thiếu trang, chưa đạt điều kiện tiếp nhận (demo).'
  if (scenario === 'information') record.reviewState = 'needs_information'
  if (scenario === 'no-images') record.images = []
  if (scenario === 'no-ai') { record.aiPrediction = null; record.donorConfirmation = null }
  if (scenario === 'wrong-warehouse') record.hubId = `${warehouseId}-other`
  return record
}

export async function decideDemoDonation({ donation, action, publicMessage, internalNote, actor, scenario, authorize }) {
  await pause()
  if (!authorize(donation.hubId)) throw fail('FORBIDDEN')
  if (scenario === 'network-submit') throw fail('NETWORK')
  const record = records.get(key(donation.hubId, donation.id))
  if (!record) throw fail('NOT_FOUND')
  if (scenario === 'conflict') {
    record.status = 'approved'
    record.version += 1
    record.history.push({ at: new Date().toISOString(), label: 'Nhân sự khác đã duyệt (xung đột demo)' })
    throw fail('CONFLICT')
  }
  if (record.version !== donation.version || record.status !== 'pending' || record.reviewState === 'needs_information') throw fail('CONFLICT')
  if (donation.status !== 'pending' || donation.reviewState === 'needs_information') throw fail('CONFLICT')
  if (!['approve', 'reject', 'information'].includes(action)) throw fail('VALIDATION')
  if ((action !== 'approve' && !publicMessage.trim()) || publicMessage.length > 1000 || internalNote.length > 2000) throw fail('VALIDATION')
  const from = record.status
  record.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending'
  record.reviewState = action === 'information' ? 'needs_information' : null
  record.statusNote = publicMessage.trim()
  record.internalNote = internalNote.trim() // Staff only; never use as donor-facing statusNote.
  record.version += 1
  record.history.push({ at: new Date().toISOString(), actor, from, to: record.status,
    version: record.version, previousVersion: donation.version, action,
    publicMessage: record.statusNote,
    internalNote: record.internalNote, // Separate staff-only snapshot for this decision.
    reviewState: record.reviewState,
    label: `${action === 'approve' ? 'Duyệt' : action === 'reject' ? 'Từ chối' : 'Yêu cầu bổ sung'} (demo)` })
  return clone(record)
}
