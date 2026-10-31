const allowedNeeds = new Set(['clothing', 'books', 'household'])

export function validateBeneficiaryForm({ name, warehouseId, needs, phone, notes }, allowedWarehouseIds) {
  const errors = {}
  const normalizedName = String(name || '').trim()

  if (!normalizedName || normalizedName.length > 120) errors.name = 'Tên hiển thị phải có 1–120 ký tự.'
  if (!allowedWarehouseIds.includes(warehouseId)) {
    errors.warehouseId = 'Chưa có kho hợp lệ trong phạm vi được cấp.'
  }
  if (!Array.isArray(needs) || needs.length < 1 || needs.length > 3 ||
      new Set(needs).size !== needs.length || needs.some(need => !allowedNeeds.has(need))) {
    errors.needs = 'Chọn ít nhất một nhu cầu hỗ trợ.'
  }
  const contact = String(phone || '').replace(/[\s().-]/g, '')
  if (contact && !/^\+?\d{9,15}$/.test(contact)) errors.phone = 'Số liên hệ phải có 9–15 chữ số.'
  if (String(notes || '').trim().length > 500) errors.notes = 'Ghi chú tối đa 500 ký tự.'

  return errors
}
