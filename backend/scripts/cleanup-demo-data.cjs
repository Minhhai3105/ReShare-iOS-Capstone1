// Dọn sạch một đợt dữ liệu mẫu do seed-demo-data.cjs tạo: Firestore + ảnh Cloudinary.
// Nhận diện bằng `seedBatch` (đơn, người quyên góp mẫu, lô ảnh) và nhân sự mẫu `seed-<batch>` (mọi
// bản ghi do API kho tạo: biến động kho, phiếu xuất, người thụ hưởng, nhật ký người thụ hưởng).
//
// Chạy (từ thư mục backend):
//   FIREBASE_PROJECT_ID=<project> GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
//   node scripts/cleanup-demo-data.cjs --batch demo-2026-11-14 [--yes]
// Không có --yes thì chỉ đếm, không xoá.
const path = require('node:path');
const fs = require('node:fs');

function args() {
  const out = { yes: process.argv.includes('--yes') };
  const i = process.argv.indexOf('--batch');
  out.batch = i > 0 ? process.argv[i + 1] : '';
  if (!/^[a-z0-9-]{3,40}$/.test(out.batch || '')) throw new Error('Cần --batch <tên đợt>');
  return out;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

async function main() {
  const { batch, yes } = args();
  loadEnvFile(path.join(__dirname, '..', '.env'));
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const staffUid = `seed-${batch}`;

  const refs = new Map();
  const add = (label, docRefs) => { refs.set(label, [...(refs.get(label) || []), ...docRefs]); };
  const byQuery = async (label, query) => add(label, (await query.get()).docs.map(doc => doc.ref));

  const donations = (await db.collection('donations').where('seedBatch', '==', batch).get()).docs;
  const donationIds = donations.map(doc => doc.id);
  add('donations', donations.map(doc => doc.ref));
  for (const id of donationIds) {
    for (const [label, ref] of [
      ['donation_reviews', db.collection('donation_reviews').doc(id)],
      ['receipts', db.collection('receipts').doc(`rcp_${id}`)],
      ['stock_entries', db.collection('stock_entries').doc(`ste_rcp_${id}`)],
      ['image_upload_batches', db.collection('image_upload_batches').doc(`donation_${id}`)],
    ]) {
      if ((await ref.get()).exists) add(label, [ref]);
    }
  }
  for (let i = 0; i < donationIds.length; i += 30) {
    await byQuery('inventory', db.collection('inventory').where('donationId', 'in', donationIds.slice(i, i + 30)));
  }
  await byQuery('inventory_movements', db.collection('inventory_movements').where('actorUid', '==', staffUid));
  await byQuery('distribution_vouchers', db.collection('distribution_vouchers').where('createdByUid', '==', staffUid));
  await byQuery('beneficiary_audit', db.collection('beneficiary_audit').where('actorUid', '==', staffUid));
  await byQuery('beneficiaries', db.collection('beneficiaries').where('createdByUid', '==', staffUid));
  await byQuery('users', db.collection('users').where('seedBatch', '==', batch));
  const staffRef = db.collection('staff_assignments').doc(staffUid);
  if ((await staffRef.get()).exists) add('staff_assignments', [staffRef]);

  const summary = Object.fromEntries([...refs].map(([label, list]) => [label, list.length]));
  console.log(`Batch ${batch}:`, summary);

  let images = 0;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  // Chạy trên Firestore Emulator thì không đụng Cloudinary thật.
  const cloudinary = !process.env.FIRESTORE_EMULATOR_HOST && CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET
    ? require('cloudinary').v2 : null;
  if (cloudinary) cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
  if (!yes) {
    console.log('Chưa xoá gì. Thêm --yes để xoá cả Firestore lẫn ảnh Cloudinary (tag reshare-seed-' + batch + ').');
    return;
  }

  for (const [label, list] of refs) {
    for (let i = 0; i < list.length; i += 400) {
      const writes = db.batch();
      for (const ref of list.slice(i, i + 400)) writes.delete(ref);
      await writes.commit();
    }
    console.log(`Đã xoá ${list.length} ${label}`);
  }
  if (cloudinary) {
    // Mỗi lần xoá tối đa 100 ảnh theo tag; lặp tới khi hết.
    for (let round = 0; round < 50; round += 1) {
      const result = await cloudinary.api.delete_resources_by_tag(`reshare-seed-${batch}`, { type: 'authenticated', resource_type: 'image' });
      const deleted = Object.keys(result.deleted || {}).length;
      images += deleted;
      if (!result.partial && deleted === 0) break;
      if (!result.partial) break;
    }
    console.log(`Đã xoá ${images} ảnh Cloudinary`);
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log('Đang chạy trên Firestore Emulator: bỏ qua Cloudinary.');
  } else {
    console.log('Thiếu cấu hình Cloudinary trong backend/.env: chưa xoá ảnh.');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
