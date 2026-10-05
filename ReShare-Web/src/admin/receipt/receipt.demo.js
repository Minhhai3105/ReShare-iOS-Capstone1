// Chỉ dùng cho đường dẫn xem thử /admin/receipt-preview khi phát triển.
// Dữ liệu mô phỏng không ghi vào Firebase hoặc tồn kho.
export const demoDonation = Object.freeze({
  id: 'DEMO-REQ-2026-001',
  status: 'approved',
  itemName: 'Áo khoác denim',
  donorName: 'Nguyễn Minh Anh (dữ liệu demo)',
  declaredQuantity: 12,
  declaredUnitName: 'chiếc',
  expectedWarehouseId: 'demo-warehouse-hai-chau',
  expectedWarehouseName: 'Kho Hải Châu',
  declaredConditionName: 'Đã qua sử dụng, còn tốt',
})

export const demoReceiptOptions = Object.freeze({
  warehouses: [
    { id: 'demo-warehouse-hai-chau', name: 'Kho Hải Châu' },
    { id: 'demo-warehouse-son-tra', name: 'Kho Sơn Trà' },
  ],
  units: [
    { id: 'piece', name: 'chiếc' },
    { id: 'kg', name: 'kg' },
    { id: 'bag', name: 'túi' },
  ],
  conditions: [
    { id: 'good', name: 'Còn tốt' },
    { id: 'minor-wear', name: 'Có hao mòn nhẹ' },
    { id: 'damaged', name: 'Hư hỏng cần phân loại' },
  ],
})

export const demoReceiptAdapter = {
  async getDonation() { return { ...demoDonation } },
  async getOptions() { return demoReceiptOptions },
  async createReceipt(payload) {
    return { id: `DEMO-RCP-${payload.donationId}`, simulated: true }
  },
}
