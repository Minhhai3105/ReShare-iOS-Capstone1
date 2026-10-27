// Chỉ dùng cho đường dẫn xem thử /admin/stock-in-preview khi phát triển.
// Dữ liệu mô phỏng không ghi vào Firebase hoặc tồn kho.
export const demoDonation = Object.freeze({
  id: 'DEMO-REQ-2026-001',
  status: 'received',
  itemName: 'Áo khoác denim',
  expectedWarehouseId: 'demo-warehouse-hai-chau',
  expectedWarehouseName: 'Kho Hải Châu',
})

export const demoReceipt = Object.freeze({
  id: 'rcp_DEMO-REQ-2026-001',
  warehouseId: 'demo-warehouse-hai-chau',
  quantity: 10,
  unitId: 'piece',
  unitName: 'chiếc',
  conditionName: 'Có hao mòn nhẹ',
  actorName: 'Nhân sự xem thử (demo)',
  receivedAt: '2026-01-15T08:30:00.000Z',
})

export const demoStockInAdapter = {
  async getDonation() { return { ...demoDonation } },
  async getReceipt() { return { ...demoReceipt } },
  async createStockIn(payload) {
    return { id: `DEMO-PNK-${payload.donationId}`, simulated: true }
  },
}
