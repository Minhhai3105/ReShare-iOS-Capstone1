const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiError } = require('../image-api.cjs');
const { errorBody } = require('../error-body.cjs');

test('Lỗi 500 không lộ code/details nội bộ của Firestore', () => {
  const firestoreError = Object.assign(new Error('9 FAILED_PRECONDITION: The query requires an index.'), {
    code: 9, details: 'The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/reshare-13234/...',
  });
  assert.deepEqual(errorBody(firestoreError, 500), { message: 'Internal server error' });
});

test('Lỗi nghiệp vụ (ApiError) vẫn giữ code và details cho client', () => {
  const error = new ApiError(409, 'Tồn mới: 1 chiếc', 'STOCK_CONFLICT', { item: { id: 'inv-1' } });
  assert.deepEqual(errorBody(error, 409), { message: 'Tồn mới: 1 chiếc', code: 'STOCK_CONFLICT', details: { item: { id: 'inv-1' } } });
});
