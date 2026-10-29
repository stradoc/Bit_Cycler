import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS } from '../game/src/data/programs.ts';
import { judge, NORMAL_WINDOWS } from '../game/src/rhythm/judge.ts';
import { PipelineRun } from '../game/src/rhythm/pipelineRun.ts';
import { tempoForClock } from '../game/src/rhythm/tempo.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu } from '../game/src/sim/cpu.ts';
import { unitOf, type Unit } from '../game/src/sim/isa.ts';

const SPB = 0.6; // 100 BPM

/** Tier 1: SUM ARRAY on the single-cycle CPU. */
function newRun(): PipelineRun {
  const spec = PROGRAMS[0];
  return new PipelineRun(new Cpu(assemble(spec.source, 8), 8, spec.memory), { forwarding: false, singleCycle: true }, 4, SPB, NORMAL_WINDOWS);
}

function expectedUnit(run: PipelineRun): Unit {
  const slot = run.pipeline.stages.ID;
  assert.ok(slot);
  return unitOf(slot.instr);
}

/** Presses `unit` at the current due beat, then closes the cycle. */
function play(run: PipelineRun, unit: Unit, offsetBeats = 0) {
  const decision = run.press({ kind: 'route', unit }, run.dueBeat + offsetBeats);
  run.update(run.dueBeat + 1);
  return decision;
}

test('judgment windows', () => {
  assert.equal(judge(0, NORMAL_WINDOWS), 'PERFECT');
  assert.equal(judge(-0.04, NORMAL_WINDOWS), 'PERFECT');
  assert.equal(judge(0.08, NORMAL_WINDOWS), 'GOOD');
  assert.equal(judge(-0.12, NORMAL_WINDOWS), 'MISS');
});

test('tier 1: a perfect run has CPI 1 and runs the program correctly', () => {
  const run = newRun();
  while (!run.done) assert.equal(play(run, expectedUnit(run))?.judgment, 'PERFECT');
  assert.equal(run.pipeline.instructions, 20);
  assert.equal(run.pipeline.cycles, 20);
  assert.equal(run.pipeline.cpi, 1);
  assert.equal(run.pipeline.cpu.memory[8], 17);
});

test('tier 1: a wrong unit costs a cycle and the same note comes back', () => {
  const run = newRun();
  const first = run.pipeline.stages.ID?.seq;
  const wrong = expectedUnit(run) === 'ALU' ? 'MEM' : 'ALU';
  assert.equal(play(run, wrong)?.outcome, 'wrong-unit');
  assert.equal(run.pipeline.stages.ID?.seq, first); // still waiting
  play(run, expectedUnit(run));
  assert.equal(run.pipeline.instructions, 1);
  assert.equal(run.pipeline.cycles, 2); // 1 instruction + 1 lost cycle
});

test('tier 1: early presses are ignored; a note that passes is missed', () => {
  const run = newRun();
  assert.equal(run.press({ kind: 'route', unit: expectedUnit(run) }, run.dueBeat - 0.5), null);
  const [report] = run.update(run.dueBeat + 0.5); // 300 ms late
  assert.equal(report.decision?.outcome, 'missed');
  assert.equal(run.pipeline.stalls, 1);
});

test('tier 1: CPI reflects lost cycles: 20 instructions with 5 misses = 25 cycles', () => {
  const run = newRun();
  let misses = 0;
  while (!run.done) {
    if (misses < 5) {
      run.update(run.dueBeat + 1); // let the note pass
      misses++;
    }
    play(run, expectedUnit(run));
  }
  assert.equal(run.pipeline.cycles, 25);
  assert.equal(run.pipeline.cpi, 25 / 20);
});

test('tempo grows 20 BPM per 10x clock, from 75 BPM at 1 MHz', () => {
  assert.equal(tempoForClock(1), 75);
  assert.equal(tempoForClock(10), 95);
  assert.equal(tempoForClock(1000), 135);
  assert.ok(Math.abs(tempoForClock(4) - 87.0) < 0.1); // pipelined, no clock upgrades
  assert.ok(Math.abs(tempoForClock(4000) - 147.0) < 0.1); // pipelined, fully upgraded
  assert.equal(tempoForClock(1, true), 60); // relaxed / practice
});

test('an overheated chip stops the clock: presses are ignored, notes come later, and no cycle runs', () => {
  const run = newRun();
  play(run, expectedUnit(run));
  const cycle = run.pipeline.cycle;
  const due = run.dueBeat;
  run.chip.temperature = 200; // far too hot: the next cycle stops the clock
  play(run, expectedUnit(run));
  assert.ok(run.chip.halted);
  assert.equal(run.press({ kind: 'route', unit: expectedUnit(run) }, run.dueBeat), null); // nothing to decide
  run.update(run.dueBeat + 3); // three beats pass with the clock stopped
  assert.equal(run.pipeline.cycle, cycle + 1);
  assert.ok(run.chip.haltedBeats >= 3);
  assert.equal(run.dueBeat, due + 1 + run.chip.haltedBeats);
  while (run.chip.halted) run.update(run.dueBeat + 1); // it cools and starts again
  assert.ok(play(run, expectedUnit(run)));
  assert.equal(run.pipeline.cycle, cycle + 2);
});
