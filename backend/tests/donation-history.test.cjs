const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeDonationHistory, publicHistory } = require('../donation-history.cjs');

test('Legacy resubmission gaps are recovered without duplicating transitions or dropping private review notes', () => {
  const publicEvents = [{ version: 2, action: 'information' }, { version: 3, action: 'resubmit' }, { version: 4, action: 'approve' }];
  const privateEvents = [{ version: 2, action: 'information', internalNote: 'private', actorUid: 'staff' }, { version: 4, action: 'approve', reviewedBy: 'staff' }];
  const merged = mergeDonationHistory(publicEvents, privateEvents);
  assert.deepEqual(merged.map(event => event.version), [2, 3, 4]);
  assert.equal(merged[0].internalNote, 'private');
  assert.deepEqual(mergeDonationHistory(publicEvents, merged), merged);
  assert.deepEqual(publicHistory(merged), publicEvents);
  assert.deepEqual(mergeDonationHistory(undefined, null), []);
});
