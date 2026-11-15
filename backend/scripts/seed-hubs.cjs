// Nạp danh sách điểm tiếp nhận (Hub) vào Firestore từ hubs.seed.json bằng Admin SDK.
// App iOS đọc collection `hubs` (rules chỉ cho đọc), chiến dịch chọn Hub từ đây.
//
// Chạy:  FIREBASE_PROJECT_ID=<project> GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
//        node scripts/seed-hubs.cjs [--dry-run] [--overwrite]
//
// Từ 15/11/2026 Hub được quản lý trên Web Admin (backend/hubs-api.cjs). Script này chỉ còn dùng để
// khởi tạo: mặc định CHỈ tạo Hub chưa có, bỏ qua Hub đã có để không xoá mất sửa đổi làm trên web.
// `--overwrite` ghi đè các field mô tả như trước (giữ createdAt, tăng version để form web đang mở
// nhận lỗi "đã thay đổi" thay vì ghi đè ngược lại). Hub có "isDemo": true hiện nhãn "minh hoạ" trên
// app — chỉ bỏ cờ này khi điểm đó đã tiếp nhận đồ thật.
const fs = require('node:fs');
const path = require('node:path');

const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;

function validateHubs(hubs) {
  if (!Array.isArray(hubs) || !hubs.length) throw new Error('hubs.seed.json phải là mảng có ít nhất một Hub');
  const ids = new Set();
  for (const hub of hubs) {
    const label = JSON.stringify(hub?.id);
    if (typeof hub?.id !== 'string' || !VALID_ID.test(hub.id) || ids.has(hub.id)) throw new Error(`id Hub không hợp lệ: ${label}`);
    ids.add(hub.id);
    for (const key of ['name', 'address', 'openHours']) {
      if (typeof hub[key] !== 'string' || !hub[key].trim() || hub[key].length > 200) throw new Error(`${key} không hợp lệ ở Hub ${label}`);
    }
    if (typeof hub.latitude !== 'number' || hub.latitude < -90 || hub.latitude > 90 ||
        typeof hub.longitude !== 'number' || hub.longitude < -180 || hub.longitude > 180) {
      throw new Error(`Toạ độ không hợp lệ ở Hub ${label}`);
    }
    if (typeof hub.isDemo !== 'boolean') throw new Error(`isDemo phải là true/false ở Hub ${label}`);
    if (hub.status !== undefined && !['active', 'inactive'].includes(hub.status)) throw new Error(`status không hợp lệ ở Hub ${label}`);
  }
  return hubs.map(hub => ({
    id: hub.id, name: hub.name.trim(), address: hub.address.trim(), openHours: hub.openHours.trim(),
    latitude: hub.latitude, longitude: hub.longitude, isDemo: hub.isDemo, status: hub.status || 'active',
  }));
}

async function main() {
  const hubs = validateHubs(JSON.parse(fs.readFileSync(path.join(__dirname, 'hubs.seed.json'), 'utf8')));
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(hubs, null, 2));
    return;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const existing = new Map();
  for (const hub of hubs) {
    const snapshot = await db.collection('hubs').doc(hub.id).get();
    if (snapshot.exists) existing.set(hub.id, snapshot.data().version || 1);
  }
  const plan = planSeed(hubs, existing, { overwrite: process.argv.includes('--overwrite') });
  const batch = db.batch();
  for (const { hub, version, isNew } of plan.write) {
    batch.set(db.collection('hubs').doc(hub.id), {
      ...hub, version, updatedAt: FieldValue.serverTimestamp(),
      ...(isNew ? { createdAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
  }
  if (plan.write.length) await batch.commit();
  console.log(`Đã ghi ${plan.write.length} Hub: ${plan.write.map(item => item.hub.id).join(', ') || '(không có)'}`);
  if (plan.skipped.length) {
    console.log(`Bỏ qua ${plan.skipped.length} Hub đã có (sửa trên Web Admin, hoặc chạy lại với --overwrite): ${plan.skipped.join(', ')}`);
  }
}

// Hub nào được ghi: mặc định chỉ Hub chưa có; --overwrite thì ghi cả Hub đã có và tăng version.
function planSeed(hubs, existingVersions, { overwrite }) {
  const write = [];
  const skipped = [];
  for (const hub of hubs) {
    if (!existingVersions.has(hub.id)) write.push({ hub, version: 1, isNew: true });
    else if (overwrite) write.push({ hub, version: existingVersions.get(hub.id) + 1, isNew: false });
    else skipped.push(hub.id);
  }
  return { write, skipped };
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { validateHubs, planSeed };
