// Firestore Emulator đóng transaction thua tranh chấp bằng INVALID_ARGUMENT
// "Transaction is invalid or closed". SDK (@google-cloud/firestore, isRetryableTransactionError)
// chỉ retry INVALID_ARGUMENT khi message khớp /transaction has expired/ — câu chữ của production —
// nên lỗi của emulator lọt thẳng ra ngoài thành lỗi thô, qua server.cjs là HTTP 500, trong khi
// request đó lẽ ra phải nhận 409 nghiệp vụ.
//
// Transaction bị đóng là transaction chưa commit, nên chạy lại toàn bộ là an toàn: lần chạy lại
// đọc trạng thái mới nhất và request thua tự nhận đúng lỗi nghiệp vụ. Chỉ bắt đúng chữ ký này;
// mọi lỗi khác (kể cả ABORTED mà SDK đã tự retry) vẫn ném nguyên vẹn, để không che lỗi thật.
const CLOSED_TRANSACTION = /transaction is invalid or closed/i;
const INVALID_ARGUMENT = 3;

function isClosedTransaction(error) {
  return error?.code === INVALID_ARGUMENT && CLOSED_TRANSACTION.test(String(error?.message || ''));
}

async function runTransaction(db, updateFunction, { maxAttempts = 4, delayMs = 40 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.runTransaction(updateFunction);
    } catch (error) {
      if (!isClosedTransaction(error) || attempt >= maxAttempts) throw error;
      // Lùi lại có jitter để hai request vừa đụng nhau không lặp lại đúng nhịp cũ.
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt + Math.floor(Math.random() * delayMs)));
    }
  }
}

module.exports = { runTransaction, isClosedTransaction };
