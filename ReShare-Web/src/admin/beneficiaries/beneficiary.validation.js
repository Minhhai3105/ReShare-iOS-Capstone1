export function validateBeneficiaryForm({ name, warehouseId }, allowedWarehouseIds) {
  const errors = {}
  const normalizedName = String(name || '').trim()

  if (!normalizedName) errors.name = 'Tên hiển thị là bắt buộc.'
  if (!allowedWarehouseIds.includes(warehouseId)) {
    errors.warehouseId = 'Chưa có kho hợp lệ trong phạm vi được cấp.'
  }

  return errors
}
