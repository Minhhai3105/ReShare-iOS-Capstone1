// Dữ liệu tồn kho mẫu, chỉ dùng khi chạy dev (service chặn trên bản production).
// CẦN CHỐT với BE: tên collection/field cho vật phẩm tồn (inventory) và biến động (stock movements).
// Không import từ donations/ để bản build không kéo theo dữ liệu mẫu của module khác.
export const MOCK_WAREHOUSES = [
  { id: 'wh_dn_01', name: 'Kho Hải Châu', area: 'Khu vực Hải Châu & Sơn Trà, TP. Đà Nẵng' },
  { id: 'wh_dn_02', name: 'Kho Ngũ Hành Sơn', area: 'Khu vực Ngũ Hành Sơn, TP. Đà Nẵng' },
  { id: 'wh_dn_03', name: 'Kho Liên Chiểu', area: 'Khu vực Liên Chiểu, TP. Đà Nẵng' },
]

const STAFF = ['Nguyễn Văn An', 'Lê Thị Bình', 'Trần Quốc Huy']
const DAY_MS = 24 * 60 * 60 * 1000

// [tên, danh mục, mã đơn vị, tình trạng, kho, số nhập ban đầu, các lần phân phối, điều chỉnh]
// Tên field theo BE (inventory/inventory_movements): itemName, unitId, conditionId, quantityReceived, stockEntryId, inventoryItemId.
const SEED = [
  ['Áo khoác mùa đông', 'clothing', 'piece', 'good', 'wh_dn_01', 24, [5, 3], 0],
  ['Sách giáo khoa lớp 5', 'books', 'piece', 'good', 'wh_dn_01', 40, [12], -2],
  ['Nồi cơm điện', 'household', 'piece', 'good', 'wh_dn_01', 3, [3], 0],
  ['Bộ quần áo trẻ em', 'clothing', 'set', 'good', 'wh_dn_01', 15, [], 0],
  ['Đèn học để bàn', 'household', 'piece', 'good', 'wh_dn_01', 7, [2], 0],
  ['Chăn mỏng', 'household', 'piece', 'minor-wear', 'wh_dn_02', 10, [4, 6], 0],
  ['Từ điển Anh – Việt', 'books', 'piece', 'good', 'wh_dn_02', 8, [2], 1],
  ['Quạt đứng', 'household', 'piece', 'good', 'wh_dn_02', 5, [1], 0],
  ['Áo sơ mi công sở', 'clothing', 'piece', 'good', 'wh_dn_02', 30, [10, 5], 0],
  ['Bộ truyện tranh thiếu nhi', 'books', 'set', 'minor-wear', 'wh_dn_03', 12, [12], 0],
  ['Bộ chén đĩa sứ', 'household', 'set', 'damaged', 'wh_dn_03', 6, [], -1],
  ['Váy liền thân', 'clothing', 'piece', 'good', 'wh_dn_03', 18, [7], 0],
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

  // Biến động chỉ thêm mới (append-only): nhập dương, phân phối âm, điều chỉnh âm/dương.
  const movements = Object.freeze(
    SEED.flatMap(([, , , , , quantityReceived, distributions, adjustment], index) => {
      const item = items[index]
      const code = item.id.slice(3)
      const startTime = seedTime - (40 - index * 2) * DAY_MS
      const movement = (step, type, quantity, voucherId, note) => ({
        id: `${item.id}-m${step}`,
        inventoryItemId: item.id,
        type,
        quantity,
        voucherId,
        actor: STAFF[(index + step) % STAFF.length],
        note,
        createdAt: new Date(startTime + step * 2 * DAY_MS).toISOString(),
      })
      return [
        movement(0, 'stock_in', quantityReceived, item.stockEntryId, 'Nhập kho theo biên bản thực nhận'),
        ...distributions.map((quantity, step) =>
          movement(step + 1, 'distribution', -quantity, `px-${code}-${step + 1}`, 'Phân phối cho người thụ hưởng'),
        ),
        ...(adjustment
          ? [
              movement(distributions.length + 1, 'adjustment', adjustment, `dc-${code}`,
                adjustment > 0 ? 'Kiểm kê phát hiện thừa' : 'Kiểm kê phát hiện hư hỏng'),
            ]
          : []),
      ]
    }),
  )
  return { items, movements }
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
