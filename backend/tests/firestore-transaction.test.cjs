const test = require('node:test');
const assert = require('node:assert/strict');
const { runTransaction, isClosedTransaction } = require('../firestore-transaction.cjs');
const { ApiError } = require('../image-api.cjs');

// Đúng chữ ký emulator đã trả trong lần fail thật của test US10 (gRPC code 3).
const closedError = () => Object.assign(new Error('3 INVALID_ARGUMENT: Transaction is invalid or closed.'), { code: 3 });

// db giả: ném lần lượt các lỗi trong `failures`, hết lỗi thì chạy hàm cập nhật thật.
function fakeDb(failures) {
  const queue = [...failures];
  return {
    calls: 0,
    async runTransaction(fn) {
      this.calls += 1;
      if (queue.length) throw queue.shift();
      return fn('tx');
    },
  };
}

const fast = { delayMs: 0 };

test('transaction bị emulator đóng thì chạy lại và trả kết quả của lần thành công', async () => {
  const db = fakeDb([closedError(), closedError()]);
  const result = await runTransaction(db, async tx => `ok:${tx}`, fast);
  assert.equal(result, 'ok:tx');
  assert.equal(db.calls, 3);
});

test('lần chạy lại gặp lỗi nghiệp vụ thì ném đúng lỗi nghiệp vụ đó — request thua nhận 409', async () => {
  // Mô phỏng đúng US10: lần đầu bị đóng, lần chạy lại đọc thấy đơn đã được quyết định.
  const db = fakeDb([closedError()]);
  await assert.rejects(
    runTransaction(db, async () => { throw new ApiError(409, 'Donation already decided'); }, fast),
    { status: 409 },
  );
  assert.equal(db.calls, 2);
});

test('hết số lần thử thì ném lại đúng lỗi gốc, không nuốt lỗi', async () => {
  const db = fakeDb([closedError(), closedError(), closedError(), closedError(), closedError()]);
  await assert.rejects(runTransaction(db, async () => 'never', { ...fast, maxAttempts: 4 }),
    error => isClosedTransaction(error));
  assert.equal(db.calls, 4);
});

test('không retry lỗi khác — kể cả ABORTED, vì SDK đã tự retry nó rồi', async () => {
  const cases = [
    new ApiError(409, 'Version conflict'),
    Object.assign(new Error('10 ABORTED: Too much contention'), { code: 10 }),
    Object.assign(new Error('3 INVALID_ARGUMENT: Invalid document path'), { code: 3 }),
    new TypeError('bug thật trong code'),
  ];
  for (const error of cases) {
    const db = fakeDb([error]);
    await assert.rejects(runTransaction(db, async () => 'never', fast), error);
    assert.equal(db.calls, 1, `không được retry: ${error.message}`);
  }
});

test('nhận diện chữ ký lỗi chặt chẽ: đúng mã và đúng câu chữ mới tính', () => {
  assert.equal(isClosedTransaction(closedError()), true);
  assert.equal(isClosedTransaction({ code: 10, message: 'Transaction is invalid or closed.' }), false);
  assert.equal(isClosedTransaction({ code: 3, message: 'The referenced transaction has expired' }), false);
  assert.equal(isClosedTransaction(null), false);
});
