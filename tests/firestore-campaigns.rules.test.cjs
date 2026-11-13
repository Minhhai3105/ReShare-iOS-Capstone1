const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const DAY = 24 * 60 * 60 * 1000;

test('Chiến dịch: app chỉ đọc chiến dịch đã công khai; mọi thao tác ghi bị từ chối kể cả System Admin', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc('staff_assignments/admin').set({ role: 'system_admin', active: true, warehouseIds: [] });
      const base = { title: 'Áo ấm', category: 'clothing', unitId: 'piece', targetQuantity: 10,
        endDate: new Date(Date.now() + 30 * DAY) };
      await db.doc('campaigns/camp-active').set({ ...base, status: 'active' });
      await db.doc('campaigns/camp-closed').set({ ...base, status: 'closed' });
      await db.doc('campaigns/camp-draft').set({ ...base, status: 'draft' });
    });
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(guest.doc('campaigns/camp-active').get());
    await assertSucceeds(guest.doc('campaigns/camp-closed').get());
    await assertFails(guest.doc('campaigns/camp-draft').get());
    await assertSucceeds(guest.collection('campaigns').where('status', '==', 'active').get());
    await assertFails(guest.collection('campaigns').get(), 'truy vấn không lọc trạng thái có thể lộ bản nháp');

    const admin = env.authenticatedContext('admin').firestore();
    const donor = env.authenticatedContext('donor').firestore();
    await assertFails(admin.doc('campaigns/camp-new').set({ title: 'Mới', status: 'active' }));
    await assertFails(admin.doc('campaigns/camp-active').update({ receivedQuantity: 999 }));
    await assertFails(donor.doc('campaigns/camp-active').update({ receivedQuantity: 999 }));
    await assertFails(admin.doc('campaigns/camp-active').delete());
  } finally {
    // Rules test và backend test dùng chung project emulator: dọn dữ liệu để không làm hỏng test sau.
    await env.clearFirestore();
    await env.cleanup();
  }
});

test('Chiến dịch: đơn quyên góp chỉ gắn được vào chiến dịch đang mở, chưa hết hạn và cùng danh mục', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-reshare',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  try {
    const recordId = '7e5b3a1a-cc8f-4a6d-9e1b-3128a07f8f21';
    const ids = [1, 2, 3].map(number => `donations/${recordId}/00000000-0000-4000-8000-00000000000${number}`);
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`image_upload_batches/donation_${recordId}`).set({
        ownerUid: 'donor', assets: { first: ids[0], second: ids[1], third: ids[2] },
      });
      const base = { title: 'Áo ấm', category: 'clothing', unitId: 'piece', targetQuantity: 10 };
      await db.doc('campaigns/camp-open').set({ ...base, status: 'active', endDate: new Date(Date.now() + 30 * DAY) });
      await db.doc('campaigns/camp-draft').set({ ...base, status: 'draft', endDate: new Date(Date.now() + 30 * DAY) });
      await db.doc('campaigns/camp-closed').set({ ...base, status: 'closed', endDate: new Date(Date.now() + 30 * DAY) });
      await db.doc('campaigns/camp-expired').set({ ...base, status: 'active', endDate: new Date(Date.now() - DAY) });
    });
    const donor = env.authenticatedContext('donor').firestore();
    const donation = {
      id: recordId, donorId: 'donor', title: 'Áo khoác', description: 'Còn mới',
      category: 'clothing', condition: 'good', status: 'pending', createdAt: new Date(),
      quantity: 2, unitId: 'piece', imageProvider: 'cloudinary', imagePublicIds: ids,
    };
    const reference = donor.doc(`donations/${recordId}`);
    await assertFails(reference.set({ ...donation, campaignId: 'camp-draft' }));
    await assertFails(reference.set({ ...donation, campaignId: 'camp-closed' }));
    await assertFails(reference.set({ ...donation, campaignId: 'camp-expired' }));
    await assertFails(reference.set({ ...donation, campaignId: 'camp-ao-am-2026' }), 'mã chiến dịch giả cũ trong app');
    await assertFails(reference.set({ ...donation, campaignId: 'bad id' }));
    await assertFails(reference.set({ ...donation, campaignId: null }));
    await assertFails(reference.set({ ...donation, campaignId: 'camp-open', category: 'books' }),
      'chiến dịch quần áo không nhận đơn sách');
    await assertSucceeds(reference.set({ ...donation, campaignId: 'camp-open' }));
    await env.withSecurityRulesDisabled(context => context.firestore().doc(`donations/${recordId}`).delete());
    await assertSucceeds(reference.set(donation), 'quyên góp tự do không cần chiến dịch');
  } finally {
    // Rules test và backend test dùng chung project emulator: dọn dữ liệu để không làm hỏng test sau.
    await env.clearFirestore();
    await env.cleanup();
  }
});
