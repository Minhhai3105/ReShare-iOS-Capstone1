// Tính số lượng bằng đơn vị nguyên: kg -> gram; đơn vị đếm -> nguyên đơn vị.
const UNIT_SCALE = Object.freeze({ piece: 1, bag: 1, box: 1, set: 1, kg: 1000 });
const ALIASES = Object.freeze({ 'chiếc': 'piece', 'cái': 'piece', 'túi': 'bag', 'hộp': 'box', 'thùng': 'box', 'thùng/hộp': 'box', 'bộ': 'set' });
const canonicalUnit = unit => ALIASES[unit] || unit;

function quantityBase(value, unit, { allowZero = false, signed = false } = {}) {
  const scale = UNIT_SCALE[canonicalUnit(unit)];
  if (!scale || !['string', 'number'].includes(typeof value)) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const text = String(value).trim();
  if (text.length > 32) return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[1] && !signed)) return null;
  const fraction = (match[3] || '').replace(/0+$/, '');
  const places = scale === 1000 ? 3 : 0;
  if (fraction.length > places) return null;
  const amount = BigInt(match[2]) * BigInt(scale) + BigInt(fraction.padEnd(places, '0') || '0');
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) || (!allowZero && amount === 0n)) return null;
  return Number(match[1] ? -amount : amount);
}

function quantityFromBase(value, unit) {
  const scale = UNIT_SCALE[canonicalUnit(unit)];
  if (!scale || !Number.isSafeInteger(value)) throw new RangeError('Invalid base quantity');
  return value / scale;
}

// Chỉ chuẩn hóa nhiễu IEEE của số tổng hợp; input/bản ghi nguồn vẫn dùng validator nghiêm ngặt.
function aggregateQuantity(value, unit) {
  const scale = UNIT_SCALE[canonicalUnit(unit)];
  const base = Math.round(value * scale);
  const normalized = base / scale;
  if (!scale || !Number.isFinite(value) || !Number.isSafeInteger(base) ||
      Math.abs(value - normalized) > Math.max(1, Math.abs(value)) * Number.EPSILON * 32) {
    throw new RangeError('Aggregate quantity needs reconciliation');
  }
  return normalized;
}

module.exports = { canonicalUnit, quantityBase, quantityFromBase, aggregateQuantity };
