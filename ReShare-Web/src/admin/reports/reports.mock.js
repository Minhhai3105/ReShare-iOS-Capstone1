// AI-generated fictional documents. One row per source document in this MVP.
const row = (id, type, timestamp, warehouseId, categoryId, item, quantity, unit, reference = '', status = 'confirmed') =>
  ({ id, type, timestamp, warehouseId, categoryId, item, quantity, unit, reference, status })

export const reportFixtures = {
  warehouses: [{ id: 'hai-chau', name: 'Kho demo Hải Châu' }, { id: 'son-tra', name: 'Kho demo Sơn Trà' }],
  categories: [{ id: 'clothing', name: 'Quần áo' }, { id: 'blankets', name: 'Chăn ấm' }, { id: 'household', name: 'Đồ gia dụng' }],
  sources: [
    row('DEMO-D001', 'donation', '2025-05-01T02:00:00Z', 'hai-chau', 'clothing', 'Áo khoác', 10, 'chiếc', '', 'approved'),
    row('DEMO-D002', 'donation', '2025-05-05T03:00:00Z', 'hai-chau', 'blankets', 'Chăn ấm', 3, 'chiếc'),
    row('DEMO-D003', 'donation', '2025-05-06T04:00:00Z', 'son-tra', 'clothing', 'Áo khoác', 5, 'chiếc'),
    row('DEMO-D004', 'donation', '2025-05-15T01:00:00Z', 'hai-chau', 'household', 'Bột giặt', 4, 'kg'),
    row('DEMO-D005', 'donation', '2025-04-30T16:59:59Z', 'hai-chau', 'clothing', 'Áo khoác', 1, 'chiếc'),
    row('DEMO-D006', 'donation', '2025-04-30T17:00:00Z', 'hai-chau', 'clothing', 'Bộ quần áo', 2, 'bộ'),
    row('DEMO-D007', 'donation', '2025-05-31T16:59:59Z', 'son-tra', 'blankets', 'Chăn ấm', 2, 'chiếc'),
    row('DEMO-D008', 'donation', '2025-05-31T17:00:00Z', 'hai-chau', 'clothing', 'Áo khoác', 1, 'chiếc'),
    row('DEMO-R001', 'receipt', '2025-05-03T02:00:00Z', 'hai-chau', 'clothing', 'Áo khoác', 10, 'chiếc', 'DEMO-D001'),
    row('DEMO-R002', 'receipt', '2025-05-07T02:00:00Z', 'son-tra', 'clothing', 'Áo khoác', 5, 'chiếc', 'DEMO-D003'),
    row('DEMO-R003', 'receipt', '2025-05-17T02:00:00Z', 'hai-chau', 'household', 'Bột giặt', 4, 'kg', 'DEMO-D004'),
    row('DEMO-I001', 'intake', '2025-05-03T03:00:00Z', 'hai-chau', 'clothing', 'Áo khoác', 10, 'chiếc', 'DEMO-R001'),
    row('DEMO-I002', 'intake', '2025-05-07T03:00:00Z', 'son-tra', 'clothing', 'Áo khoác', 5, 'chiếc', 'DEMO-R002'),
    row('DEMO-I003', 'intake', '2025-05-17T03:00:00Z', 'hai-chau', 'household', 'Bột giặt', 4, 'kg', 'DEMO-R003'),
    row('DEMO-I004', 'intake', '2025-05-20T03:00:00Z', 'hai-chau', 'blankets', 'Chăn ấm', 3, 'chiếc', 'DEMO-D002'),
    row('DEMO-X001', 'distribution', '2025-05-10T03:00:00Z', 'hai-chau', 'clothing', 'Áo khoác', 2, 'chiếc', 'DEMO-MOV-001'),
    row('DEMO-X002', 'distribution', '2025-05-12T03:00:00Z', 'son-tra', 'clothing', 'Áo khoác', 1, 'chiếc', 'DEMO-MOV-002'),
    row('DEMO-X003', 'distribution', '2025-05-21T03:00:00Z', 'hai-chau', 'blankets', 'Chăn ấm', 1, 'chiếc', 'DEMO-MOV-003'),
    row('DEMO-X004', 'distribution', '2025-06-02T03:00:00Z', 'hai-chau', 'clothing', 'Áo khoác', 1, 'chiếc', 'DEMO-MOV-004'),
    row('DEMO-X-DRAFT', 'distribution', '2025-05-22T03:00:00Z', 'hai-chau', 'clothing', 'Áo khoác', 99, 'chiếc', '', 'draft'),
  ],
  snapshotAt: '2026-10-28T01:00:00Z',
  // Snapshot from the fictional stock ledger, NOT donation counts. No opening stock.
  inventory: [
    { id: 'DEMO-S001', warehouseId: 'hai-chau', categoryId: 'clothing', item: 'Áo khoác', available: 7, unit: 'chiếc' },
    { id: 'DEMO-S002', warehouseId: 'hai-chau', categoryId: 'blankets', item: 'Chăn ấm', available: 2, unit: 'chiếc' },
    { id: 'DEMO-S003', warehouseId: 'hai-chau', categoryId: 'household', item: 'Bột giặt', available: 4, unit: 'kg' },
    { id: 'DEMO-S004', warehouseId: 'son-tra', categoryId: 'clothing', item: 'Áo khoác', available: 4, unit: 'chiếc' },
    { id: 'DEMO-S005', warehouseId: 'son-tra', categoryId: 'blankets', item: 'Chăn ấm', available: 0, unit: 'chiếc' },
  ],
}
