const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createInventoryEvents } = require('../inventory-events.cjs');
const { inventoryRevision } = require('../inventory-revision.cjs');

function setup(options = {}) {
  const values = new Map([['staff_assignments/staff', { active: true, role: 'warehouse_admin', warehouseIds: ['a'] }]]);
  const listeners = new Map();
  const snapshot = key => ({ exists: values.has(key), data: () => values.get(key) });
  const db = { collection: name => ({ doc: id => {
    const key = `${name}/${id}`;
    return { get: async () => snapshot(key), onSnapshot: next => {
      const set = listeners.get(key) || new Set(); listeners.set(key, set); set.add(next);
      queueMicrotask(() => { if (set.has(next)) next(snapshot(key)); });
      return () => set.delete(next);
    } };
  } }) };
  const api = createInventoryEvents({ db, verifyToken: async token => { if (token !== 'valid') throw new Error('invalid'); return { uid: 'staff' }; }, ...options });
  function response() {
    const result = new EventEmitter();
    result.messages = []; result.writableLength = 0;
    result.writeHead = status => { result.status = status; };
    result.write = value => { result.messages.push(value); return true; };
    result.end = () => { if (!result.closed) { result.closed = true; result.emit('close'); } };
    return result;
  }
  const request = warehouseId => ({ url: `/v1/admin/inventory/events?warehouseId=${warehouseId}`, headers: { authorization: 'Bearer valid' } });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const emit = key => { for (const next of [...(listeners.get(key) || [])]) next(snapshot(key)); };
  return { api, values, listeners, response, request, flush, emit };
}

test('Inventory stream rejects missing sessions and unauthorized/all-warehouse scopes', async () => {
  const s = setup();
  await assert.rejects(s.api.open({ url: '/', headers: {} }, s.response()), { status: 401 });
  await assert.rejects(s.api.open(s.request('b'), s.response()), { status: 403 });
  await assert.rejects(s.api.open(s.request(''), s.response()), { status: 403 });
});

test('Two viewers share one revision listener; every revision notifies both and last close unsubscribes', async () => {
  const s = setup(), first = s.response(), second = s.response();
  try {
    await s.api.open(s.request('a'), first); await s.api.open(s.request('a'), second); await s.flush();
    assert.equal(s.listeners.get('warehouse_inventory_updates/wh_a').size, 1);
    s.values.set('warehouse_inventory_updates/wh_a', { revision: 7 }); s.emit('warehouse_inventory_updates/wh_a');
    const revision = inventoryRevision('wh_a', { exists: true, data: () => ({ revision: 7 }) });
    assert.ok(first.messages.some(message => message.includes(JSON.stringify({ revision }))));
    assert.ok(second.messages.some(message => message.includes(JSON.stringify({ revision }))));
    const count = first.messages.length;
    s.emit('warehouse_inventory_updates/wh_a');
    assert.equal(first.messages.length, count, 'An identical snapshot does not notify viewers twice');
    first.end(); assert.equal(s.listeners.get('warehouse_inventory_updates/wh_a').size, 1);
    second.end(); assert.equal(s.listeners.get('warehouse_inventory_updates/wh_a').size, 0);
  } finally { first.end(); second.end(); }
});

test('Revoking assignment closes the stream immediately and emits no inventory contents', async () => {
  const s = setup(), response = s.response();
  try {
    await s.api.open(s.request('a'), response); await s.flush();
    s.values.set('staff_assignments/staff', { active: false }); s.emit('staff_assignments/staff');
    assert.equal(response.closed, true);
    assert.ok(response.messages.some(message => message.includes('event: access_lost')));
    assert.ok(response.messages.every(message => !message.includes('quantityAvailable')));
    assert.equal(s.listeners.get('warehouse_inventory_updates/wh_a').size, 0);
  } finally { response.end(); }
});

test('RC1D-144: mỗi tài khoản giữ tối đa N luồng cùng lúc; đóng một luồng thì mở lại được', async () => {
  const s = setup({ maxConnectionsPerUser: 2 });
  const first = s.response(), second = s.response(), third = s.response(), fourth = s.response();
  try {
    await s.api.open(s.request('a'), first);
    await s.api.open(s.request('a'), second);
    await assert.rejects(s.api.open(s.request('a'), third), error => error.status === 429 && error.retryAfterSeconds > 0);
    assert.equal(third.status, undefined, 'luồng bị từ chối không được mở header SSE');
    first.end();
    await s.api.open(s.request('a'), fourth);
    assert.equal(fourth.status, 200);
  } finally { first.end(); second.end(); third.end(); fourth.end(); }
});

test('RC1D-144: hai lần mở đồng thời của cùng tài khoản không cùng lọt qua giới hạn', async () => {
  const s = setup({ maxConnectionsPerUser: 1 });
  const first = s.response(), second = s.response();
  try {
    const results = await Promise.allSettled([s.api.open(s.request('a'), first), s.api.open(s.request('a'), second)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.status, 429);
  } finally { first.end(); second.end(); }
});

test('RC1D-144: mở lại quá nhanh bị 429 kèm thời gian chờ, sang phút sau mở lại được', async () => {
  let time = 0;
  const s = setup({ reconnectsPerMinute: 2, now: () => time });
  const responses = [s.response(), s.response(), s.response(), s.response()];
  try {
    await s.api.open(s.request('a'), responses[0]); responses[0].end();
    await s.api.open(s.request('a'), responses[1]); responses[1].end();
    await assert.rejects(s.api.open(s.request('a'), responses[2]), error => error.status === 429 && error.retryAfterSeconds === 60);
    time = 60000;
    await s.api.open(s.request('a'), responses[3]);
    assert.equal(responses[3].status, 200);
  } finally { responses.forEach(response => response.end()); }
});
