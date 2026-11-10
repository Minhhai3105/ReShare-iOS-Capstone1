// Nạp danh sách điểm tiếp nhận (Hub) vào Firestore từ hubs.seed.json bằng Admin SDK.
// App iOS đọc collection `hubs` (rules chỉ cho đọc), chiến dịch chọn Hub từ đây.
//
// Chạy:  FIREBASE_PROJECT_ID=<project> GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
//        node scripts/seed-hubs.cjs [--dry-run]
//
// Chạy lại an toàn: ghi đè các field mô tả Hub, giữ nguyên createdAt. Hub có "isDemo": true sẽ
// hiện nhãn "minh hoạ" trên app — chỉ bỏ cờ này khi điểm đó đã tiếp nhận đồ thật.
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
  const batch = db.batch();
  for (const hub of hubs) {
    const ref = db.collection('hubs').doc(hub.id);
    const existing = await ref.get();
    batch.set(ref, {
      ...hub, updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  }
  await batch.commit();
  console.log(`Đã nạp ${hubs.length} Hub: ${hubs.map(hub => hub.id).join(', ')}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { validateHubs };
