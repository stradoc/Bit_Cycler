import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NORMAL_WINDOWS } from '../game/src/rhythm/judge.ts';
import { PipelineRun, type Action } from '../game/src/rhythm/pipelineRun.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu } from '../game/src/sim/cpu.ts';
import { unitOf } from '../game/src/sim/isa.ts';
import { CARD_WIDTH, practiceLines, resultCard, runReport } from '../game/src/song/results.ts';
import { ASCII, cardLines, CP437 } from '../game/src/visual/asciiChart.ts';
import { NO_CALLS } from '../game/src/rhythm/skills.ts';
import { cacheShape, L1_BASE } from '../game/src/sim/memory.ts';
import { fillBoard, NEW_GAME } from '../game/src/sim/progress.ts';
import { songSetup, type SongStart } from '../game/src/song/setup.ts';
import type { Shown } from '../game/src/song/view.ts';
import { SongWords } from '../game/src/song/words.ts';

// The song screen's words and results are plain functions of the run, so
// they're checked here without a browser.

/** A practice song (SUM ARRAY, or SUM GRID with a predictor) on a new game's CPU, with `options`. */
function song(options: SongStart = {}) {
  const setup = songSetup({ practice: true, ...options }, NEW_GAME, new URLSearchParams());
  const cpu = new Cpu(assemble(setup.spec.source), 8, setup.spec.memory);
  const fresh = cpu.clone();
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

/** A real run of the board's first job, its replay recorded as paid (late if `late`). */
function paidRun(late: boolean, options: SongStart = {}) {
  const contract = fillBoard(NEW_GAME, () => 0.5).board[0];
  const replay = { cycles: [], dials: [], maxDial: 1.5, canOverclock: false, paid: true, late };
  return song({ practice: false, contract, replay, ...options });
}

test('the results card adds up: every cycle is counted once, and the CPI is the one the run had', () => {
  const { run, setup, fresh } = song({ practice: false });
  playPerfectly(run);
  const report = runReport({ run, setup, freshCpu: fresh, dials: [], calls: NO_CALLS });
  const p = run.pipeline;
  assert.equal(report.uses.reduce((sum, u) => sum + u.cycles, 0), p.cycles);
  assert.equal(report.uses[0].use, 'finished');
  // Not a contract: no stamp of a verdict, and Enter plays again.
  assert.equal(report.verdict, 'done');
  const card = resultCard(report);
  assert.ok(card.rows.some((row) => row.kind === 'line' && row.left === `WHERE THE ${p.cycles} CYCLES WENT` && row.right === `CPI ${p.cpi.toFixed(2)}`));
  assert.ok(card.keys?.startsWith('[ENTER] PLAY AGAIN'));
  // In characters, in either character set, every line fits the card (a bar running off its end by one).
  for (const glyphs of [ASCII, CP437]) assert.ok(cardLines(card, glyphs).lines.every((line) => line.text.length <= CARD_WIDTH + 1), 'a line runs off the card');
  // Every cycle is in the bar: the bar's parts and its empty part (the pipeline filling) add up.
  const stack = card.rows.find((row) => row.kind === 'stack');
  assert.ok(stack?.kind === 'stack' && stack.total === p.cycles);
  assert.ok(practiceLines(run, 'board').includes('[ENTER] CONTRACT BOARD'));
});

test('a paid job\'s card stamps it on time with the full pay, or late with half', () => {
  for (const late of [false, true]) {
    const { run, setup, fresh } = paidRun(late);
    playPerfectly(run);
    const report = runReport({ run, setup, freshCpu: fresh, dials: [], calls: NO_CALLS });
    const card = resultCard(report);
    const pay = setup.contract?.pay ?? 0;
    assert.equal(report.verdict, late ? 'late' : 'on-time');
    assert.equal(report.job?.pay, late ? Math.round(pay / 2) : pay);
    assert.deepEqual(card.stamp, late ? { word: 'LATE', tone: 'bad', part: 'verdict' } : { word: 'ON TIME', tone: 'good', part: 'verdict' });
    const first = card.rows[0];
    assert.ok(first.kind === 'line' && first.right === (late ? `HALF PAY: $${Math.round(pay / 2)}` : `PAID $${pay}`));
    assert.ok(card.keys?.startsWith('[ENTER] CONTRACT BOARD'));
    // TICK points at the verdict (the stamp, the pay and the deadline) and at where the cycles went.
    const parts = cardLines(card).parts;
    assert.deepEqual(parts.verdict, { first: 0, last: 2 });
    assert.ok(parts.cycles && parts.cycles.first > 2);
  }
});

test("TICK's explanation of the results: short lines, one for each way cycles were lost, on every tier", () => {
  for (const options of [{ singleCycle: true }, {}, { forwarding: true }, { predictor: '2-bit', l1: L1_BASE }, { forwarding: true, l1: cacheShape(['ways']) }] as SongStart[]) {
    const { run, setup, fresh, words } = paidRun(false, options);
    playPerfectly(run);
    const report = runReport({ run, setup, freshCpu: fresh, dials: [], calls: NO_CALLS });
    const steps = words.resultsTour(report);
    for (const step of steps) assert.ok(step.say.length <= 150, `too long: ${step.say}`);
    assert.match(steps[0].say, /^On time!/);
    assert.ok(steps.some((step) => step.say.includes(`CPI (cycles per instruction) of ${report.cpi.toFixed(2)}`)));
    const lost = report.uses.filter((u) => u.use !== 'finished');
    for (const { cycles } of lost) assert.ok(steps.some((step) => step.say.startsWith(`${cycles} cycles`)), `no line for ${cycles} lost cycles`);
    assert.equal(steps.filter((step) => step.say.startsWith('A single-cycle CPU')).length, setup.singleCycle ? 0 : 1);
    // An upgraded L1 is compared with the first one; the first L1 with none.
    const first = report.compare.some((c) => c.cpu === 'first-l1');
    assert.equal(first, Boolean(setup.l1 && setup.l1.ways > 1));
    assert.equal(steps.some((step) => step.say.startsWith('With the first L1 (16 bytes: 4 lines of 4, direct-mapped)')), first);
  }
});
