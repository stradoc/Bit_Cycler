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
  return new PipelineRun(new Cpu(assemble(source), 8, memory), { forwarding }, 3, SPB, NORMAL_WINDOWS);
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

test('an off-beat press, a wrong unit, or no press all stall', () => {
  const run = newRun('lb x1, 0(x0)');
  endCycle(run);
  // First arrival, 150 ms late: past the good window but before the cycle advanced
  assert.equal(run.press({ kind: 'route', unit: 'MEM' }, run.dueBeat + 0.15 / SPB)?.outcome, 'off-beat');
  endCycle(run);
  assert.equal(run.press({ kind: 'route', unit: 'ALU' }, run.dueBeat)?.outcome, 'wrong-unit');
  endCycle(run);
  const [missed] = endCycle(run); // no press at all
  assert.equal(missed.decision?.outcome, 'missed');
  assert.equal(missed.decision?.waited, true); // shown as "late", not "off beat"
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

test('a note already waiting on the line is not timed', () => {
  const run = newRun('addi x1, x0, 5\nadd x2, x1, x1');
  endCycle(run);
  run.press({ kind: 'route', unit: 'ALU' }, run.dueBeat);
  endCycle(run); // addi issues; add arrives in ID with a 2-stall hazard
  assert.equal(run.press({ kind: 'stall' }, run.dueBeat)?.waited, false); // first arrival: timed
  endCycle(run);
  // Still waiting: a press half a beat early would normally be ignored, but now it counts.
  const second = run.press({ kind: 'stall' }, run.dueBeat - 0.5);
  assert.equal(second?.waited, true);
  assert.equal(second?.outcome, 'stalled');
  endCycle(run);
  const go = run.press({ kind: 'route', unit: 'ALU' }, run.dueBeat - 0.5);
  assert.equal(go?.outcome, 'issued');
  assert.equal(go?.judgment, 'PERFECT');
});

test('forcing recorded decisions replays a run exactly', () => {
  const spec = PROGRAMS[0];
  const record: { action: Action | null; outcome: Parameters<PipelineRun['force']>[1]; judgment: 'PERFECT' | 'GOOD' | 'MISS' }[] = [];
  const original = newRun(spec.source, false, spec.memory);
  let i = 0;
  while (!original.done) {
    // Make a few deliberate mistakes so the replay has something to reproduce.
    const action = i % 7 === 3 ? { kind: 'stall' as const } : best(original);
    if (action) original.press(action, original.dueBeat);
    for (const r of endCycle(original)) if (r.decision) record.push({ action: r.decision.action, outcome: r.decision.outcome, judgment: r.decision.judgment });
    i++;
  }
  const replay = newRun(spec.source, false, spec.memory);
  let next = 0;
  while (!replay.done) {
    if (replay.pipeline.stages.ID) {
      const r = record[next++];
      replay.force(r.action, r.outcome, r.judgment);
    }
    endCycle(replay);
  }
  assert.equal(replay.pipeline.cycle, original.pipeline.cycle);
  assert.deepEqual(replay.counts, original.counts);
});

test('routing a branch with a guess: right costs nothing, wrong flushes, and replays repeat it', () => {
  const source = 'addi x1, x0, 0\naddi x2, x0, 2\nloop: addi x1, x1, 1\naddi x5, x0, 0\nbne x1, x2, loop\nsb x1, 8(x0)';
  const record: { action: Action | null; outcome: Parameters<PipelineRun['force']>[1]; judgment: 'PERFECT' | 'GOOD' | 'MISS' }[] = [];
  const run = new PipelineRun(new Cpu(assemble(source), 8, []), { forwarding: true }, 3, SPB, NORMAL_WINDOWS);
  while (!run.done) {
    let action = best(run);
    // Always guess TAKEN: right the first time round the loop, wrong the last.
    if (action?.kind === 'route' && action.unit === 'BRANCH') action = { ...action, guessTaken: true };
    if (action) run.press(action, run.dueBeat);
    for (const r of endCycle(run)) if (r.decision) record.push({ action: r.decision.action, outcome: r.decision.outcome, judgment: r.decision.judgment });
  }
  assert.deepEqual([run.pipeline.branches, run.pipeline.mispredicted], [2, 1]);

  const replay = new PipelineRun(new Cpu(assemble(source), 8, []), { forwarding: true }, 3, SPB, NORMAL_WINDOWS);
  let next = 0;
  while (!replay.done) {
    if (replay.pipeline.stages.ID) {
      const r = record[next++];
      replay.force(r.action, r.outcome, r.judgment);
    }
    endCycle(replay);
  }
  assert.equal(replay.pipeline.cycle, run.pipeline.cycle);
  assert.equal(replay.pipeline.mispredicted, 1);
});
