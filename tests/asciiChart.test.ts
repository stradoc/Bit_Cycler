import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bar, deadlineBar } from '../game/src/visual/asciiChart.ts';

test('bars fill in proportion, and anything above zero shows at least one mark', () => {
  assert.equal(bar(5, 10, 10), '#####.....');
  assert.equal(bar(10, 10, 4), '####');
  assert.equal(bar(0, 10, 4), '....');
  assert.equal(bar(1, 1000, 4), '#...');
});

test('the deadline bar marks the deadline two thirds along and shows a late job running off the end', () => {
  assert.equal(deadlineBar(1, 2, 9), '[###...|..]'); // half the deadline
  assert.equal(deadlineBar(2, 2, 9), '[######|..]'); // exactly on it
  assert.equal(deadlineBar(100, 2, 9), '[######|##]>'); // far past it
  assert.equal(deadlineBar(0.001, 100, 9), '[#.....|..]'); // tiny, but it shows
});
