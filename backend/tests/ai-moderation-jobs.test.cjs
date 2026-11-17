const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiModerationJobs } = require('../ai-moderation-jobs.cjs');

test('AI kiểm duyệt nền: thiếu cấu hình không đọc DB, không tạo timer hoặc gọi dịch vụ', async () => {
  const jobs = createAiModerationJobs({ db: { collection() { assert.fail('không được đọc DB'); } }, moderator: { enabled: false } });
  jobs.start();
  assert.deepEqual(await jobs.runOnce(), { enabled: false, skipped: true, checked: 0 });
  assert.equal((await jobs.checkListing('item')).enabled, false);
  jobs.stop();
});
