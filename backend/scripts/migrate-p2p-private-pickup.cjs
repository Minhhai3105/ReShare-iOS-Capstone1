// Chuyển địa chỉ nhận đồ P2P khỏi bài công khai (xem p2p-pickup-migration.cjs).
// Chạy thử (mặc định, không ghi gì, chỉ in số lượng):
//   FIREBASE_PROJECT_ID=reshare-13234 node scripts/migrate-p2p-private-pickup.cjs
// Chạy thật — bắt buộc có file sao lưu nằm NGOÀI repo (file chứa địa chỉ thật, không được commit):
//   FIREBASE_PROJECT_ID=reshare-13234 node scripts/migrate-p2p-private-pickup.cjs --apply --backup ~/reshare-p2p-backup.json
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { migrateP2pPickup } = require('../p2p-pickup-migration.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function backupPathFrom(args) {
  const index = args.indexOf('--backup');
  const value = index >= 0 ? args[index + 1] : '';
  if (!value) throw new Error('--apply cần --backup <đường dẫn file JSON nằm ngoài repo>');
  const resolved = path.resolve(value.replace(/^~(?=$|\/)/, process.env.HOME || '~'));
  if (resolved === REPO_ROOT || resolved.startsWith(`${REPO_ROOT}${path.sep}`)) {
    throw new Error('File sao lưu chứa địa chỉ thật, phải nằm ngoài repo để không bị commit');
  }
  return resolved;
}

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const backupPath = apply ? backupPathFrom(args) : null;
  initializeApp({ credential: applicationDefault(), projectId });
  const result = await migrateP2pPickup(getFirestore(), {
    apply,
    // flag 'wx': không ghi đè bản sao lưu của lần chạy trước.
    backup: backupPath && (data => fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 })),
  });
  console.log(JSON.stringify({ projectId, ...result, backup: backupPath }, null, 2));
  if (!apply) console.log('Chạy thử: chưa ghi gì. Thêm --apply --backup <file> để chạy thật.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
