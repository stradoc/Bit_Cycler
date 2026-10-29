import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOCK, SECTIONS } from '../game/src/data/economy.ts';
import { programByName } from '../game/src/data/programs.ts';
import { formatCount, formatDuration, formatMhz, formatMoney } from '../game/src/format.ts';
import {
  buy,
  completeContract,
  contractSeconds,
  fillBoard,
  isLocked,
  isTight,
  jobItems,
  NEW_GAME,
  newContract,
  ratedMhz,
  tierOf,
  withTier,
  type Contract,
  type Progress,
} from '../game/src/sim/progress.ts';

/** A repeatable stand-in for Math.random. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

test('big numbers and long times read in plain words', () => {
  assert.equal(formatCount(2.4e9), '2.4 BILLION');
  assert.equal(formatCount(12_000), '12 THOUSAND');
  assert.equal(formatCount(512), '512');
  assert.equal(formatDuration(1e10), '317 YEARS');
  assert.equal(formatDuration(5.2e12), '165 THOUSAND YEARS');
  assert.equal(formatDuration(3 * 3600), '3 HOURS');
  assert.equal(formatDuration(0.004), '4 MS');
  assert.equal(formatDuration(60), '1 MINUTE');
  assert.equal(formatDuration(86400), '1 DAY');
  assert.equal(formatMhz(4), '4 MHz');
  assert.equal(formatMhz(4000), '4 GHz');
  assert.equal(formatMoney(1240), '$1,240');
});

test('a new game: single-cycle CPU at 1 MHz, no money', () => {
  assert.equal(tierOf(NEW_GAME).number, 1);
  assert.equal(ratedMhz(NEW_GAME), 1);
  assert.equal(NEW_GAME.money, 0);
});

test('CPU parts are bought in order, and each is the next tier; the pipeline runs 4x faster', () => {
  const rich: Progress = { ...NEW_GAME, money: 10_000 };
  assert.equal(buy(rich, 'forwarding'), null); // needs the pipeline first
  assert.equal(buy(NEW_GAME, 'pipeline'), null); // can't afford it
  const piped = buy(rich, 'pipeline');
  assert.ok(piped);
  assert.equal(piped.money, 10_000 - 300);
  assert.equal(tierOf(piped).number, 2);
  assert.equal(ratedMhz(piped), 4);
  assert.equal(buy(piped, 'pipeline'), null); // already owned
  const forwarded = buy(piped, 'forwarding');
  assert.equal(forwarded && tierOf(forwarded).number, 3);
});

test('clock upgrades step the rated clock up to 4 GHz on a pipeline', () => {
  let p: Progress = { ...NEW_GAME, money: 1e6, parts: ['pipeline'] };
  for (let i = 0; i < CLOCK.prices.length; i++) p = buy(p, 'clock') ?? p;
  assert.equal(ratedMhz(p), 4000);
  assert.equal(buy(p, 'clock'), null); // fully upgraded
});

test('repairs cost money per 10% of wear and restore the maximum clock', () => {
  const worn: Progress = { ...NEW_GAME, money: 500, chipMaxDial: 1.3 };
  const fixed = buy(worn, 'repair');
  assert.ok(fixed);
  assert.equal(fixed.chipMaxDial, 1.5);
  assert.equal(fixed.money, 500 - 2 * 60);
  assert.equal(buy(fixed, 'repair'), null); // nothing to repair
});

test('contracts: size, deadline and pay stay in their section, and time = instructions x CPI x period', () => {
  const random = seeded(7);
  for (const section of SECTIONS) {
    for (let i = 0; i < 50; i++) {
      const c = newContract(section.id, i, random);
      assert.ok(c.instructions >= section.instructions[0] * 0.95 && c.instructions <= section.instructions[1] * 1.05);
      assert.ok(c.deadline >= section.deadline[0] * 0.95 && c.deadline <= section.deadline[1] * 1.05);
      assert.ok(c.pay >= section.pay[0] && c.pay <= section.pay[1]);
    }
  }
  const job: Contract = { id: 1, section: 'standard', program: 'SUM ARRAY', instructions: 1e9, deadline: 86400, pay: 100 };
  assert.equal(contractSeconds(job, NEW_GAME), 1000); // CPI 1 at 1 MHz
  assert.equal(jobItems(job), 2e8); // SUM ARRAY: 5 instructions per byte
});

test("a contract is locked when your CPU can't meet its deadline, and tight when it only just can", () => {
  const day = 86400;
  const job: Contract = { id: 1, section: 'advanced', program: 'SUM ARRAY', instructions: 1e14, deadline: 30 * day, pay: 500 };
  assert.ok(isLocked(job, NEW_GAME)); // over 3 years at 1 MHz
  const fast: Progress = { ...NEW_GAME, parts: ['pipeline', 'forwarding'], clockLevel: 5 }; // 128 MHz: about 16 days
  assert.ok(!isLocked(job, fast));
  assert.ok(!isTight(job, fast));
  assert.ok(isTight({ ...job, deadline: 18 * day }, fast)); // 16 of 18 days: a sloppy run could be late
  assert.ok(isLocked({ ...job, deadline: 10 * day }, fast));
  // Even the biggest, most urgent advanced job is possible at 4 GHz with every part.
  const best: Progress = { ...NEW_GAME, parts: ['pipeline', 'forwarding', 'guessing', 'predictor1', 'predictor2'], clockLevel: 10 };
  const hardest = { ...job, instructions: SECTIONS[2].instructions[1], deadline: SECTIONS[2].deadline[0], program: 'SUM GRID' };
  assert.ok(!isLocked(hardest, best));
});

test('standard jobs are mostly out of reach on the starting CPU', () => {
  const random = seeded(11);
  const jobs = Array.from({ length: 200 }, (_, i) => newContract('standard', i, random));
  const open = jobs.filter((c) => !isLocked(c, NEW_GAME)).length;
  assert.ok(open > 0 && open < jobs.length * 0.25, `${open} of ${jobs.length} open at 1 MHz`);
  const piped: Progress = { ...NEW_GAME, parts: ['pipeline', 'forwarding'], clockLevel: 3 }; // 32 MHz
  assert.ok(jobs.filter((c) => !isLocked(c, piped)).length > open * 2);
});

test('the board is endless: finishing a contract pays and puts a new one in its place', () => {
  const random = seeded(3);
  const board = fillBoard(NEW_GAME, random);
  assert.equal(board.board.length, SECTIONS.length * 2);
  const done = board.board[0];
  const after = completeContract(board, done.id, random);
  assert.equal(after.money, done.pay);
  const late = completeContract(board, done.id, random, true);
  assert.equal(late.money, Math.round(done.pay / 2)); // past its deadline: half pay
  assert.equal(after.board.length, board.board.length);
  assert.ok(!after.board.some((c) => c.id === done.id));
  assert.equal(after.board.filter((c) => c.section === done.section).length, 2);
});

test('the board never shows the same client twice', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const board = fillBoard(NEW_GAME, seeded(seed)).board;
    const clients = board.map((c) => programByName(c.program).client);
    assert.equal(new Set(clients).size, clients.length, clients.join(', '));
  }
});

test('withTier gives exactly the parts for a tier (for testing)', () => {
  assert.equal(tierOf(withTier(NEW_GAME, 4)).number, 4);
  assert.deepEqual(withTier(NEW_GAME, 3).parts, ['pipeline', 'forwarding']);
  assert.equal(tierOf(withTier(withTier(NEW_GAME, 6), 1)).number, 1);
  assert.equal(tierOf(withTier(NEW_GAME, 99)).number, 6);
});
