const test = require('node:test');
const assert = require('node:assert/strict');
const { quantityBase, quantityFromBase, aggregateQuantity } = require('../quantity.cjs');

test('Count units require positive whole quantities, including legacy labels', () => {
  for (const unit of ['piece', 'bag', 'box', 'set', 'chiếc', 'bộ']) {
    assert.equal(quantityBase(8, unit), 8);
    for (const value of [0, -1, 1.5, NaN, Infinity, '', '1e2', null]) assert.equal(quantityBase(value, unit), null);
  }
});

test('Kilograms use at most three decimal places and safe base integers', () => {
  assert.equal(quantityBase('1.125', 'kg'), 1125);
  assert.equal(quantityBase(0.001, 'kg'), 1);
  assert.equal(quantityBase('0.0001', 'kg'), null);
  assert.equal(quantityBase('9007199254741', 'kg'), null);
  assert.equal(quantityBase('1', 'litre'), null);
  assert.equal(quantityBase(0, 'kg', { allowZero: true }), 0);
});

test('Partial and full kilogram distribution reconcile without floating point residue', () => {
  const received = quantityBase(1.125, 'kg');
  const first = received - quantityBase(0.125, 'kg');
  assert.equal(quantityFromBase(first, 'kg'), 1);
  assert.equal(quantityFromBase(first - quantityBase(1, 'kg'), 'kg'), 0);
  assert.equal(quantityFromBase(quantityBase(0.3, 'kg') - quantityBase(0.1, 'kg'), 'kg'), 0.2);
  assert.equal(quantityBase(-0.125, 'kg', { signed: true }), -125);
});

test('Dashboard aggregates remove floating point noise but reject meaningful unit-policy violations', () => {
  assert.equal(aggregateQuantity(0.1 + 0.2, 'kg'), 0.3);
  assert.equal(aggregateQuantity(0.3 - 0.1, 'kg'), 0.2);
  assert.throws(() => aggregateQuantity(1.0001, 'kg'), /reconciliation/);
  assert.throws(() => aggregateQuantity(1.5, 'piece'), /reconciliation/);
});
