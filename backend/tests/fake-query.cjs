// Truy vấn giả lập cho fake db trong unit test: chỉ đủ các phép API đang dùng (==, in, >, >=, <,
// limit) và so sánh như Firestore — khác kiểu dữ liệu thì không khớp điều kiện (Date không bao giờ
// "lớn hơn" chuỗi), để test không dễ dãi hơn Firestore thật.
function compare(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return null;
}

const MATCH = {
  '==': (a, b) => compare(a, b) === 0,
  in: (a, list) => list.some(b => compare(a, b) === 0),
  '>': (a, b) => { const c = compare(a, b); return c !== null && c > 0; },
  '>=': (a, b) => { const c = compare(a, b); return c !== null && c >= 0; },
  '<': (a, b) => { const c = compare(a, b); return c !== null && c < 0; },
};

// `reads` ghi lại mỗi lần đọc để test chứng minh được API không quét cả collection.
function createQuery(name, documents, snapshot, reads, filters = [], max = Infinity) {
  return {
    where(field, op, value) {
      if (!MATCH[op]) throw new Error(`fake-query không hỗ trợ toán tử ${op}`);
      return createQuery(name, documents, snapshot, reads, [...filters, [field, op, value]], max);
    },
    limit(count) {
      return createQuery(name, documents, snapshot, reads, filters, count);
    },
    async get() {
      const docs = [];
      for (const [key, data] of documents.entries()) {
        const id = key.slice(name.length + 1);
        if (!key.startsWith(`${name}/`) || id.includes('/')) continue;
        if (filters.every(([field, op, value]) => MATCH[op](data[field], value))) docs.push(snapshot(id, data));
      }
      const page = docs.slice(0, max);
      reads.push({ collection: name, kind: filters.length ? 'query' : 'scan', count: page.length });
      return { docs: page, empty: page.length === 0 };
    },
  };
}

function getAll(reads) {
  return async (...refs) => {
    for (const ref of refs) reads.push({ collection: ref.key.split('/')[0], kind: 'lookup', count: 1 });
    return Promise.all(refs.map(ref => ref.get()));
  };
}

module.exports = { createQuery, getAll };
