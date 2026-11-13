import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// Bộ lọc từ ngữ nằm ở hai nơi: firestore.rules (chặn thật ở server) và ContentFilter.swift (báo lỗi sớm
// trên app). Hai danh sách phải giống nhau, nếu không app sẽ cho gửi rồi server từ chối khó hiểu, hoặc ngược lại.
test('danh sách từ bị chặn trong firestore.rules và ContentFilter.swift giống hệt nhau', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
  const swift = readFileSync(new URL('../../ReShare/ReShare/Core/ContentFilter.swift', import.meta.url), 'utf8')
  const ruleWords = /'\(\?si\)\.\*\(([^)]+)\)\.\*'/.exec(rules)?.[1].split('|')
  const swiftBlock = /static let blockedWords: \[String\] = \[([\s\S]*?)\]/.exec(swift)?.[1]
  const swiftWords = [...(swiftBlock || '').matchAll(/"([^"]+)"/g)].map((match) => match[1])
  assert.ok(ruleWords?.length > 10, 'không đọc được danh sách trong rules')
  assert.deepEqual([...swiftWords].sort(), [...ruleWords].sort())
})
