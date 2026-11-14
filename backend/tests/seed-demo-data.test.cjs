const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TEMPLATES, buildPlan } = require('../scripts/seed-demo-data.cjs');

// Thư mục ảnh giả: mỗi nhóm 3 file rỗng, đủ để buildPlan kiểm sự tồn tại.
function fakeImages() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-images-'));
  for (const group of Object.keys(TEMPLATES)) {
    fs.mkdirSync(path.join(dir, group));
    for (const n of [1, 2, 3]) fs.writeFileSync(path.join(dir, group, `${n}.jpg`), '');
  }
  return dir;
}

test('kế hoạch dữ liệu mẫu: đủ trạng thái cho cả 3 kho, mã đơn đúng định dạng backend chấp nhận', () => {
  const plan = buildPlan('demo-test', fakeImages());
  assert.equal(plan.entries.length, 43);
  for (const warehouseId of ['wh_dn_01', 'wh_dn_02', 'wh_dn_03']) {
    const stages = plan.entries.filter(e => e.warehouseId === warehouseId).map(e => e.stage);
    assert.equal(stages.length, 13);
    for (const stage of ['pending', 'rejected', 'approved', 'received', 'in_stock_partial', 'in_stock', 'distributed']) {
      assert.ok(stages.includes(stage), `${warehouseId} thiếu ${stage}`);
    }
  }
  assert.equal(plan.entries.filter(e => e.warehouseId === null).length, 4, '4 đơn mới chưa gán kho');
  // image-api.cjs RECORD_ID: UUID; app iOS dùng UUID viết hoa.
  const uuid = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
  assert.ok(plan.entries.every(e => uuid.test(e.id)));
  assert.equal(new Set(plan.entries.map(e => e.id)).size, plan.entries.length);
  assert.ok(plan.entries.filter(e => e.stage === 'in_stock_partial').every(e => e.quantity >= 2), 'phân phối một phần cần ≥ 2 món');
  assert.ok(plan.entries.every(e => e.receivedQuantity >= 1 && e.receivedQuantity <= e.quantity));
  assert.ok(plan.entries.every(e => ['piece', 'kg', 'bag', 'box', 'set'].includes(e.template.unit)));
  assert.equal(plan.beneficiaries.length, 6);
});

test('thiếu ảnh của một nhóm thì dừng trước khi ghi gì', () => {
  const dir = fakeImages();
  fs.rmSync(path.join(dir, 'chan', '2.jpg'));
  assert.throws(() => buildPlan('demo-test', dir), /Thiếu ảnh chan\/2\.jpg/);
});
