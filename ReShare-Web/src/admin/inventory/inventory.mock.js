// Dữ liệu tồn kho mẫu, chỉ dùng khi chạy dev (service chặn trên bản production).
// CẦN CHỐT với BE: tên collection/field cho vật phẩm tồn (inventory), biến động (stock movements),
// phiếu xuất (distribution vouchers) và hồ sơ người thụ hưởng.
// Không import từ donations/ để bản build không kéo theo dữ liệu mẫu của module khác.
export const MOCK_WAREHOUSES = [
  { id: 'wh_dn_01', name: 'Kho Hải Châu', area: 'Khu vực Hải Châu & Sơn Trà, TP. Đà Nẵng' },
  { id: 'wh_dn_02', name: 'Kho Ngũ Hành Sơn', area: 'Khu vực Ngũ Hành Sơn, TP. Đà Nẵng' },
  { id: 'wh_dn_03', name: 'Kho Liên Chiểu', area: 'Khu vực Liên Chiểu, TP. Đà Nẵng' },
]

const STAFF = ['Nguyễn Văn An', 'Lê Thị Bình', 'Trần Quốc Huy']
const DAY_MS = 24 * 60 * 60 * 1000

// [tên, danh mục, mã đơn vị, tình trạng, kho, số nhập ban đầu, điều chỉnh]
// Tên field theo BE (inventory/inventory_movements): itemName, unitId, conditionId, quantityReceived, stockEntryId, inventoryItemId.
const SEED = [
  ['Áo khoác mùa đông', 'clothing', 'piece', 'good', 'wh_dn_01', 24, 0],
  ['Sách giáo khoa lớp 5', 'books', 'piece', 'good', 'wh_dn_01', 40, -2],
  ['Nồi cơm điện', 'household', 'piece', 'good', 'wh_dn_01', 3, 0],
  ['Bộ quần áo trẻ em', 'clothing', 'set', 'good', 'wh_dn_01', 15, 0],
  ['Đèn học để bàn', 'household', 'piece', 'good', 'wh_dn_01', 7, 0],
  ['Chăn mỏng', 'household', 'piece', 'minor-wear', 'wh_dn_02', 10, 0],
  ['Từ điển Anh – Việt', 'books', 'piece', 'good', 'wh_dn_02', 8, 1],
  ['Quạt đứng', 'household', 'piece', 'good', 'wh_dn_02', 5, 0],
  ['Áo sơ mi công sở', 'clothing', 'piece', 'good', 'wh_dn_02', 30, 0],
  ['Bộ truyện tranh thiếu nhi', 'books', 'set', 'minor-wear', 'wh_dn_03', 12, 0],
  ['Bộ chén đĩa sứ', 'household', 'set', 'damaged', 'wh_dn_03', 6, -1],
  ['Váy liền thân', 'clothing', 'piece', 'good', 'wh_dn_03', 18, 0],
]

// Người thụ hưởng chỉ giữ mã hồ sơ và tên hiển thị đã che; không có SĐT, địa chỉ, CCCD (US17 AC3).
const BENEFICIARIES = [
  ['nth-0001', 'Hộ bà Nguyễn Thị H.'],
  ['nth-0002', 'Em Trần Văn K.'],
  ['nth-0003', 'Hộ ông Lê Văn T.'],
  ['nth-0004', 'Mái ấm Hoa Mai'],
  ['nth-0005', 'Hộ bà Phạm Thị N.'],
]

// Phiếu xuất (US17): [kho, người thụ hưởng, các dòng [vị trí vật phẩm trong SEED, số lượng], ghi chú bàn giao]
const VOUCHERS = [
  ['wh_dn_01', 0, [[0, 5], [1, 12]], 'Bàn giao tại kho, người nhận ký biên bản'],
  ['wh_dn_01', 1, [[2, 3], [4, 2]], 'Giao tận nơi qua tình nguyện viên'],
  ['wh_dn_01', 0, [[0, 3]], 'Hỗ trợ bổ sung đợt 2'],
  ['wh_dn_02', 2, [[5, 4], [6, 2]], 'Bàn giao tại kho'],
  ['wh_dn_02', 3, [[5, 6], [7, 1], [8, 10]], 'Bàn giao cho đại diện mái ấm'],
  ['wh_dn_02', 2, [[8, 5]], 'Hỗ trợ bổ sung đợt 2'],
  ['wh_dn_03', 4, [[9, 12], [11, 7]], 'Bàn giao tại kho'],
]

