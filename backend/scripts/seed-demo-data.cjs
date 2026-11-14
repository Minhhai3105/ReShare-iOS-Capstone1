// Nạp dữ liệu MẪU cho demo: đơn quyên góp như gửi từ app (kèm 3 ảnh thật trên Cloudinary) rồi đi qua
// đủ quy trình kho bằng ĐÚNG code API của backend (gán kho, duyệt/từ chối, thực nhận, nhập kho, phân phối).
// Nhờ vậy tồn kho, lịch sử, phiếu và báo cáo khớp nhau như dữ liệu thật.
//
// Đánh dấu: mọi đơn và hồ sơ người quyên góp mẫu có `seedBatch`; mọi thao tác kho ghi dưới danh nghĩa
// nhân sự mẫu `seed-<batch>` (không có tài khoản đăng nhập, bị gỡ quyền khi script chạy xong).
// Dọn sạch bằng: node scripts/cleanup-demo-data.cjs --batch <batch> --yes
//
// Chạy (từ thư mục backend):
//   FIREBASE_PROJECT_ID=<project> GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
//   node scripts/seed-demo-data.cjs --images <thư mục ảnh> --batch demo-2026-11-14 [--yes]
// Không có --yes thì chỉ in kế hoạch (dry run). Khoá Cloudinary đọc từ backend/.env.
// Ảnh: mỗi thư mục con của --images là một nhóm (vd. ao-khoac-jean/1.jpg, 2.jpg, 3.jpg) khớp TEMPLATES.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const WAREHOUSES = ['wh_dn_01', 'wh_dn_02', 'wh_dn_03'];
const HUBS = ['hub-haichau', 'hub-nguhanhson', 'hub-lienchieu'];
const DAY = 24 * 60 * 60 * 1000;

