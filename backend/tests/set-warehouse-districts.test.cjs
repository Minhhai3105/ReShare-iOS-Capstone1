const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalDistrict, parseOverrides, planDistricts } = require('../scripts/set-warehouse-districts.cjs');

const warehouses = [
  { id: 'wh_dn_01', name: 'Kho Hải Châu' },
  { id: 'wh_dn_02', name: 'Kho Ngũ Hành Sơn' },
  { id: 'wh_dn_03', name: 'Kho Liên Chiểu', districts: ['Liên Chiểu'] },
  { id: 'wh_x', name: 'Kho trung tâm' },
];

test('Gán quận cho kho: suy từ tên "Kho <quận>", bỏ qua kho đã có quận và kho không suy được', () => {
  const plan = planDistricts(warehouses, new Map(), { overwrite: false });
  assert.deepEqual(plan.write, [
    { id: 'wh_dn_01', name: 'Kho Hải Châu', districts: ['Hải Châu'] },
    { id: 'wh_dn_02', name: 'Kho Ngũ Hành Sơn', districts: ['Ngũ Hành Sơn'] },
  ]);
  assert.deepEqual(plan.skipped.map(item => item.id), ['wh_dn_03', 'wh_x']);
  // Liên Chiểu vẫn được tính là đã có kho phụ trách dù bị bỏ qua.
  assert.deepEqual(plan.uncovered, ['Sơn Trà', 'Thanh Khê', 'Cẩm Lệ']);
});

test('Gán quận cho kho: --set ghi đè suy luận, --overwrite ghi cả kho đã có quận', () => {
  const overrides = parseOverrides(['--set', 'wh_dn_01=hải châu, Thanh Khê', '--yes', '--set', 'wh_x=Cẩm Lệ']);
  assert.deepEqual([...overrides], [['wh_dn_01', ['Hải Châu', 'Thanh Khê']], ['wh_x', ['Cẩm Lệ']]]);
  const plan = planDistricts(warehouses, overrides, { overwrite: true });
  assert.deepEqual(plan.write.map(item => [item.id, item.districts]), [
    ['wh_dn_01', ['Hải Châu', 'Thanh Khê']], ['wh_dn_02', ['Ngũ Hành Sơn']], ['wh_dn_03', ['Liên Chiểu']], ['wh_x', ['Cẩm Lệ']],
  ]);
  assert.deepEqual(plan.uncovered, ['Sơn Trà']);
});

test('Gán quận cho kho: từ chối quận ngoài danh sách của app và kho không tồn tại', () => {
  assert.equal(canonicalDistrict('HẢI CHÂU'), 'Hải Châu');
  assert.equal(canonicalDistrict('Quận 1'), null);
  assert.throws(() => parseOverrides(['--set', 'wh_dn_01=Quận 1']), /không có trong danh sách/);
  assert.throws(() => parseOverrides(['--set', 'wh_dn_01']), /cần dạng/);
  assert.throws(() => planDistricts(warehouses, new Map([['wh_khong_co', ['Hải Châu']]]), { overwrite: false }), /Không có kho/);
});
