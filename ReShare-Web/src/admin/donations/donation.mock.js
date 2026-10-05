import { DONATION_CATEGORY, DONATION_STATUS } from './donation.constants'

// Giống warehouses/{id} (BE US02-T02). Dữ liệu demo, chưa phải kho vận hành thật.
export const MOCK_WAREHOUSES = Object.freeze([
  { id: 'wh_dn_01', name: 'Kho Hải Châu', status: 'active' },
  { id: 'wh_dn_02', name: 'Kho Ngũ Hành Sơn', status: 'active' },
  { id: 'wh_dn_03', name: 'Kho Liên Chiểu', status: 'active' },
])

// Giống users/{uid}; chỉ dùng displayName để hiển thị người gửi.
const MOCK_DONORS = Object.freeze([
  { id: 'donor-01', displayName: 'Nguyễn Thị Lan' },
  { id: 'donor-02', displayName: 'Trần Minh Khoa' },
  { id: 'donor-03', displayName: 'Lê Hoàng Yến' },
  { id: 'donor-04', displayName: 'Phạm Quốc Bảo' },
  { id: 'donor-05', displayName: 'Võ Thu Hà' },
  { id: 'donor-06', displayName: 'Đặng Gia Huy' },
  { id: 'donor-07', displayName: 'Huỳnh Ngọc Mai' },
  { id: 'donor-08', displayName: 'Bùi Đức Anh' },
])

const ITEM_TITLES = {
  [DONATION_CATEGORY.clothing]: [
    'Áo khoác mùa đông',
    'Bộ quần áo trẻ em',
    'Áo sơ mi công sở',
    'Váy liền thân',
    'Áo len cổ lọ',
    'Quần jean nam',
  ],
  [DONATION_CATEGORY.books]: [
    'Sách giáo khoa lớp 5',
    'Bộ truyện tranh thiếu nhi',
    'Từ điển Anh – Việt',
    'Sách luyện thi THPT',
    'Tiểu thuyết văn học',
  ],
  [DONATION_CATEGORY.household]: [
    'Nồi cơm điện',
    'Bộ chén đĩa sứ',
    'Quạt đứng',
    'Đèn học để bàn',
    'Chăn mỏng',
  ],
}

const CATEGORIES = Object.values(DONATION_CATEGORY)
const CONDITIONS = ['new', 'like_new', 'good', 'fair']
// Nhiều đơn chờ duyệt hơn để giống hàng đợi thực tế.
const STATUS_CYCLE = [
  DONATION_STATUS.pending,
  DONATION_STATUS.pending,
  DONATION_STATUS.approved,
  DONATION_STATUS.received,
  DONATION_STATUS.inStock,
  DONATION_STATUS.pending,
  DONATION_STATUS.distributed,
  DONATION_STATUS.rejected,
  DONATION_STATUS.approved,
  DONATION_STATUS.pending,
]
const HOUR_MS = 60 * 60 * 1000
const seedTime = Date.now()

// Giống donations/{id} (iOS DonationItem). hubId = kho dự kiến; một số đơn chưa gán kho.
// CẦN CHỐT: phạm vi kho lọc theo hubId (dự kiến) hay warehouseId (thực lưu).
export const MOCK_DONATIONS = Object.freeze(
  Array.from({ length: 48 }, (_, index) => {
    const category = CATEGORIES[index % CATEGORIES.length]
    const titles = ITEM_TITLES[category]
    return Object.freeze({
      id: `qg-${1001 + index}`,
      donorId: MOCK_DONORS[(index * 3) % MOCK_DONORS.length].id,
      title: titles[(index * 7) % titles.length],
      category,
      condition: CONDITIONS[index % CONDITIONS.length],
      status: STATUS_CYCLE[index % STATUS_CYCLE.length],
      hubId: index % 17 === 16 ? null : MOCK_WAREHOUSES[(index + Math.floor(index / 3)) % MOCK_WAREHOUSES.length].id,
      createdAt: new Date(seedTime - index * 31 * HOUR_MS - (index % 5) * HOUR_MS).toISOString(),
    })
  }),
)

export function getMockDonorName(donorId) {
  return MOCK_DONORS.find((donor) => donor.id === donorId)?.displayName ?? donorId
}

export const MOCK_DONATION_SCENARIO = Object.freeze({
  normal: 'normal',
  slow: 'slow',
  empty: 'empty',
  error: 'error',
  network: 'network',
  forbidden: 'forbidden',
})

let donationScenario = MOCK_DONATION_SCENARIO.normal
let accessOverride = null

export function getMockDonationScenario() {
  return donationScenario
}

export function getMockAccessOverride() {
  return accessOverride
}

// Dùng trong Console khi dev, sau đó bấm "Làm mới":
// reshareMock.setDonationScenario('error' | 'network' | 'forbidden' | 'empty' | 'slow' | 'normal')
// reshareMock.setDonationAccess({ role: 'warehouse_admin', warehouseIds: ['wh_dn_01'] }) — null để dùng quyền thật
if (import.meta.env.DEV) {
  globalThis.reshareMock = {
    ...globalThis.reshareMock,
    setDonationScenario: (scenario) => {
      donationScenario = MOCK_DONATION_SCENARIO[scenario] ?? MOCK_DONATION_SCENARIO.normal
    },
    setDonationAccess: (access) => {
      accessOverride = access
    },
  }
}
