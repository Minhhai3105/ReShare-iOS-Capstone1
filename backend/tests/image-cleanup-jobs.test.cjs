const test = require('node:test');
const assert = require('node:assert/strict');
const { cloudinaryCatalogImageDeleter } = require('../image-cleanup-jobs.cjs');

test('chỉ xoá ảnh Kho đồ 0đ và coi "not found" là đã xong', async () => {
  const calls = [];
  const results = { 'catalog_items/a': 'ok', 'catalog_items/b': 'not found', 'catalog_items/c': 'error' };
  const remove = cloudinaryCatalogImageDeleter({ uploader: { destroy: async (id, options) => { calls.push([id, options.type]); return { result: results[id] }; } } });
  await remove('donations/x/anh');
  await remove(42);
  assert.deepEqual(calls, [], 'không đụng ảnh đơn quyên góp hay ID lạ');
  await remove('catalog_items/a');
  await remove('catalog_items/b');
  await assert.rejects(remove('catalog_items/c'), /Cloudinary cleanup failed/);
  assert.deepEqual(calls.map(call => call[1]), ['upload', 'upload', 'upload']);
});
