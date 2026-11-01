import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu, trace } from '../game/src/sim/cpu.ts';
import { generateProgram } from '../game/src/sim/generator.ts';
import { jobSheet } from '../game/src/sim/jobSheet.ts';

// The board's job sheet: the loop, the notes per lane and the memory used,
// checked against counts worked out by hand.

const marked = (marks: readonly boolean[]) => marks.flatMap((on, address) => (on ? [address] : []));

test('SUM ARRAY: a 4-line loop run 4 times, 20 notes, reads 0-3 and writes the sum at 8', () => {
  const sheet = jobSheet('SUM ARRAY');
  assert.deepEqual(sheet.loop, ['loop:  lb x4, 0(x1)', '       add x3, x3, x4', '       addi x1, x1, 1', '       bne x1, x2, loop']);
  assert.equal(sheet.loopRuns, 4);
  // 3 set-up addi, then 4 x (lb, add, addi, bne), then sb.
  assert.deepEqual(sheet.notes, { ALU: 3 + 4 * 2, MEM: 4 + 1, BRANCH: 4 });
  assert.deepEqual(marked(sheet.reads), [0, 1, 2, 3]);
  assert.deepEqual(marked(sheet.writes), [8]);
});

test('SUM GRID: the sheet shows the outer loop (row to bne row), run once per row', () => {
  const sheet = jobSheet('SUM GRID');
  assert.equal(sheet.loop.length, 6);
  assert.match(sheet.loop[0], /^row:/);
  assert.match(sheet.loop[5], /bne x1, x6, row$/);
  assert.equal(sheet.loopRuns, 4);
  // 3 set-up, then per row: addi, 3 x (lb, add, addi, bne), bne; then sb.
  assert.deepEqual(sheet.notes, { ALU: 3 + 4 * (1 + 3 * 2), MEM: 12 + 1, BRANCH: 4 * (3 + 1) });
  assert.deepEqual(marked(sheet.reads), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(marked(sheet.writes), [12]);
});

test('every generated job has a loop, and one note per instruction it runs', () => {
  for (let seed = 1; seed < 3000; seed += 7) {
    const spec = generateProgram(seed);
    const sheet = jobSheet(spec.name);
    const steps = trace(new Cpu(assemble(spec.source, 8), 8, spec.memory)).length;
    assert.equal(sheet.notes.ALU + sheet.notes.MEM + sheet.notes.BRANCH, steps, spec.name);
    assert.ok(sheet.loop.length >= 3 && sheet.loopRuns >= 1, spec.name);
    assert.match(sheet.loop[sheet.loop.length - 1], /\bb(ne|eq) /, spec.name);
    assert.ok(sheet.reads.some(Boolean) || sheet.writes.some(Boolean), spec.name);
  }
});
