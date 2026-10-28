import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS } from '../game/src/data/programs.ts';
import { judge, NORMAL_WINDOWS } from '../game/src/rhythm/judge.ts';
import { SingleCycleRun } from '../game/src/rhythm/run.ts';
import { tempoForClock } from '../game/src/rhythm/tempo.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu } from '../game/src/sim/cpu.ts';
import { unitOf } from '../game/src/sim/isa.ts';

const SPB = 0.6; // 100 BPM

function newRun(): SingleCycleRun {
  const spec = PROGRAMS[0];
  return new SingleCycleRun(new Cpu(assemble(spec.source, 8), 8, spec.memory), 4, SPB, NORMAL_WINDOWS);
}

function expectedUnit(run: SingleCycleRun) {
  return unitOf(run.notes[run.head].instr);
}

test('judgment windows', () => {
  assert.equal(judge(0, NORMAL_WINDOWS), 'PERFECT');
  assert.equal(judge(-0.04, NORMAL_WINDOWS), 'PERFECT');
  assert.equal(judge(0.08, NORMAL_WINDOWS), 'GOOD');
  assert.equal(judge(-0.12, NORMAL_WINDOWS), 'MISS');
});

test('a perfect run has CPI 1 and runs the program correctly', () => {
  const run = newRun();
  while (!run.done) {
    const result = run.press(expectedUnit(run), run.dueBeat(run.head));
    assert.equal(result?.judgment, 'PERFECT');
  }
  assert.equal(run.instructions, 20);
  assert.equal(run.cycles, 20);
  assert.equal(run.cpi, 1);
  assert.equal(run.cpu.memory[8], 17);
});

test('a wrong unit stalls one cycle and the same note comes back a beat later', () => {
  const run = newRun();
  const due = run.dueBeat(0);
  const wrong = expectedUnit(run) === 'ALU' ? 'MEM' : 'ALU';
  const miss = run.press(wrong, due);
  assert.equal(miss?.judgment, 'MISS');
  assert.equal(miss?.pressed, wrong);
  assert.equal(run.head, 0);
  assert.equal(run.dueBeat(0), due + 1);

  run.press(expectedUnit(run), due + 1);
  assert.equal(run.head, 1);
  assert.equal(run.cycles, 2); // 1 instruction + 1 stall
});

test('early presses are ignored; late notes are missed automatically', () => {
  const run = newRun();
  const due = run.dueBeat(0);
  assert.equal(run.press(expectedUnit(run), due - 0.5), null);

  assert.deepEqual(run.update(due + 0.1), []); // 60 ms late: still in the window
  const missed = run.update(due + 0.5); // 300 ms late
  assert.equal(missed.length, 1);
  assert.equal(missed[0].pressed, null);
  assert.equal(run.stalls, 1);
});

test('CPI reflects stalls: 20 instructions with 5 misses = 25 cycles', () => {
  const run = newRun();
  let misses = 0;
  while (!run.done) {
    if (misses < 5) {
      run.update(run.dueBeat(run.head) + 1); // let the note pass
      misses++;
    }
    run.press(expectedUnit(run), run.dueBeat(run.head));
  }
  assert.equal(run.cycles, 25);
  assert.equal(run.cpi, 25 / 20);
});

test('tempo grows 12 BPM per 10x clock, from 75 BPM at 1 MHz', () => {
  assert.equal(tempoForClock(1), 75);
  assert.equal(tempoForClock(10), 87);
  assert.equal(tempoForClock(1000), 111);
  assert.ok(Math.abs(tempoForClock(4000) - 118.2) < 0.1);
  assert.equal(tempoForClock(1, true), 60); // relaxed / practice
});