// Dữ liệu được tạo khi gọi hàm (chỉ ở chế độ dev) để bản build loại bỏ được file này.
export function createMockInventory() {
  const seedTime = Date.now()
  const items = Object.freeze(
    SEED.map(([itemName, category, unitId, conditionId, warehouseId, quantityReceived], index) => {
      const code = String(index + 1).padStart(4, '0')
      return Object.freeze({
        id: `vp-${code}`,
        itemName,
        category,
        unitId,
        conditionId,
        warehouseId,
        quantityReceived,
        location: `${'ABC'[index % 3]}-0${(index % 4) + 1}-0${(index % 5) + 1}`,
        donationId: `qg-${1001 + index * 3}`,
        receiptId: `bb-${code}`,
        stockEntryId: `pn-${code}`,
      })
    }),
  )

  const beneficiaries = Object.freeze(BENEFICIARIES.map(([id, displayName]) => Object.freeze({ id, displayName })))

  // Phiếu xuất xác nhận sau khi nhập kho (ngày -16 → -4); mỗi dòng sinh một biến động phân phối.
  const vouchers = Object.freeze(
    VOUCHERS.map(([warehouseId, beneficiaryIndex, lines, note], index) => {
      const confirmedAt = seedTime - (16 - index * 2) * DAY_MS
      return Object.freeze({
        id: `px-${String(index + 1).padStart(4, '0')}`,
        warehouseId,
        beneficiaryId: beneficiaries[beneficiaryIndex].id,
        status: 'confirmed',
        lines: lines.map(([itemIndex, quantity]) => ({ inventoryItemId: items[itemIndex].id, quantity })),
        note,
        createdBy: STAFF[index % STAFF.length],
        createdAt: new Date(confirmedAt - 3 * 60 * 60 * 1000).toISOString(),
        confirmedBy: STAFF[(index + 1) % STAFF.length],
        confirmedAt: new Date(confirmedAt).toISOString(),
      })
    }),
  )

  // Biến động chỉ thêm mới (append-only), theo thứ tự thời gian: nhập dương, phân phối âm, điều chỉnh âm/dương.
  const movements = Object.freeze(
    SEED.flatMap(([, , , , , quantityReceived, adjustment], index) => {
      const item = items[index]
      const movement = (step, type, quantity, voucherId, actor, note, createdAt) => ({
        id: `${item.id}-m${step}`, inventoryItemId: item.id, type, quantity, voucherId, actor, note, createdAt,
      })
      const distributions = vouchers.flatMap((voucher) =>
        voucher.lines.filter(({ inventoryItemId }) => inventoryItemId === item.id).map(({ quantity }) => ({ voucher, quantity })),
      )
      return [
        movement(0, 'stock_in', quantityReceived, item.stockEntryId, STAFF[index % STAFF.length],
          'Nhập kho theo biên bản thực nhận', new Date(seedTime - (40 - index * 2) * DAY_MS).toISOString()),
        ...distributions.map(({ voucher, quantity }, step) =>
          movement(step + 1, 'distribution', -quantity, voucher.id, voucher.confirmedBy, 'Phân phối cho người thụ hưởng', voucher.confirmedAt),
        ),
        ...(adjustment
          ? [
              movement(distributions.length + 1, 'adjustment', adjustment, `dc-${item.id.slice(3)}`, STAFF[(index + 2) % STAFF.length],
                adjustment > 0 ? 'Kiểm kê phát hiện thừa' : 'Kiểm kê phát hiện hư hỏng', new Date(seedTime - DAY_MS).toISOString()),
            ]
          : []),
      ]
    }),
  )
  return { items, movements, vouchers, beneficiaries }
}

let inventoryScenario = 'normal'

export function getInventoryScenario() {
  return inventoryScenario
}

// Console khi dev: reshareMock.setInventoryScenario('error' | 'empty' | 'normal') rồi bấm "Đặt lại".
if (import.meta.env.DEV) {
  globalThis.reshareMock = {
    ...globalThis.reshareMock,
    setInventoryScenario: (scenario) => {
      inventoryScenario = scenario
    },
  }
}