// Mẫu món đồ theo nhóm ảnh. quantity: [min, max]; unit thuộc piece|kg|bag|box|set.
const TEMPLATES = {
  'ao-khoac-jean': { category: 'clothing', title: 'Áo khoác jean nam size L', description: 'Áo khoác jean xanh, mặc vài lần, còn chắc chắn, đủ cúc.', unit: 'piece', quantity: [1, 2], condition: 'like_new' },
  'ao-khoac-jean-bac': { category: 'clothing', title: 'Áo khoác jean bạc màu nữ', description: 'Áo jean wash bạc, form rộng, không rách, đã giặt sạch.', unit: 'piece', quantity: [1, 1], condition: 'good' },
  'ao-len': { category: 'clothing', title: 'Áo len dày mùa đông size M', description: 'Áo len dày, giặt sạch, không xù lông, phù hợp cho mùa lạnh.', unit: 'piece', quantity: [2, 3], condition: 'good' },
  'vay-tre-em': { category: 'clothing', title: 'Váy trắng bé gái 2–4 tuổi', description: 'Váy cotton thêu ren, bé mặc dự tiệc vài lần, còn đẹp.', unit: 'piece', quantity: [1, 2], condition: 'like_new' },
  'vay-dai': { category: 'clothing', title: 'Váy dài kẻ caro nữ', description: 'Váy dài tay, vải dày, phù hợp đi làm hoặc đi học.', unit: 'piece', quantity: [1, 1], condition: 'good' },
  'quan-kaki': { category: 'clothing', title: 'Quần kaki nam size 30', description: 'Quần kaki nâu, ống đứng, còn mới khoảng 80%.', unit: 'piece', quantity: [2, 3], condition: 'good' },
  'ao-phong': { category: 'clothing', title: 'Túi áo phông cotton nhiều size', description: 'Áo thun cotton đã giặt sạch, xếp gọn trong túi, nhiều size từ S tới XL.', unit: 'bag', quantity: [1, 2], condition: 'good' },
  'ao-khoac-mua-dong': { category: 'clothing', title: 'Áo khoác phao có mũ', description: 'Áo phao có mũ lông, ấm, khoá kéo hoạt động tốt.', unit: 'piece', quantity: [1, 1], condition: 'good' },
  'sach-giao-khoa': { category: 'books', title: 'Bộ sách giáo khoa lớp 10', description: 'Đủ bộ các môn, có ghi chú bút chì vài trang, không rách.', unit: 'set', quantity: [1, 2], condition: 'good' },
  'sach-thieu-nhi': { category: 'books', title: 'Sách truyện thiếu nhi', description: 'Truyện tranh và truyện chữ cho bé 5–10 tuổi, bìa còn đẹp.', unit: 'piece', quantity: [10, 18], condition: 'good' },
  'vo-hoc-sinh': { category: 'books', title: 'Vở học sinh chưa dùng', description: 'Vở ô li và vở kẻ ngang 96 trang, còn mới, chưa viết.', unit: 'piece', quantity: [20, 40], condition: 'new' },
  'truyen-tranh': { category: 'books', title: 'Thùng truyện tranh tổng hợp', description: 'Truyện tranh nhiều thể loại, gáy sách còn chắc.', unit: 'box', quantity: [1, 1], condition: 'fair' },
  'sach-van-hoc': { category: 'books', title: 'Sách văn học kinh điển', description: 'Tiểu thuyết và tuyển tập văn học, giấy hơi ngả màu nhưng đọc tốt.', unit: 'piece', quantity: [8, 15], condition: 'fair' },
  'tu-dien': { category: 'books', title: 'Từ điển Anh – Việt bìa cứng', description: 'Từ điển bìa cứng, không rách trang, phù hợp học sinh cấp 2–3.', unit: 'piece', quantity: [1, 3], condition: 'good' },
  'noi-com-dien': { category: 'household', title: 'Nồi cơm điện 1.8 lít', description: 'Nồi cơm điện còn dùng tốt, lòng nồi không trầy, đủ dây cắm.', unit: 'piece', quantity: [1, 1], condition: 'good' },
  'quat-dien': { category: 'household', title: 'Quạt bàn điện', description: 'Quạt chạy êm, đủ 3 số gió, có dây cắm.', unit: 'piece', quantity: [1, 2], condition: 'good' },
  'am-sieu-toc': { category: 'household', title: 'Ấm siêu tốc 1.7 lít', description: 'Ấm đun nước nhanh, tự ngắt khi sôi, ít dùng.', unit: 'piece', quantity: [1, 1], condition: 'like_new' },
  'noi-nhom': { category: 'household', title: 'Nồi nhôm có nắp cỡ lớn', description: 'Nồi nhôm cỡ lớn, nấu canh cho cả nhà, đáy không thủng.', unit: 'piece', quantity: [1, 2], condition: 'fair' },
  'bo-dia': { category: 'household', title: 'Bộ đĩa sứ hoa văn', description: 'Bộ 6 đĩa sứ, không sứt mẻ, đã rửa sạch.', unit: 'set', quantity: [1, 1], condition: 'good' },
  'den-ban': { category: 'household', title: 'Đèn bàn học', description: 'Đèn bàn bóng vàng, công tắc còn tốt.', unit: 'piece', quantity: [1, 1], condition: 'good' },
  chan: { category: 'household', title: 'Chăn len kẻ ô', description: 'Chăn len dày, đã giặt sạch, gấp gọn.', unit: 'piece', quantity: [2, 3], condition: 'good' },
  'binh-giu-nhiet': { category: 'household', title: 'Bình giữ nhiệt 1 lít', description: 'Bình inox giữ nóng tốt, nắp kín, không móp.', unit: 'piece', quantity: [1, 2], condition: 'like_new' },
};

