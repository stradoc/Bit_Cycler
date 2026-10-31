import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS } from '../game/src/data/programs.ts';
import { NORMAL_WINDOWS } from '../game/src/rhythm/judge.ts';
import { PipelineRun, type Action } from '../game/src/rhythm/pipelineRun.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu } from '../game/src/sim/cpu.ts';
import { unitOf } from '../game/src/sim/isa.ts';
import { ROWS } from '../game/src/song/layout.ts';
import { practiceLines, resultLines } from '../game/src/song/results.ts';
import type { Shown, SongSetup } from '../game/src/song/view.ts';
import { SongWords } from '../game/src/song/words.ts';

// The song screen's words and results are plain functions of the run, so
// they're checked here without a browser.

const spec = PROGRAMS[0]; // SUM ARRAY

function song(options: Partial<SongSetup> = {}) {
  const cpu = new Cpu(assemble(spec.source), 8, spec.memory);
  const fresh = cpu.clone();
  const setup: SongSetup = { spec, singleCycle: false, forwarding: false, guessing: false, predictor: undefined, l1: false, practice: true, watching: false, rows: ROWS, ...options };
  const run = new PipelineRun(cpu, { forwarding: setup.forwarding }, 3, 0.6, NORMAL_WINDOWS);
  const shown: Shown = { regs: [...run.pipeline.regs], memory: cpu.memory.slice(), lines: [] };
  return { run, setup, fresh, words: new SongWords(run, setup, shown) };
}

/** Plays the whole song perfectly. */
function playPerfectly(run: PipelineRun): void {
  while (!run.done) {
    const slot = run.pipeline.stages.ID;
    if (slot) {
      const action: Action = run.pipeline.hazard() ? { kind: 'stall' } : { kind: 'route', unit: unitOf(slot.instr) };
      run.press(action, run.dueBeat);
    }
    run.update(run.dueBeat + 0.5);
  }
}

test('each tier is named for what it adds', () => {
  assert.equal(song({ singleCycle: true }).words.tierTitle(), 'TIER 1: SINGLE-CYCLE');
  assert.equal(song().words.tierTitle(), 'TIER 2: PIPELINE');
  assert.equal(song({ forwarding: true }).words.tierTitle(), 'TIER 3: FORWARDING');
  assert.equal(song({ guessing: true }).words.tierTitle(), 'TIER 4: BRANCH PREDICTION');
  assert.equal(song({ guessing: true, predictor: '2-bit' }).words.tierTitle(), 'TIER 6: 2-BIT PREDICTOR');
});

test('practice explains a hazard on the line before anything else, and says why the value is late', () => {
  const { run, words } = song();
  // Run until the instruction in ID waits on a value still being computed.
  while (!run.done && !run.pipeline.hazard()) {
    const slot = run.pipeline.stages.ID;
    if (slot) run.press({ kind: 'route', unit: unitOf(slot.instr) }, run.dueBeat);
    run.update(run.dueBeat + 0.5);
  }
  const tips = words.situation();
  assert.equal(tips.length, 1);
  assert.equal(tips[0].id, 'hazard');
  assert.match(tips[0].message, /needs x\d+/);
  assert.match(words.mistake('violation'), /isn't ready/);
});

test('the results add up: where the cycles went sums to the cycles, and the CPI line matches', () => {
  const { run, setup, fresh, words } = song({ practice: false });
  playPerfectly(run);
  const lines = resultLines({ run, setup, tierTitle: words.tierTitle(), freshCpu: fresh, ratedMhz: 4, dials: [], contract: undefined, late: false, paid: false, money: 0 });
  const p = run.pipeline;
  assert.ok(lines.includes(`WHERE THE ${p.cycles} CYCLES WENT`));
  const start = lines.indexOf(`WHERE THE ${p.cycles} CYCLES WENT`) + 1;
  const counts = lines.slice(start, start + 4).map((line) => Number(line.trim().split(/\s+/).at(-1)));
  assert.equal(counts.reduce((a, b) => a + b, 0), p.cycles);
  assert.ok(lines.some((line) => line.includes(`CPI = ${p.cycles} CYCLES / ${p.instructions} INSTRUCTIONS = ${p.cpi.toFixed(2)}`)));
  assert.ok(lines.at(-1)?.includes('[ENTER] PLAY AGAIN'));
  assert.ok(practiceLines(run, 'board').includes('[ENTER] CONTRACT BOARD'));
});
