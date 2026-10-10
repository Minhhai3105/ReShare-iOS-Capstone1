const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

test('US09: Warehouse Admin can only view donations in assigned warehouse; cross-warehouse access is rejected by Firestore Rules', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });

  try {
    const admin = env.authenticatedContext('admin').firestore();
    const whAdminA = env.authenticatedContext('wh-admin-a').firestore();
    const whAdminAB = env.authenticatedContext('wh-admin-ab').firestore();
    const whAdminB = env.authenticatedContext('wh-admin-b').firestore();
    const donor1 = env.authenticatedContext('donor-1').firestore();
    const anonymous = env.unauthenticatedContext().firestore();

    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();

      // Setup warehouses
      await db.doc('warehouses/kho-a').set({ name: 'Kho A', status: 'active' });
      await db.doc('warehouses/kho-b').set({ name: 'Kho B', status: 'active' });

      // Setup staff assignments
      await db.doc('staff_assignments/admin').set({
        uid: 'admin',
        role: 'system_admin',
        active: true,
        warehouseIds: [],
      });
      await db.doc('staff_assignments/wh-admin-a').set({
        uid: 'wh-admin-a',
        role: 'warehouse_admin',
        active: true,
        warehouseIds: ['kho-a'],
      });
      await db.doc('staff_assignments/wh-admin-b').set({
        uid: 'wh-admin-b',
        role: 'warehouse_admin',
        active: true,
        warehouseIds: ['kho-b'],
      });
      await db.doc('staff_assignments/wh-admin-ab').set({
        uid: 'wh-admin-ab',
        role: 'warehouse_admin',
        active: true,
        warehouseIds: ['kho-a', 'kho-b'],
      });

      // Setup donations
      await db.doc('donations/don-kho-a').set({
        id: 'don-kho-a',
        donorId: 'donor-1',
        title: 'Áo khoác',
        category: 'clothing',
        condition: 'good',
        status: 'pending',
        warehouseId: 'kho-a',
        createdAt: new Date(),
      });

      await db.doc('donations/don-kho-b').set({
        id: 'don-kho-b',
        donorId: 'donor-2',
        title: 'Sách giáo khoa',
        category: 'books',
        condition: 'new',
        status: 'pending',
        warehouseId: 'kho-b',
        createdAt: new Date(),
      });

      await db.doc('donations/don-unassigned').set({
        id: 'don-unassigned',
        donorId: 'donor-1',
        title: 'Nồi cơm',
        category: 'household',
        condition: 'fair',
        status: 'pending',
        hubId: 'kho-a', // Điểm minh họa không được coi là kho đã phân công.
        createdAt: new Date(),
      });
    });

    // 1. Warehouse Admin A đọc đơn thuộc Kho A -> Thành công
    await assertSucceeds(whAdminA.doc('donations/don-kho-a').get());

    // 2. Warehouse Admin A đọc đơn thuộc Kho B (sai kho) -> Bị Firestore Rules từ chối
    await assertFails(whAdminA.doc('donations/don-kho-b').get());

    // 3. Warehouse Admin A đọc đơn chưa gán kho -> Bị từ chối
    await assertFails(whAdminA.doc('donations/don-unassigned').get());

    // 4. Warehouse Admin B đọc đơn thuộc Kho B -> Thành công; đọc Kho A -> Bị từ chối
    await assertSucceeds(whAdminB.doc('donations/don-kho-b').get());
    await assertFails(whAdminB.doc('donations/don-kho-a').get());

    // 5. System Admin đọc toàn bộ các đơn ở bất kỳ kho nào -> Thành công
    await assertSucceeds(admin.doc('donations/don-kho-a').get());
    await assertSucceeds(admin.doc('donations/don-kho-b').get());
    await assertSucceeds(admin.doc('donations/don-unassigned').get());

    // 6. Donor chỉ đọc được đơn của chính mình
    await assertSucceeds(donor1.doc('donations/don-kho-a').get());
    await assertSucceeds(donor1.doc('donations/don-unassigned').get());
    await assertFails(donor1.doc('donations/don-kho-b').get());

    // 7. Khách vãng lai (unauthenticated) không được đọc đơn nào
    await assertFails(anonymous.doc('donations/don-kho-a').get());
    await assertFails(anonymous.doc('donations/don-kho-b').get());

    // 8. Kiểm tra Query/List có giới hạn kho
    // Wh-admin-a query đúng kho của mình -> Thành công
    await assertSucceeds(whAdminA.collection('donations').where('warehouseId', '==', 'kho-a').get());
    await assertSucceeds(whAdminAB.collection('donations')
      .where('warehouseId', 'in', ['kho-a', 'kho-b'])
      .orderBy('createdAt', 'desc').limit(11).get());

    // Wh-admin-a cố tình query kho khác (sửa request thủ công) -> Bị Backend Firestore Rules từ chối
    await assertFails(whAdminA.collection('donations').where('warehouseId', '==', 'kho-b').get());

    // Không thể lợi dụng hubId trùng kho để thấy đơn chưa phân kho.
    await assertFails(whAdminA.collection('donations').where('hubId', '==', 'kho-a').get());

    // Wh-admin-a query toàn bộ không lọc kho -> Bị từ chối vì chứa document ngoài phạm vi
    await assertFails(whAdminA.collection('donations').get());

    // System admin query toàn bộ -> Thành công
    await assertSucceeds(admin.collection('donations').get());
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
});
