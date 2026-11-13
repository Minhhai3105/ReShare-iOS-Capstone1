import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { canonicalVariants, rulesPattern, swiftBlockedWords } = require('../../tests/content-filter-pattern.cjs')

// Bộ lọc từ ngữ nằm ở hai nơi: firestore.rules (chặn thật ở server) và ContentFilter.swift (báo lỗi sớm
// trên app). Regex trong rules sinh từ danh sách Swift (kèm mọi dạng Unicode tương đương), nên so regex
// trong rules với regex sinh lại. Lệch thì app cho gửi rồi server từ chối khó hiểu, hoặc ngược lại.
test('regex lọc từ trong firestore.rules sinh đúng từ danh sách ContentFilter.swift', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
  const swift = readFileSync(new URL('../../ReShare/ReShare/Core/ContentFilter.swift', import.meta.url), 'utf8')
  const words = swiftBlockedWords(swift)
  assert.ok(words.length > 10, 'không đọc được danh sách trong ContentFilter.swift')
  const expected = rulesPattern(words)
  assert.ok(rules.includes(`'${expected}'`),
    `regex trong firestore.rules lệch danh sách Swift. Chạy: node tests/content-filter-pattern.cjs rồi dán vào cleanText.\n${expected}`)
})

test('mỗi chữ có dấu liệt kê đủ dạng dựng sẵn và dạng dấu tổ hợp tương đương', () => {
  assert.deepEqual(canonicalVariants('é'), ['é', 'é'])
  // "ặ" có hai dấu khác lớp kết hợp: mọi thứ tự và mọi cách dựng một phần đều tương đương.
  assert.deepEqual(new Set(canonicalVariants('ặ')), new Set(['ặ', 'ặ', 'ặ', 'ặ', 'ặ']))
  for (const variant of canonicalVariants('ồ')) assert.equal(variant.normalize('NFC'), 'ồ')
  assert.deepEqual(canonicalVariants('đ'), ['đ'], 'đ không có dạng tổ hợp')
})
