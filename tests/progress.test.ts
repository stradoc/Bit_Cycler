import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIPS, CLOCK, SECTIONS } from '../game/src/data/economy.ts';
import { programByName } from '../game/src/data/programs.ts';
import { formatCount, formatDuration, formatMhz, formatMoney } from '../game/src/format.ts';
import {
  bitsName,
  buy,
  chipByBits,
  chipNeeded,
  completeContract,
  contractSeconds,
  cpiFor,
  cpuLine,
  cpuName,
  fillBoard,
  isLocked,
  isTight,
  jobItems,
  NEW_GAME,
  newContract,
  pastMemoryWall,
  ratedMhz,
  shopItems,
  tierOf,
  withTier,
  withWordBits,
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

test('CPU parts are bought in order, and each is the next tier on a chip that runs it; the pipeline runs 4x faster', () => {
  const rich: Progress = { ...NEW_GAME, money: 10_000 };
  assert.equal(buy(rich, 'pipeline'), null); // needs the 16-bit chip first
  const wide = buy(rich, 'chip16');
  assert.ok(wide);
  assert.equal(wide.wordBits, 16);
  assert.equal(buy(wide, 'forwarding'), null); // needs the pipeline first
  assert.equal(buy({ ...wide, money: 0 }, 'pipeline'), null); // can't afford it
  const piped = buy(wide, 'pipeline');
  assert.ok(piped);
  assert.equal(piped.money, 10_000 - 250 - 300);
  assert.equal(tierOf(piped).number, 2);
  assert.equal(ratedMhz(piped), 4);
  assert.equal(buy(piped, 'pipeline'), null); // already owned
  assert.equal(buy(piped, 'forwarding'), null); // needs the 32-bit chip
  const wider = buy(piped, 'chip32');
  const forwarded = wider && buy(wider, 'forwarding');
  assert.equal(forwarded && tierOf(forwarded).number, 3);
});

test('chips follow history: each goes on sale after its tier, in order, and the shop lists them where they fall', () => {
  const rich: Progress = { ...NEW_GAME, money: 1e6 };
  const state = (p: Progress, key: string) => shopItems(p).find((item) => item.key === key)?.state;
  assert.equal(state(rich, 'chip16'), 'buy'); // after tier 1, which every CPU has
  assert.equal(state(rich, 'chip32'), 'later'); // the 16-bit chip comes first
  const piped = { ...withTier(rich, 2), wordBits: 16 } as const;
  assert.equal(state(piped, 'chip32'), 'buy');
  assert.equal(state({ ...withTier(rich, 5), wordBits: 32 }, 'chip64'), 'later'); // after tier 6
  assert.equal(state({ ...withTier(rich, 6), wordBits: 32 }, 'chip64'), 'buy');
  const cpu = shopItems(rich).filter((item) => item.group === 'CPU').map((item) => item.key);
  assert.deepEqual(cpu, ['chip16', 'pipeline', 'chip32', 'forwarding', 'guessing', 'deep', 'predictor1', 'predictor2', 'chip64']);
});

test('each chip has a top clock: 4 MHz at 8-bit, 16 MHz at 16-bit with the pipeline, 2 GHz at 32-bit, 4 GHz at 64-bit', () => {
  const topClock = (p: Progress) => {
    for (let i = 0; i < CLOCK.prices.length; i++) p = buy(p, 'clock') ?? p;
    return p;
  };
  const rich: Progress = { ...NEW_GAME, money: 1e7 };
  const eight = topClock(rich);
  assert.equal(ratedMhz(eight), 4);
  assert.equal(shopItems(eight).find((item) => item.key === 'clock')?.name, 'CLOCK: TOP SPEED FOR THIS CHIP');
  assert.equal(ratedMhz(topClock({ ...withTier(rich, 2), wordBits: 16 })), 16);
  assert.equal(ratedMhz(topClock({ ...withTier(rich, 3), wordBits: 32 })), 2000);
  const top = topClock({ ...withTier(rich, 6), wordBits: 64 });
  assert.equal(ratedMhz(top), 4000);
  assert.equal(buy(top, 'clock'), null); // the power wall
  assert.match(shopItems(top).find((item) => item.key === 'clock')?.about ?? '', /power wall/);
});

test('the CPU is described one way everywhere: word size, tier, then the rated clock', () => {
  const piped: Progress = { ...withTier(NEW_GAME, 2), wordBits: 16, clockLevel: 2 };
  assert.equal(bitsName(32), '32-BIT');
  assert.equal(cpuName(NEW_GAME), '8-BIT, TIER 1 SINGLE-CYCLE');
  assert.equal(cpuLine(piped), '16-BIT, TIER 2 PIPELINE AT 16 MHz');
  assert.equal(chipByBits(64)?.name, '64-BIT CPU');
  assert.equal(chipByBits(12), undefined);
});

test("a save's chip fits its parts and clock: old saves move up, and a narrower chip takes parts off", () => {
  assert.equal(chipNeeded(NEW_GAME), 8);
  assert.equal(chipNeeded({ ...NEW_GAME, parts: ['pipeline'] }), 16);
  assert.equal(chipNeeded({ ...NEW_GAME, parts: ['pipeline', 'forwarding'] }), 32);
  assert.equal(chipNeeded({ ...NEW_GAME, clockLevel: 3 }), 32); // past 16-bit's top step
  assert.equal(chipNeeded({ ...NEW_GAME, clockLevel: CLOCK.factors.length - 1 }), 64);
  assert.equal(withTier(NEW_GAME, 4).wordBits, 32);
  const narrowed = withWordBits({ ...withTier(NEW_GAME, 6), wordBits: 64, clockLevel: 10 }, 16);
  assert.deepEqual(narrowed.parts, ['pipeline']);
  assert.equal(narrowed.clockLevel, CHIPS[1].maxClock);
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
  // 128 MHz with forwarding: every load waits 8 cycles for RAM, so about 32 days.
  const fast: Progress = { ...NEW_GAME, parts: ['pipeline', 'forwarding'], clockLevel: 5 };
  assert.ok(isLocked(job, fast));
  // The L1 cache: one miss per 4-byte block instead of a trip for every byte, about 19 days.
  const cached: Progress = { ...fast, cacheLevels: 1 };
  assert.ok(!isLocked(job, cached));
  assert.ok(!isTight(job, cached));
  assert.ok(isTight({ ...job, deadline: 22 * day }, cached)); // 19 of 22 days: a sloppy run could be late
  assert.ok(isLocked({ ...job, deadline: 15 * day }, cached));
  // Even the biggest, most urgent advanced job is possible at 4 GHz with every part and the cache, on
  // the program that misses the cache most when its data doesn't collide; without the cache it's out of reach.
  const best: Progress = { ...NEW_GAME, parts: ['pipeline', 'forwarding', 'guessing', 'predictor1', 'predictor2'], clockLevel: 10, cacheLevels: 1 };
  const hardest = { ...job, instructions: SECTIONS[2].instructions[1], deadline: SECTIONS[2].deadline[0], program: 'ADD ARRAYS #16' };
  assert.ok(!isLocked(hardest, best));
  assert.ok(isLocked(hardest, { ...best, cacheLevels: 0 }));
  // Arrays a cache-full apart (ADD ARRAYS #1) miss on every load: over twice as slow, so that job is locked.
  assert.ok(cpiFor('ADD ARRAYS #1', best) > 2 * cpiFor('ADD ARRAYS #16', best));
  assert.ok(isLocked({ ...hardest, program: 'ADD ARRAYS #1' }, best));
});

test('the memory wall: clock upgrades past it help less, and the L1 cache goes on sale', () => {
  const piped: Progress = { ...NEW_GAME, wordBits: 32, parts: ['pipeline', 'forwarding'], money: 10_000, clockLevel: 2 }; // 16 MHz
  assert.ok(!pastMemoryWall(piped));
  const l1 = (p: Progress) => shopItems(p).find((item) => item.key === 'l1');
  assert.equal(l1(piped)?.state, 'later');
  // The next clock (32 MHz) is the first that outruns RAM: it comes with the memory wall briefing.
  const clock = shopItems(piped).find((item) => item.key === 'clock');
  assert.equal(clock?.lessonId, 'memwall');
  const faster = buy(piped, 'clock');
  assert.ok(faster && pastMemoryWall(faster));
  assert.equal(shopItems(faster).find((item) => item.key === 'clock')?.lessonId, undefined);
  assert.equal(l1(faster)?.state, 'buy');
  assert.equal(l1(faster)?.lessonId, 'cache');
  const cached = buy(faster, 'l1');
  assert.equal(cached?.cacheLevels, 1);
  assert.equal(cached && l1(cached)?.state, 'owned');
  // Past the wall, a faster clock barely helps a typical job without a cache: 1 GHz -> 2 GHz saves under 10%.
  const late: Progress = { ...piped, clockLevel: 8 };
  const saved = Number(/\((\d+)% less\)/.exec(shopItems(late).find((item) => item.key === 'clock')?.about ?? '')?.[1]);
  assert.ok(saved < 10, `saved ${saved}%`);
  // With the cache, the same upgrade is worth more.
  const savedCached = Number(/\((\d+)% less\)/.exec(shopItems({ ...late, cacheLevels: 1 }).find((item) => item.key === 'clock')?.about ?? '')?.[1]);
  assert.ok(savedCached > saved, `${savedCached}% vs ${saved}%`);
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
