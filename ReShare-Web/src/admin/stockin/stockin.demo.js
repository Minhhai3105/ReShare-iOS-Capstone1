// Chỉ dùng cho đường dẫn xem thử /admin/stock-in-preview khi phát triển.
// Dữ liệu mô phỏng không ghi vào Firebase hoặc tồn kho.
export const demoDonation = Object.freeze({
  id: 'DEMO-REQ-2026-001',
  status: 'received',
  itemName: 'Áo khoác denim',
  declaredQuantity: 5,
  declaredUnitName: 'chiếc',
  expectedWarehouseId: 'demo-warehouse-hai-chau',
  expectedWarehouseName: 'Kho Hải Châu',
  stockEntryId: '',
})

export const demoReceipt = Object.freeze({
  id: 'rcp_DEMO-REQ-2026-001',
  warehouseId: 'demo-warehouse-hai-chau',
  quantity: 3,
  unitId: 'piece',
  unitName: 'chiếc',
  conditionName: 'Có hao mòn nhẹ',
  actorName: 'Nhân sự xem thử (demo)',
  receivedAt: '2026-01-15T08:30:00.000Z',
  stockEntryId: '',
})

export const demoStockEntry = Object.freeze({
  id: 'DEMO-PNK-2601-00001',
  status: 'confirmed',
  warehouseId: 'demo-warehouse-hai-chau',
  warehouseName: 'Kho Hải Châu',
  donationId: 'DEMO-REQ-2026-001',
  receiptId: 'rcp_DEMO-REQ-2026-001',
  note: 'Demo: đóng gói lại bằng túi zip.',
  createdBy: 'Nhân sự xem thử (demo)',
  createdAt: '2026-01-15T09:00:00.000Z',
  confirmedBy: 'Nhân sự xem thử (demo)',
  confirmedAt: '2026-01-15T09:00:00.000Z',
  items: [{ id: 'demo-item-1', name: 'Áo khoác denim', quantity: 3, unitName: 'chiếc', conditionName: 'Có hao mòn nhẹ', location: 'Kệ A1-02' }],
  movement: {
    id: 'DEMO-MV-2601-00001',
    typeName: 'Nhập kho',
    quantity: 3,
    unitName: 'chiếc',
    warehouseName: 'Kho Hải Châu',
    receiptId: 'rcp_DEMO-REQ-2026-001',
    actor: 'Nhân sự xem thử (demo)',
    createdAt: '2026-01-15T09:00:00.000Z',
  },
})

export const demoStockInAdapter = {
  async getStockEntry() {
    return { ...demoStockEntry, items: demoStockEntry.items.map((item) => ({ ...item })), movement: { ...demoStockEntry.movement } }
  },
  async getDonation() { return { ...demoDonation } },
  async getReceipt() { return { ...demoReceipt } },
  async createStockIn(payload) {
    return { id: `DEMO-PNK-${payload.donationId}`, simulated: true, replayed: false }
  },
}
