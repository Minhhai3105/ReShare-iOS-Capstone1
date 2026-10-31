const { ApiError } = require('./image-api.cjs');

// Trần số document một truy vấn được kéo về. Vượt trần thì từ chối hẳn thay vì cắt bớt âm thầm:
// báo cáo hay biểu mẫu thiếu dòng mà không ai biết còn tệ hơn một lỗi nói rõ phải thu hẹp lại.
const DEFAULT_MAX_DOCS = 5000;

async function readCapped(query, maxDocs, message) {
  const snapshot = await query.limit(maxDocs + 1).get();
  if (snapshot.docs.length > maxDocs) throw new ApiError(422, message, 'VALIDATION');
  return snapshot.docs;
}

// Gộp nhiều truy vấn một-điều-kiện (không cần composite index), bỏ trùng, giữ thứ tự theo ID như
// khi quét cả collection để danh sách hiển thị không đổi thứ tự.
async function readUnion(queries, maxDocs, message) {
  const results = await Promise.all(queries.map(query => readCapped(query, maxDocs, message)));
  const byId = new Map(results.flat().map(doc => [doc.id, doc]));
  if (byId.size > maxDocs) throw new ApiError(422, message, 'VALIDATION');
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Chỉ mục tồn còn hàng: số mục cần đọc bám theo tồn hiện tại, không phình theo lịch sử nhập kho.
async function readInStock(db, maxDocs, message) {
  const inventory = db.collection('inventory');
  const docs = await readUnion([
    inventory.where('quantityAvailable', '>', 0),
    // Dữ liệu cũ chỉ có `available`. Có `quantityAvailable` dạng số thì field đó quyết định,
    // khớp đúng thứ tự ưu tiên lúc dựng dòng hiển thị.
    inventory.where('available', '>', 0),
  ], maxDocs, message);
  return docs.filter(doc => {
    const quantity = doc.data().quantityAvailable;
    return typeof quantity === 'number' ? quantity > 0 : true;
  });
}

// Đọc đúng các document được tham chiếu, thay vì quét cả collection để dựng bảng tra.
async function getByIds(db, collection, ids) {
  const refs = [...new Set(ids)]
    .filter(id => typeof id === 'string' && /^[^/]{1,1500}$/.test(id) && id !== '.' && id !== '..')
    .map(id => db.collection(collection).doc(id));
  const docs = [];
  for (let start = 0; start < refs.length; start += 300) {
    docs.push(...await db.getAll(...refs.slice(start, start + 300)));
  }
  return docs.filter(doc => doc.exists);
}

module.exports = { DEFAULT_MAX_DOCS, readCapped, readUnion, readInStock, getByIds };