const DONORS = ['Nguyễn Thị Lan', 'Trần Văn Minh', 'Lê Hoàng Anh', 'Phạm Thu Hà', 'Võ Quốc Bảo', 'Đặng Ngọc Mai', 'Huỳnh Đức Tài', 'Bùi Thanh Trúc'];
const BENEFICIARIES = [
  { name: 'Mái ấm Hoa Hồng', phone: '0236 3800 101', notes: 'Mái ấm nuôi dưỡng 25 trẻ em.', needs: ['clothing', 'books'] },
  { name: 'Trường tiểu học vùng ven Hoà Vang', phone: '0236 3800 102', notes: 'Hỗ trợ học sinh khó khăn.', needs: ['books', 'household'] },
  { name: 'Nhóm thiện nguyện Ánh Dương', phone: '0236 3800 103', notes: 'Phát đồ cho người lao động thu nhập thấp.', needs: ['clothing', 'household'] },
  { name: 'Nhà dưỡng lão An Bình', phone: '0236 3800 104', notes: 'Chăm sóc 30 cụ già neo đơn.', needs: ['clothing', 'household'] },
  { name: 'Lớp học tình thương Sơn Trà', phone: '0236 3800 105', notes: 'Lớp học miễn phí buổi tối.', needs: ['books'] },
  { name: 'Hội phụ nữ phường Hoà Khánh', phone: '0236 3800 106', notes: 'Hỗ trợ gia đình khó khăn trong phường.', needs: ['clothing', 'books', 'household'] },
];
const REJECT_REASONS = [
  'Ảnh chưa thấy rõ tình trạng món đồ. Bạn có thể gửi đơn mới với ảnh rõ hơn.',
  'Kho hiện chưa nhận loại đồ này. Cảm ơn bạn đã quan tâm.',
  'Món đồ đã hư hỏng nhiều, không thể trao lại cho người nhận.',
];
const LOCATIONS = ['Kệ A1', 'Kệ A2', 'Kệ B1', 'Kệ B3', 'Khu C', 'Kệ D2'];

// Mỗi kho 13 đơn theo các trạng thái; thêm 4 đơn mới chưa gán kho (vừa gửi từ app).
const PER_WAREHOUSE = [
  ['pending', 1], ['rejected', 1], ['approved', 3], ['received', 2], ['in_stock_partial', 1], ['in_stock', 2], ['distributed', 3],
];
const UNASSIGNED_PENDING = 4;

function args() {
  const out = { yes: false, upload: true };
  const list = process.argv.slice(2);
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === '--yes') out.yes = true;
    // Chỉ dùng khi chạy thử trên Firestore Emulator: không gửi ảnh lên Cloudinary thật.
    else if (list[i] === '--no-upload') out.upload = false;
    else if (list[i] === '--images') out.images = list[++i];
    else if (list[i] === '--batch') out.batch = list[++i];
  }
  if (!out.images || !out.batch || !/^[a-z0-9-]{3,40}$/.test(out.batch)) {
    throw new Error('Cần --images <thư mục> và --batch <chữ thường, số, gạch ngang>');
  }
  return out;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

