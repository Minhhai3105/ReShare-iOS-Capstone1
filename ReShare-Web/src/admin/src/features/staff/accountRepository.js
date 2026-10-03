// Temporary fixtures for the account lookup and warehouse selector on screen V.
// Replace this adapter with Firebase-backed queries when that integration is in scope.
const sampleAccounts = [
  { id: 'USR-0104', name: 'Nguyễn Nhật Minh', email: 'minh.nguyen@reshare.vn', role: 'donor', status: 'active' },
  { id: 'USR-0127', name: 'Đặng Thu Trang', email: 'trang.dang@reshare.vn', role: 'donor', status: 'active' },
  { id: 'USR-0142', name: 'Võ Quốc Bảo', email: 'bao.vo@reshare.vn', role: 'donor', status: 'active' },
  { id: 'USR-0158', name: 'Đỗ Anh Khoa', email: 'anh.khoa@reshare.vn', role: 'donor', status: 'active' },
]

const sampleWarehouses = [
  { id: 'wh-thu-duc', name: 'Kho Thủ Đức' },
  { id: 'wh-binh-thanh', name: 'Kho Bình Thạnh' },
  { id: 'wh-cau-giay', name: 'Kho Cầu Giấy' },
  { id: 'wh-hai-chau', name: 'Kho Hải Châu' },
]

export const accountRepository = {
  async search(query) {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi')
    if (!normalizedQuery) return []
    return sampleAccounts.filter((account) =>
      `${account.name} ${account.email}`.toLocaleLowerCase('vi').includes(normalizedQuery),
    )
  },

  async listWarehouses() {
    return sampleWarehouses
  },
}
