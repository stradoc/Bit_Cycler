import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS } from '../game/src/data/programs.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu, trace } from '../game/src/sim/cpu.ts';
import { describe, format, tokens, unitOf } from '../game/src/sim/isa.ts';

const sumArray = PROGRAMS[0];

test('assembler parses every instruction form and resolves labels', () => {
  const program = assemble(`
    start: add x1, x2, x3   # comment
           addi x4, x0, 0x10
           lb x5, -2(x1)
           sb x5, 8(x0)
           beq x1, x0, start
  `);
  assert.equal(program.labels.get('start'), 0);
  assert.deepEqual(
    program.instructions.map((i) => format(i)),
    ['add x1, x2, x3', 'addi x4, x0, 16', 'lb x5, -2(x1)', 'sb x5, 8(x0)', 'beq x1, x0, start'],
  );
});

test('tokens split an instruction into highlightable parts', () => {
  const [lb] = assemble('lb x4, 0(x1)').instructions;
  assert.deepEqual(
    tokens(lb, true).map((t) => `${t.kind}:${t.text}`),
    ['op:lb', 'punct: ', 'reg:x4', 'punct:,', 'num:0', 'punct:(', 'reg:x1', 'punct:)'],
  );
});

test('describe explains instructions with their real operands', () => {
  const program = assemble('loop: lb x4, 0(x1)\naddi x1, x1, 1\nbne x1, x2, loop\nsb x3, 8(x0)');
  assert.deepEqual(program.instructions.map(describe), [
    'LOAD BYTE: copy memory[x1 + 0] into x4',
    'ADD IMMEDIATE: x1 = x1 + 1',
    'BRANCH IF NOT EQUAL: if x1 ≠ x2 go to loop',
    'STORE BYTE: copy x3 into memory[x0 + 8]',
  ]);
});

test('assembler reports the line of an error', () => {
  assert.throws(() => assemble('add x1, x2\n'), /line 1: add takes 3 operands/);
  assert.throws(() => assemble('\naddi x9, x0, 1', 8), /line 2: bad register "x9"/);
  assert.throws(() => assemble('bne x1, x0, nowhere'), /unknown label "nowhere"/);
  assert.throws(() => assemble('mul x1, x2, x3'), /unknown instruction "mul"/);
});

test('sum-array program stores 3+5+7+2 = 17 at address 8', () => {
  const cpu = new Cpu(assemble(sumArray.source, 8), 8, sumArray.memory);
  while (!cpu.halted) cpu.step();
  assert.equal(cpu.memory[8], 17);
  assert.equal(cpu.regs[3], 17);
});

test('sum-array executes 20 instructions with the expected unit mix', () => {
  const steps = trace(new Cpu(assemble(sumArray.source, 8), 8, sumArray.memory));
  assert.equal(steps.length, 3 + 4 * 4 + 1);
  const units = steps.map((s) => unitOf(s.instr));
  assert.equal(units.filter((u) => u === 'MEM').length, 5); // 4 loads + 1 store
  assert.equal(units.filter((u) => u === 'BRANCH').length, 4);
});

test('trace does not change the original CPU', () => {
  const cpu = new Cpu(assemble(sumArray.source, 8), 8, sumArray.memory);
  trace(cpu);
  assert.equal(cpu.pc, 0);
  assert.equal(cpu.memory[8], 0);
});

test('registers wrap at the word size and x0 stays zero', () => {
  const cpu = new Cpu(assemble('addi x1, x0, 250\naddi x1, x1, 10\naddi x0, x0, 5\nsub x2, x0, x1'), 8);
  while (!cpu.halted) cpu.step();
  assert.equal(cpu.regs[1], 4); // 260 wraps to 4 in 8 bits
  assert.equal(cpu.regs[0], 0);
  assert.equal(cpu.regs[2], 252); // 0 - 4 wraps to 252
});

test('lb sign-extends to the register width', () => {
  const cpu = new Cpu(assemble('lb x1, 0(x0)'), 16, [0xff]);
  cpu.step();
  assert.equal(cpu.regs[1], 0xffff); // -1 in 16 bits
});
