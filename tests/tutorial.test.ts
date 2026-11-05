import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACTS_PER_GRADE, GRADES, TUTORIAL_JOB } from '../game/src/data/economy.ts';
import { programByName, TUTORIAL_PROGRAM } from '../game/src/data/programs.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu, trace } from '../game/src/sim/cpu.ts';
import { keepsTotal } from '../game/src/sim/isa.ts';
import { completeContract, fillBoard, isLocked, isTutorial, jobItems, newCampaign } from '../game/src/sim/progress.ts';

// The tutorial job: a new game's first, alone on the board, written so that
// every core instruction comes up once, early, for TICK's close looks.

const spec = programByName(TUTORIAL_PROGRAM);
const program = assemble(spec.source, 8);

test("the bakery till works out each change and the day's takings", () => {
  assert.equal(trace(new Cpu(program, 8, spec.memory)).length, 18);
  const cpu = new Cpu(program, 8, spec.memory);
  while (!cpu.halted) cpu.step();
  assert.deepEqual([cpu.memory[8], cpu.memory[9]], [2, 4], 'change: 5 - 3 and 9 - 5');
  assert.equal(cpu.memory[12], 8, 'takings: 3 + 5');
});

test('each core instruction comes up before the loop goes round again, and the add is a running total', () => {
  const steps = trace(new Cpu(program, 8, spec.memory));
  const firstBranch = steps.findIndex((step) => step.instr.op === 'bne');
  const early = new Set(steps.slice(0, firstBranch + 1).map((step) => step.instr.op));
  for (const op of ['addi', 'lb', 'sub', 'sb', 'add', 'bne']) assert.ok(early.has(op as never), op);
  const add = program.instructions.findIndex((instr) => instr.op === 'add');
  assert.equal(keepsTotal(program, add), true);
});

test('a new game offers only the tutorial job, takeable at once; finishing it pays and deals the usual board', () => {
  const start = newCampaign();
  assert.equal(start.board.length, 1);
  assert.ok(isTutorial(start.board[0]));
  assert.equal(fillBoard(start, () => 0.5), start, 'the board stays as it is');
  assert.equal(isLocked(start.board[0], start), false);
  assert.equal(jobItems(start.board[0]), 2);
  const done = completeContract(start, start.board[0].id, () => 0.5);
  assert.equal(done.money, TUTORIAL_JOB.pay);
  assert.equal(done.board.length, GRADES.length * CONTRACTS_PER_GRADE);
  assert.ok(!done.board.some(isTutorial));
});