// Ngẫu nhiên có hạt giống: chạy lại cùng batch ra cùng kế hoạch.
function rng(seedText) {
  let seed = [...seedText].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

function buildPlan(batch, imagesDir) {
  const random = rng(batch);
  const pick = list => list[Math.floor(random() * list.length)];
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const groups = Object.keys(TEMPLATES);
  for (const group of groups) {
    for (const n of [1, 2, 3]) {
      if (!fs.existsSync(path.join(imagesDir, group, `${n}.jpg`))) throw new Error(`Thiếu ảnh ${group}/${n}.jpg`);
    }
  }
  const donors = DONORS.map((name, i) => ({ uid: `seed-donor-${String(i + 1).padStart(2, '0')}`, name }));
  const entries = [];
  let groupIndex = 0;
  const nextGroup = () => groups[(groupIndex++) % groups.length];
  const make = (stage, warehouseIndex, daysAgoRange) => {
    let group = nextGroup();
    // Phân phối một phần cần ít nhất 2 món để còn lại trong kho.
    while (stage === 'in_stock_partial' && TEMPLATES[group].quantity[0] < 2) group = nextGroup();
    const template = TEMPLATES[group];
    const id = randomUUID().toUpperCase();
    const hubIndex = warehouseIndex ?? int(0, 2);
    const quantity = int(...template.quantity);
    return {
      id, group, stage, warehouseId: warehouseIndex === null ? null : WAREHOUSES[warehouseIndex],
      hubId: HUBS[hubIndex], donor: pick(donors), template, quantity,
      deliveryMethod: random() < 0.85 ? 'drop_off' : 'pickup',
      createdAt: new Date(Date.now() - int(...daysAgoRange) * DAY - int(0, 600) * 60 * 1000),
      // Thực nhận: thường đủ; vài đơn thiếu 1 hoặc hơi cũ hơn khai báo.
      receivedQuantity: quantity > 2 && random() < 0.3 ? quantity - 1 : quantity,
      receiptCondition: random() < 0.2 ? 'minor-wear' : 'good',
      location: pick(LOCATIONS), rejectReason: pick(REJECT_REASONS),
    };
  };
  WAREHOUSES.forEach((_, w) => {
    for (const [stage, count] of PER_WAREHOUSE) {
      for (let i = 0; i < count; i += 1) {
        // Đơn càng đi xa trong quy trình thì gửi càng sớm.
        const days = stage === 'pending' ? [1, 3] : stage === 'rejected' || stage === 'approved' ? [3, 9]
          : stage === 'received' ? [6, 12] : [10, 24];
        entries.push(make(stage, w, days));
      }
    }
  });
  for (let i = 0; i < UNASSIGNED_PENDING; i += 1) entries.push(make('new', null, [0, 2]));
  const beneficiaries = BENEFICIARIES.map((b, i) => ({ ...b, warehouseId: WAREHOUSES[i % WAREHOUSES.length] }));
  return { donors, entries, beneficiaries };
}

function summarize(plan) {
  const table = {};
  for (const e of plan.entries) {
    const key = e.warehouseId || '(chưa gán kho)';
    table[key] = table[key] || {};
    table[key][e.stage] = (table[key][e.stage] || 0) + 1;
  }
  return table;
}

async function main() {
  const opts = args();
  loadEnvFile(path.join(__dirname, '..', '.env'));
  const imagesDir = path.resolve(opts.images);
  const plan = buildPlan(opts.batch, imagesDir);
  console.log(`Batch ${opts.batch}: ${plan.entries.length} đơn, ${plan.donors.length} người quyên góp mẫu, ${plan.beneficiaries.length} người thụ hưởng.`);
  console.table(summarize(plan));
  if (!opts.yes) {
    console.log('Dry run: chưa ghi gì. Thêm --yes để nạp thật.');
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
  if (opts.upload && (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET)) throw new Error('Thiếu cấu hình Cloudinary trong backend/.env');
  if (!opts.upload && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('--no-upload chỉ dùng với Firestore Emulator');

  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
  const { getAuth } = require('firebase-admin/auth');
  const cloudinary = require('cloudinary').v2;
  const { createDonationReviewApi } = require('../donation-review-api.cjs');
  const { createReceiptApi } = require('../receipt-api.cjs');
  const { createStockIntakeApi } = require('../stock-intake-api.cjs');
  const { createDistributionApi } = require('../distribution-api.cjs');
  const { createBeneficiariesApi } = require('../beneficiaries-api.cjs');

  initializeApp({ credential: applicationDefault(), projectId });
  if (opts.upload) cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
  const db = getFirestore();
  const auth = getAuth();
  const batch = opts.batch;
  const tag = `reshare-seed-${batch}`;
  const staffUid = `seed-${batch}`;
  const staffEmail = 'du-lieu-mau@reshare.invalid';

  // Chạy đúng code API thật, với "phiên" của nhân sự mẫu thay cho ID token.
  const verifyToken = async () => ({ uid: staffUid, email: staffEmail });
  const headers = { authorization: 'Bearer seed' };
  const ts = () => FieldValue.serverTimestamp();
  const reviewApi = createDonationReviewApi({ db, auth, verifyToken, serverTimestamp: ts });
  const receiptApi = createReceiptApi({ db, verifyToken, serverTimestamp: ts });
  const stockApi = createStockIntakeApi({ db, verifyToken, serverTimestamp: ts });
  const distributionApi = createDistributionApi({ db, verifyToken, serverTimestamp: ts });
  const beneficiariesApi = createBeneficiariesApi({ db, auth, verifyToken, serverTimestamp: ts });
  const version = async id => (await db.collection('donations').doc(id).get()).data().version || 1;

  const existing = await db.collection('donations').where('seedBatch', '==', batch).limit(1).get();
  if (!existing.empty) throw new Error(`Batch ${batch} đã có dữ liệu. Dọn trước bằng cleanup-demo-data.cjs hoặc dùng batch khác.`);

  const hubNames = new Map((await db.collection('hubs').get()).docs.map(doc => [doc.id, doc.data().name]));
  const staffRef = db.collection('staff_assignments').doc(staffUid);
  await staffRef.set({ role: 'system_admin', active: true, warehouseIds: [], displayName: 'Dữ liệu mẫu', email: staffEmail, seedBatch: batch });

  const counts = { donations: 0, images: 0, reviewed: 0, received: 0, stocked: 0, distributed: 0, beneficiaries: 0 };
  try {
    // 1. Người quyên góp mẫu (chỉ hồ sơ, không có tài khoản đăng nhập).
    for (const donor of plan.donors) {
      const slug = donor.uid.replace('seed-donor-', '');
      await db.collection('users').doc(donor.uid).set({
        id: donor.uid, email: `nguoi-quyen-gop-${slug}@reshare.invalid`, displayName: donor.name,
        phoneNumber: '', role: 'donor', createdAt: Timestamp.fromDate(new Date(Date.now() - 40 * DAY)), seedBatch: batch,
      });
    }

    // 2. Người thụ hưởng: tạo + duyệt qua API (System Admin).
    const beneficiaryIds = {};
    for (const b of plan.beneficiaries) {
      const created = await beneficiariesApi.handle('POST', '/v1/admin/beneficiaries', headers,
        { name: b.name, phone: b.phone, notes: b.notes, needs: b.needs, warehouseId: b.warehouseId });
      const id = created.body.beneficiary.id;
      await beneficiariesApi.handle('POST', `/v1/admin/beneficiaries/${id}/verify`, headers, { expectedVersion: 1, status: 'approved' });
      (beneficiaryIds[b.warehouseId] = beneficiaryIds[b.warehouseId] || []).push({ id, needs: b.needs });
      counts.beneficiaries += 1;
    }

    // 3. Đơn quyên góp như gửi từ app: ảnh lên Cloudinary + bản ghi lô ảnh + đơn pending.
    for (const e of plan.entries) {
      const assets = {};
      const publicIds = [];
      for (const n of [1, 2, 3]) {
        const publicId = `donations/${e.id}/${randomUUID()}`;
        if (opts.upload) {
          await cloudinary.uploader.upload(path.join(imagesDir, e.group, `${n}.jpg`), {
            public_id: publicId, type: 'authenticated', resource_type: 'image', overwrite: false, tags: [tag],
          });
        }
        assets[randomUUID()] = publicId;
        publicIds.push(publicId);
        counts.images += 1;
      }
      const createdMs = e.createdAt.getTime();
      await db.collection('image_upload_batches').doc(`donation_${e.id}`).set({
        ownerUid: e.donor.uid, purpose: 'donation', recordId: e.id, assets, createdAtMs: createdMs, updatedAtMs: createdMs, seedBatch: batch,
      });
      const hubName = hubNames.get(e.hubId) || null;
      const isPickup = e.deliveryMethod === 'pickup';
      await db.collection('donations').doc(e.id).set({
        id: e.id, donorId: e.donor.uid, title: e.template.title, description: e.template.description,
        category: e.template.category, condition: e.template.condition, status: 'pending',
        imageProvider: 'cloudinary', imagePublicIds: publicIds, createdAt: Timestamp.fromDate(e.createdAt),
        quantity: e.quantity, unitId: e.template.unit, hubId: e.hubId, ...(hubName ? { hubName } : {}),
        deliveryMethod: e.deliveryMethod, confirmationCode: `RS-${e.id.slice(0, 8)}`,
        statusNote: isPickup ? 'Chờ kho duyệt; nhận tận nơi chưa vận hành nên chưa có người đến lấy.'
          : `Chờ kho duyệt; điểm ${hubName || e.hubId} đang minh hoạ nên chưa mang đồ tới điểm này.`,
        donorConfirmedCategory: e.template.category, seedBatch: batch,
      });
      counts.donations += 1;
      process.stdout.write(`\rĐơn ${counts.donations}/${plan.entries.length}`);
    }
    console.log();

    // 4. Quy trình kho qua API thật.
    for (const e of plan.entries) {
      if (e.stage === 'new') continue;
      const base = `/v1/admin/donations/${e.id}`;
      await reviewApi.handle('POST', `${base}/assign-warehouse`, headers, { warehouseId: e.warehouseId, expectedVersion: await version(e.id) });
      if (e.stage === 'pending') continue;
      if (e.stage === 'rejected') {
        await reviewApi.handle('POST', `${base}/decide`, headers, { action: 'reject', publicMessage: e.rejectReason, expectedVersion: await version(e.id) });
        counts.reviewed += 1;
        continue;
      }
      await reviewApi.handle('POST', `${base}/decide`, headers, {
        action: 'approve', publicMessage: 'Cảm ơn bạn! Đơn đã được duyệt, kho sẽ liên hệ khi nhận đồ.', expectedVersion: await version(e.id),
      });
      counts.reviewed += 1;
      if (e.stage === 'approved') continue;

      await receiptApi.handle('POST', `${base}/receipt`, headers, {
        warehouseId: e.warehouseId, quantity: e.receivedQuantity, unitId: e.template.unit, conditionId: e.receiptCondition,
        note: e.receivedQuantity < e.quantity ? 'Thực nhận ít hơn khai báo 1 món.' : 'Đã kiểm, đủ số lượng.',
      });
      counts.received += 1;
      if (e.stage === 'received') continue;

      const receiptId = `rcp_${e.id}`;
      const stocked = await stockApi.handle('POST', `${base}/stock-in`, headers, {
        receiptId, idempotencyKey: `stk_${receiptId}`, location: e.location, note: '',
      });
      counts.stocked += 1;
      if (e.stage === 'in_stock') continue;

      const itemId = stocked.body.stockEntry.items[0].id;
      const item = (await db.collection('inventory').doc(itemId).get()).data();
      const candidates = beneficiaryIds[e.warehouseId] || [];
      const beneficiary = candidates.find(b => b.needs.includes(e.template.category)) || candidates[0];
      if (!beneficiary) throw new Error(`Kho ${e.warehouseId} chưa có người thụ hưởng`);
      // Phân phối một phần: đơn vị đếm lấy nửa (làm tròn xuống, tối thiểu 1, chừa lại ít nhất 1).
      const quantity = e.stage === 'in_stock_partial' && item.quantityAvailable > 1
        ? Math.max(1, Math.floor(item.quantityAvailable / 2)) : item.quantityAvailable;
      await distributionApi.handle('POST', '/v1/admin/distribution', headers, {
        warehouseId: e.warehouseId, itemId, beneficiaryId: beneficiary.id, quantity, handedOver: true,
        note: 'Bàn giao trực tiếp tại kho.', expectedVersion: item.version || 1, idempotencyKey: `seed-${randomUUID()}`,
      });
      counts.distributed += 1;
    }
  } finally {
    // Gỡ quyền nhân sự mẫu dù thành công hay lỗi giữa chừng.
    await staffRef.delete();
    console.log('Kết quả:', counts);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { TEMPLATES, buildPlan };
