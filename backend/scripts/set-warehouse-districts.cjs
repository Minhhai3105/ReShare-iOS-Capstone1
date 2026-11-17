// Gán các quận mà mỗi kho phụ trách (`warehouses/{id}.districts`) cho trang Kho đồ 0đ trên Web Admin:
// Warehouse Admin chỉ thấy và gỡ được bài P2P thuộc các quận này (backend/p2p-listings-api.cjs).
// Quận nào chưa kho nào phụ trách thì bài ở đó chỉ System Admin thấy.
//
// Chạy (mặc định chỉ in kế hoạch, KHÔNG ghi):
//   node --env-file=.env scripts/set-warehouse-districts.cjs
//   node --env-file=.env scripts/set-warehouse-districts.cjs --yes                 # ghi
//   node --env-file=.env scripts/set-warehouse-districts.cjs --set wh_dn_01="Hải Châu,Thanh Khê" --yes
//
// Không có --set thì suy từ tên kho dạng "Kho <tên quận>" (vd. "Kho Hải Châu" → ["Hải Châu"]).
// Kho đã có `districts` được bỏ qua, trừ khi chạy với --overwrite.

// Đúng danh sách quận app iOS cho người đăng chọn (CatalogItemPublishView.swift).
const DA_NANG_DISTRICTS = Object.freeze(['Hải Châu', 'Sơn Trà', 'Ngũ Hành Sơn', 'Thanh Khê', 'Cẩm Lệ', 'Liên Chiểu']);

function districtKey(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

function canonicalDistrict(value) {
  return DA_NANG_DISTRICTS.find(district => districtKey(district) === districtKey(value)) || null;
}

// "--set id=Quận A,Quận B" (có thể lặp lại) → Map(id → [quận chuẩn]).
function parseOverrides(argv) {
  const overrides = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--set') continue;
    const value = argv[index + 1] || '';
    const separator = value.indexOf('=');
    if (separator <= 0) throw new Error(`--set cần dạng <warehouseId>=<quận,quận>: ${JSON.stringify(value)}`);
    const id = value.slice(0, separator).trim();
    const districts = value.slice(separator + 1).split(',').map(item => item.trim()).filter(Boolean);
    const canonical = districts.map(district => {
      const match = canonicalDistrict(district);
      if (!match) throw new Error(`Quận không có trong danh sách của app: ${JSON.stringify(district)}`);
      return match;
    });
    if (!canonical.length) throw new Error(`--set ${id} chưa có quận nào`);
    overrides.set(id, [...new Set(canonical)]);
    index += 1;
  }
  return overrides;
}

// Kho nào được ghi quận nào. `warehouses`: [{ id, name, districts }].
function planDistricts(warehouses, overrides, { overwrite }) {
  const write = [];
  const skipped = [];
  const unknown = [...overrides.keys()].filter(id => !warehouses.some(warehouse => warehouse.id === id));
  if (unknown.length) throw new Error(`Không có kho: ${unknown.join(', ')}`);
  for (const warehouse of warehouses) {
    const hasDistricts = Array.isArray(warehouse.districts) && warehouse.districts.length > 0;
    let districts = overrides.get(warehouse.id) || null;
    if (!districts) {
      const fromName = canonicalDistrict(String(warehouse.name || '').replace(/^\s*kho\s+/i, ''));
      districts = fromName ? [fromName] : null;
    }
    if (!districts) { skipped.push({ id: warehouse.id, reason: 'không suy được quận từ tên, dùng --set' }); continue; }
    if (hasDistricts && !overwrite) { skipped.push({ id: warehouse.id, reason: `đã có ${warehouse.districts.join(', ')} (dùng --overwrite)` }); continue; }
    write.push({ id: warehouse.id, name: warehouse.name || '', districts });
  }
  const covered = new Set(write.flatMap(item => item.districts).concat(
    warehouses.filter(warehouse => !write.some(item => item.id === warehouse.id))
      .flatMap(warehouse => Array.isArray(warehouse.districts) ? warehouse.districts : [])).map(districtKey));
  const uncovered = DA_NANG_DISTRICTS.filter(district => !covered.has(districtKey(district)));
  return { write, skipped, uncovered };
}

async function main() {
  const argv = process.argv.slice(2);
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
  const overrides = parseOverrides(argv);
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const snapshot = await db.collection('warehouses').limit(100).get();
  const warehouses = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name, districts: doc.data().districts }));
  const plan = planDistricts(warehouses, overrides, { overwrite: argv.includes('--overwrite') });
  for (const item of plan.write) console.log(`Ghi  ${item.id} (${item.name}): ${item.districts.join(', ')}`);
  for (const item of plan.skipped) console.log(`Bỏ qua ${item.id}: ${item.reason}`);
  console.log(`Quận chưa kho nào phụ trách (chỉ System Admin thấy bài ở đây): ${plan.uncovered.join(', ') || '(không có)'}`);
  if (!argv.includes('--yes')) {
    console.log('Chưa ghi gì. Chạy lại với --yes để ghi.');
    return;
  }
  const batch = db.batch();
  for (const item of plan.write) {
    batch.update(db.collection('warehouses').doc(item.id), { districts: item.districts, districtsUpdatedAt: FieldValue.serverTimestamp() });
  }
  if (plan.write.length) await batch.commit();
  console.log(`Đã ghi ${plan.write.length} kho.`);
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { DA_NANG_DISTRICTS, canonicalDistrict, parseOverrides, planDistricts };
