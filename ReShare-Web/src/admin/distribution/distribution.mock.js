// AI-generated fixtures for RC1D-82. Fictional people and documents; memory only.
export const distributionFixtures = {
  warehouses: [
    { id: 'hai-chau', name: 'Kho demo Hải Châu' },
    { id: 'son-tra', name: 'Kho demo Sơn Trà' },
  ],
  inventory: [
    { id: 'DEMO-INV-001', name: 'Áo khoác người lớn', warehouseId: 'hai-chau', available: 3, unit: 'chiếc', location: 'A-02 / B-04', sourceReceipt: 'DEMO-PNK-001', version: 1 },
    { id: 'DEMO-INV-002', name: 'Bộ quần áo trẻ em', warehouseId: 'hai-chau', available: 12, unit: 'bộ', location: 'A-03 / B-01', sourceReceipt: 'DEMO-PNK-002', version: 1 },
    { id: 'DEMO-INV-003', name: 'Chăn ấm', warehouseId: 'son-tra', available: 5, unit: 'chiếc', location: 'B-01 / C-02', sourceReceipt: 'DEMO-PNK-003', version: 1 },
    { id: 'DEMO-INV-004', name: 'Áo sơ mi', warehouseId: 'hai-chau', available: 0, unit: 'chiếc', location: 'A-01 / B-02', sourceReceipt: 'DEMO-PNK-004', version: 1 },
  ],
  beneficiaries: [
    { id: 'DEMO-BEN-001', name: 'Người thụ hưởng mẫu 01', warehouseId: 'hai-chau', area: 'Hải Châu', approved: true },
    { id: 'DEMO-BEN-002', name: 'Người thụ hưởng mẫu 02', warehouseId: 'hai-chau', area: 'Hải Châu', approved: true },
    { id: 'DEMO-BEN-003', name: 'Người thụ hưởng mẫu 03', warehouseId: 'son-tra', area: 'Sơn Trà', approved: true },
    { id: 'DEMO-BEN-004', name: 'Hồ sơ mẫu chưa duyệt', warehouseId: 'hai-chau', area: 'Hải Châu', approved: false },
  ],
}

export const previewAssignment = { active: true, role: 'warehouse_admin', warehouseIds: ['hai-chau'] }
export const previewActor = { id: 'DEMO-STAFF-001', displayName: 'Nhân sự kho mẫu' }
