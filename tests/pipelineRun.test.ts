import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS } from '../game/src/data/programs.ts';
import { NORMAL_WINDOWS } from '../game/src/rhythm/judge.ts';
import { PipelineRun, type Action } from '../game/src/rhythm/pipelineRun.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu } from '../game/src/sim/cpu.ts';
import { unitOf } from '../game/src/sim/isa.ts';

const SPB = 0.6;

function newRun(source: string, forwarding = false, memory: readonly number[] = []): PipelineRun {
  return new PipelineRun(new Cpu(assemble(source), 8, memory), forwarding, 3, SPB, NORMAL_WINDOWS);
}

/** The right choice for whatever is in ID now. */
function best(run: PipelineRun): Action | null {
  const slot = run.pipeline.stages.ID;
  if (!slot) return null;
  return run.pipeline.hazard() ? { kind: 'stall' } : { kind: 'route', unit: unitOf(slot.instr) };
}

/** Advances past the current cycle's timing window. */
function endCycle(run: PipelineRun) {
  return run.update(run.dueBeat + 0.5);
}

test('perfect play on SUM ARRAY: every decision correct, 43 cycles', () => {
  const spec = PROGRAMS[0];
  const run = newRun(spec.source, false, spec.memory);
  while (!run.done) {
    const action = best(run);
    if (action) assert.ok(run.press(action, run.dueBeat));
    endCycle(run);
  }
  assert.equal(run.pipeline.cycle, 43);
  assert.equal(run.counts.issued, 20);
  assert.equal(run.counts.stalled, 16);
  assert.equal(run.bestStreak, 36);
  assert.equal(run.pipeline.cpu.memory[8], 17);
});

test('routing into a hazard is a violation: flushed, streak broken', () => {
  const run = newRun('addi x1, x0, 5\nadd x2, x1, x1');
  endCycle(run); // cycle 1: addi only in IF
  run.press({ kind: 'route', unit: 'ALU' }, run.dueBeat);
  endCycle(run); // addi issues
  const decision = run.press({ kind: 'route', unit: 'ALU' }, run.dueBeat);
  assert.equal(decision?.outcome, 'violation');
  assert.equal(decision?.hazard?.reg, 1);
  const [report] = endCycle(run);
  assert.equal(report.event.kind, 'hazard-violation');
  assert.equal(report.flushed.length, 1);
  assert.equal(run.streak, 0);
});

test('stalling with no hazard wastes a cycle and breaks the streak', () => {
  const run = newRun('addi x1, x0, 1\naddi x2, x0, 2');
  endCycle(run);
  assert.equal(run.press({ kind: 'stall' }, run.dueBeat)?.outcome, 'wasted-stall');
  endCycle(run);
  assert.equal(run.pipeline.stalls, 1);
  assert.equal(run.streak, 0);
});

test('a wrong unit, an off-beat press, or no press all stall', () => {
  const run = newRun('lb x1, 0(x0)');
  endCycle(run);
  assert.equal(run.press({ kind: 'route', unit: 'ALU' }, run.dueBeat)?.outcome, 'wrong-unit');
  endCycle(run);
  // 150 ms late: past the good window but before the cycle advanced
  assert.equal(run.press({ kind: 'route', unit: 'MEM' }, run.dueBeat + 0.15 / SPB)?.outcome, 'off-beat');
  endCycle(run);
  const [missed] = endCycle(run); // no press at all
  assert.equal(missed.decision?.outcome, 'missed');
  assert.equal(run.pipeline.stalls, 3);
  assert.equal(run.pipeline.instructions, 0); // lb still waiting in ID
});

test('presses too early are ignored, and only the first press in a cycle counts', () => {
  const run = newRun('addi x1, x0, 1');
  endCycle(run);
  assert.equal(run.press({ kind: 'route', unit: 'ALU' }, run.dueBeat - 0.5), null);
  assert.equal(run.press({ kind: 'route', unit: 'ALU' }, run.dueBeat)?.outcome, 'issued');
  assert.equal(run.press({ kind: 'stall' }, run.dueBeat), null);
});

test('throughput approaches 1 instruction per cycle when the pipeline stays full', () => {
  const run = newRun(Array.from({ length: 12 }, (_, i) => `addi x${(i % 7) + 1}, x0, ${i}`).join('\n'));
  while (!run.done) {
    const action = best(run);
    if (action) run.press(action, run.dueBeat);
    endCycle(run);
    if (run.pipeline.instructions === 10) assert.equal(run.throughput, 1);
  }
});
