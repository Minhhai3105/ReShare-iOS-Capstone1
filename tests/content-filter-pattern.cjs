// Sinh regex lọc từ ngữ cho firestore.rules từ danh sách trong ContentFilter.swift.
//
// Rules không có hàm chuẩn hoá Unicode, nên cùng một chữ "é" có thể tới dưới dạng dựng sẵn (NFC, U+00E9)
// hoặc tổ hợp (NFD, "e" + U+0301), kể cả dạng nửa dựng ("ô" + dấu huyền). App chuẩn hoá NFC trước khi
// lọc; ở Rules ta liệt kê mọi cách viết tương đương chính tắc của từng chữ có dấu.
// Chữ hoa/thường do cờ (?i) lo. Dấu tổ hợp viết bằng \x{...} để không có ký tự vô hình trong rules.

const COMBINING = /^\p{M}$/u;

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(rest => [item, ...rest]));
}

// Mọi chuỗi (một ký tự gốc + dấu) có NFD trùng NFD của `char`.
function canonicalVariants(char) {
  const nfd = char.normalize('NFD');
  const [base, ...marks] = [...nfd];
  if (!marks.length) return [char];
  const prefixes = new Set([base]);
  for (let cp = 0xC0; cp <= 0x1EFF; cp += 1) {
    const candidate = String.fromCodePoint(cp);
    const parts = [...candidate.normalize('NFD')];
    if (parts.length > 1 && parts[0] === base && parts.slice(1).every(mark => marks.includes(mark))) prefixes.add(candidate);
  }
  const variants = new Set();
  for (const prefix of prefixes) {
    const rest = [...marks];
    for (const used of [...prefix.normalize('NFD')].slice(1)) rest.splice(rest.indexOf(used), 1);
    for (const order of permutations(rest)) {
      const variant = prefix + order.join('');
      if (variant.normalize('NFD') === nfd) variants.add(variant);
    }
  }
  return [...variants].sort();
}

function escapeChar(char) {
  if (COMBINING.test(char)) return `\\\\x{${char.codePointAt(0).toString(16)}}`;
  if (/[.*+?^${}()|[\]\\]/.test(char)) return `\\\\${char}`;
  return char;
}

function wordPattern(word) {
  return [...word.normalize('NFC')].map(char => {
    const variants = canonicalVariants(char);
    if (variants.length === 1) return escapeChar(char);
    return `(?:${variants.map(variant => [...variant].map(escapeChar).join('')).join('|')})`;
  }).join('');
}

// Chuỗi đúng như viết trong firestore.rules (đã nhân đôi dấu \ cho chuỗi của Rules).
function rulesPattern(words) {
  return `(?si).*(${words.map(wordPattern).join('|')}).*`;
}

function swiftBlockedWords(swiftSource) {
  const block = /static let blockedWords: \[String\] = \[([\s\S]*?)\]/.exec(swiftSource)?.[1] || '';
  return [...block.matchAll(/"([^"]+)"/g)].map(match => match[1]);
}

module.exports = { canonicalVariants, rulesPattern, swiftBlockedWords };

if (require.main === module) {
  const fs = require('node:fs');
  const path = require('node:path');
  const swift = fs.readFileSync(path.join(__dirname, '..', 'ReShare', 'ReShare', 'Core', 'ContentFilter.swift'), 'utf8');
  process.stdout.write(`${rulesPattern(swiftBlockedWords(swift))}\n`);
}
