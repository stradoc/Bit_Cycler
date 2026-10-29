import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS } from '../game/src/data/programs.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu } from '../game/src/sim/cpu.ts';
import { perfectCycles, Pipeline, stallsNeeded, type CycleResult } from '../game/src/sim/pipeline.ts';

function pipeline(source: string, forwarding: boolean, memory: number[] = []): Pipeline {
  return new Pipeline(new Cpu(assemble(source), 8, memory), { forwarding });
}

/** Plays the pipeline perfectly (stall exactly when needed) and returns every cycle's result. */
function playPerfectly(p: Pipeline): CycleResult[] {
  const results: CycleResult[] = [];
  while (!p.done) results.push(p.step(p.bestAction()));
  return results;
}

test('stall table matches the textbook 5-stage pipeline', () => {
  const [alu, load, branch] = assemble('add x1, x2, x3\nlb x1, 0(x2)\nl: beq x1, x0, l').instructions;
  // No forwarding: values are readable once the producer reaches WB.
  assert.equal(stallsNeeded(alu, alu, 1, false), 2);
  assert.equal(stallsNeeded(alu, alu, 2, false), 1);
  // Forwarding: ALU results need no stall; a load used right away needs one.
  assert.equal(stallsNeeded(alu, alu, 1, true), 0);
  assert.equal(stallsNeeded(load, alu, 1, true), 1);
  assert.equal(stallsNeeded(load, alu, 2, true), 0);
  // Branches compare in ID, so they need operands one stage earlier.
  assert.equal(stallsNeeded(alu, branch, 1, true), 1);
  assert.equal(stallsNeeded(load, branch, 1, true), 2);
  assert.equal(stallsNeeded(load, branch, 2, true), 1);
});

test('independent instructions: N instructions take N + 4 cycles', () => {
  const p = pipeline('addi x1, x0, 1\naddi x2, x0, 2\naddi x3, x0, 3', false);
  playPerfectly(p);
  assert.equal(p.cycle, 7);
  assert.equal(p.stalls, 0);
  assert.deepEqual(p.regs.slice(1, 4), [1, 2, 3]);
});

test('no forwarding: a dependency 1 back needs 2 stalls, 2 back needs 1, 3 back needs 0', () => {
  const back1 = pipeline('addi x1, x0, 5\nadd x2, x1, x1', false);
  playPerfectly(back1);
  assert.equal(back1.stalls, 2);
  assert.equal(back1.cycle, 2 + 4 + 2);
  assert.equal(back1.regs[2], 10);

  const back2 = pipeline('addi x1, x0, 5\naddi x3, x0, 1\nadd x2, x1, x1', false);
  playPerfectly(back2);
  assert.equal(back2.stalls, 1);

  const back3 = pipeline('addi x1, x0, 5\naddi x3, x0, 1\naddi x4, x0, 1\nadd x2, x1, x1', false);
  playPerfectly(back3);
  assert.equal(back3.stalls, 0);
});

test('forwarding removes ALU stalls but a load used right away still needs one', () => {
  const alu = pipeline('addi x1, x0, 5\nadd x2, x1, x1', true);
  playPerfectly(alu);
  assert.equal(alu.stalls, 0);
  assert.equal(alu.regs[2], 10);

  const loadUse = pipeline('lb x1, 0(x0)\nadd x2, x1, x1', true, [21]);
  playPerfectly(loadUse);
  assert.equal(loadUse.stalls, 1);
  assert.equal(loadUse.regs[2], 42);
});

test('a taken branch flushes the instruction fetched behind it', () => {
  // Cycle by cycle (forwarding on): bne waits 1 cycle for x1, then is taken,
  // so the fetched "addi x2" is thrown away. 3 instructions + 4 fill + 1 stall + 1 flush.
  const p = pipeline('addi x1, x0, 1\nbne x1, x0, skip\naddi x2, x0, 9\nskip: addi x3, x0, 7', true);
  const results = playPerfectly(p);
  assert.equal(p.stalls, 1);
  assert.equal(p.flushed, 1);
  assert.deepEqual(results.flatMap((r) => r.flushed).map((s) => s.pc), [2]);
  assert.equal(p.regs[2], 0); // the flushed instruction never ran
  assert.equal(p.regs[3], 7);
  assert.equal(p.instructions, 3);
  assert.equal(p.cycle, 9);
});

