// Temporary UI fixtures. Replace this provider with the Firebase adapter when
// the Firebase web setup and staff data contract are part of the task. Keep
// fixture records here rather than embedding them in Vue components.
const sampleStaff = [
  { id: 'RS-0001', name: 'Nguyễn Văn An', email: 'an.nguyen@reshare.vn', role: 'system_admin', warehouses: [], status: 'active' },
  { id: 'RS-0018', name: 'Trần Minh Anh', email: 'anh.tran@reshare.vn', role: 'warehouse_admin', warehouses: ['Kho Thủ Đức', 'Kho Bình Thạnh'], status: 'active' },
  { id: 'RS-0024', name: 'Lê Hoàng Nam', email: 'nam.le@reshare.vn', role: 'warehouse_admin', warehouses: ['Kho Cầu Giấy'], status: 'inactive' },
  { id: 'RS-0032', name: 'Phạm Thu Hà', email: 'ha.pham@reshare.vn', role: 'warehouse_admin', warehouses: ['Kho Hải Châu'], status: 'active' },
]

export const staffRepository = {
  async list() {
    return sampleStaff
  },
}
