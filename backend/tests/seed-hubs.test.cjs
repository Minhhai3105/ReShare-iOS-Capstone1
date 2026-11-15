const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateHubs, planSeed } = require('../scripts/seed-hubs.cjs');

test('file Hub mẫu hợp lệ và mọi Hub đều được đánh dấu minh hoạ', () => {
  const hubs = validateHubs(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'hubs.seed.json'), 'utf8')));
  assert.deepEqual(hubs.map(hub => hub.id), ['hub-haichau', 'hub-nguhanhson', 'hub-lienchieu']);
  assert.ok(hubs.every(hub => hub.isDemo === true && hub.status === 'active'));
});

test('Hub sai dữ liệu bị từ chối trước khi ghi', () => {
  const hub = { id: 'hub-a', name: 'A', address: 'Đ/c', openHours: '8h-17h', latitude: 16, longitude: 108, isDemo: false };
  assert.equal(validateHubs([hub]).length, 1);
  assert.throws(() => validateHubs([]));
  assert.throws(() => validateHubs([hub, hub]), /id Hub/);
  assert.throws(() => validateHubs([{ ...hub, latitude: 200 }]), /Toạ độ/);
  assert.throws(() => validateHubs([{ ...hub, name: '' }]), /name/);
  assert.throws(() => validateHubs([{ ...hub, isDemo: 'yes' }]), /isDemo/);
  assert.throws(() => validateHubs([{ ...hub, status: 'open' }]), /status/);
});

test('chạy lại script không ghi đè Hub đã sửa trên Web Admin, trừ khi có --overwrite', () => {
  const hubs = validateHubs(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'hubs.seed.json'), 'utf8')));
  const existing = new Map([['hub-haichau', 4]]);
  const plan = planSeed(hubs, existing, { overwrite: false });
  assert.deepEqual(plan.skipped, ['hub-haichau']);
  assert.deepEqual(plan.write.map(item => [item.hub.id, item.version, item.isNew]), [['hub-nguhanhson', 1, true], ['hub-lienchieu', 1, true]]);
  const forced = planSeed(hubs, existing, { overwrite: true });
  assert.deepEqual(forced.skipped, []);
  assert.deepEqual(forced.write.find(item => item.hub.id === 'hub-haichau'), { hub: hubs[0], version: 5, isNew: false });
});