test('issuing into a hazard reports the stale value and flushes, but the program stays correct', () => {
  const p = pipeline('addi x1, x0, 5\nadd x2, x1, x1', false);
  p.step('issue'); // cycle 1 -> 2: addi moves from IF into ID (nothing to issue yet)
  p.step('issue'); // cycle 2 -> 3: addi issues; add is now in ID
  const violation = p.step('issue'); // add issues while addi is still in EX
  assert.equal(violation.event.kind, 'hazard-violation');
  if (violation.event.kind === 'hazard-violation') {
    assert.equal(violation.event.hazard.reg, 1);
    assert.equal(violation.event.staleValue, 0); // x1 not written back yet
    assert.equal(violation.event.correctValue, 5);
  }
  assert.equal(violation.flushed[0].pc, 1);
  playPerfectly(p);
  assert.equal(p.regs[2], 10);
  assert.ok(p.cycle >= 8, 'never faster than stalling correctly');
});

test('upcoming() predicts the next fetches with the seq numbers they will get', () => {
  const p = pipeline('addi x1, x0, 1\naddi x2, x0, 2\naddi x3, x0, 3\naddi x4, x0, 4', false);
  const predicted = p.upcoming(5);
  assert.deepEqual(predicted.map((s) => [s.seq, s.pc]), [[1, 1], [2, 2], [3, 3]]); // pc 0 is already in IF
  p.step('issue');
  assert.deepEqual([p.stages.IF?.seq, p.stages.IF?.pc], [1, 1]); // matches the prediction
  assert.equal(p.stageOf(0), 'ID');
});

test('an unnecessary stall wastes a cycle', () => {
  const p = pipeline('addi x1, x0, 1\naddi x2, x0, 2', false);
  p.step('issue');
  const wasted = p.step('stall');
  assert.deepEqual(wasted.event, { kind: 'stalled', needed: false });
  playPerfectly(p);
  assert.equal(p.cycle, 2 + 4 + 1);
});

test('SUM ARRAY runs correctly on the pipeline; forwarding makes it faster', () => {
  const spec = PROGRAMS[0];
  const run = (forwarding: boolean) => {
    const p = new Pipeline(new Cpu(assemble(spec.source, 8), 8, spec.memory), { forwarding });
    playPerfectly(p);
    return p;
  };
  const plain = run(false);
  const forwarded = run(true);
  for (const p of [plain, forwarded]) {
    assert.equal(p.cpu.memory[8], 17);
    assert.equal(p.regs[3], 17);
    assert.equal(p.instructions, 20);
  }
  // Hand count: 20 instructions + 4 to fill + 3 taken-branch flushes, plus stalls.
  // No forwarding: per loop, add waits 2 on lb and bne waits 2 on addi -> 4 x 4 = 16.
  assert.equal(plain.stalls, 16);
  assert.equal(plain.cycle, 20 + 4 + 3 + 16);
  // Forwarding: load-use (1) + branch on a fresh ALU result (1) -> 4 x 2 = 8.
  assert.equal(forwarded.stalls, 8);
  assert.equal(forwarded.cycle, 20 + 4 + 3 + 8);
});

test('forwardedFrom names the values handed straight to the instruction in ID', () => {
  const alu = pipeline('addi x1, x0, 5\nadd x2, x1, x1', true);
  alu.step('issue'); // addi into ID
  alu.step('issue'); // addi into EX; add into ID
  assert.deepEqual(alu.forwardedFrom().map((f) => [f.reg, f.producer.instr.op]), [[1, 'addi']]);

  const plain = pipeline('addi x1, x0, 5\nadd x2, x1, x1', false);
  plain.step('issue');
  plain.step('issue');
  assert.deepEqual(plain.forwardedFrom(), []); // no forwarding unit: it has to stall

  const loadUse = pipeline('lb x1, 0(x0)\nadd x2, x1, x1', true, [7]);
  loadUse.step('issue');
  loadUse.step('issue');
  assert.deepEqual(loadUse.forwardedFrom(), []); // load-use hazard: stall first
  loadUse.step('stall');
  assert.deepEqual(loadUse.forwardedFrom().map((f) => [f.reg, f.producer.instr.op]), [[1, 'lb']]); // now from MEM
});

test('perfectCycles gives the best possible run, without changing the CPU passed in', () => {
  const spec = PROGRAMS[0];
  const cpu = new Cpu(assemble(spec.source, 8), 8, spec.memory);
  assert.equal(perfectCycles(cpu, { forwarding: false }), 43);
  assert.equal(perfectCycles(cpu, { forwarding: true }), 35);
  assert.equal(cpu.pc, 0);
});
