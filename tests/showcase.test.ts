import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOWCASE } from '../game/src/data/economy.ts';
import { parseSave, saveText } from '../game/src/saveFile.ts';
import { cpuFor } from '../game/src/sim/cpu.ts';
import { generateProgram, kindOf } from '../game/src/sim/generator.ts';
import { perfectRun } from '../game/src/sim/pipeline.ts';
import { buy, fillBoard, hardwareOptions, NEW_GAME, newContract, withTier, type Progress } from '../game/src/sim/progress.ts';
import { gainOf, partsInUse, SHOWCASES, showcaseJob, showcaseLine } from '../game/src/sim/showcase.ts';

// Jobs adapt to what you buy (sim/showcase.ts): most new jobs are picked because a part you use speeds them up.

/** A seeded random (Park-Miller), so a deal can be repeated. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const part = (id: string) => {
  const found = SHOWCASES.find((each) => each.id === id);
  assert.ok(found, id);
  return found;
};

/** A tier 7 CPU on the 32-bit chip at 256 MHz, with the L1 (one size step) and the L2, superscalar bought last. */
const tier7: Progress = {
  ...withTier({ ...NEW_GAME, wordBits: 32 }, 7),
  wordBits: 32,
  clockLevel: 6,
  cacheLevels: 2,
  cacheSizes: [1, 0, 0],
  bought: ['pipeline', 'forwarding', 'l1', 'guessing', 'predictor1', 'predictor2', 'l1size', 'l2', 'superscalar'],
};

test('the parts a job can show off are the ones your CPU uses now, newest last (by the shop log, else their own order)', () => {
  assert.deepEqual(partsInUse(NEW_GAME), []);
  assert.deepEqual(partsInUse(tier7).map((each) => each.id), ['forwarding', 'predictor2', 'l1size', 'l2', 'superscalar']);
  // The 1-bit predictor gave way to the 2-bit one; the L1 to the L2 below it (only the lowest level is shown off).
  assert.ok(!part('predictor1').inUse(tier7) && !part('l1').inUse(tier7));
  // A save from before the log: the table's order.
  assert.deepEqual(partsInUse({ ...tier7, bought: [] }).map((each) => each.id), ['forwarding', 'predictor2', 'superscalar', 'l1size', 'l2']);
  // Buying logs the shop key, at the end even if bought before.
  const bought = buy({ ...tier7, money: 10_000, bought: ['l1size', 'l2'] }, 'l1size');
  assert.deepEqual(bought?.bought, ['l2', 'l1size']);
});

test('the board estimates your CPU as it is: a superscalar CPU pairs, so its jobs take less time', () => {
  assert.equal(hardwareOptions(tier7).superscalar, true);
  assert.equal(hardwareOptions(withTier({ ...NEW_GAME, wordBits: 32 }, 6)).superscalar, false);
  assert.ok(gainOf('FILL #1', part('superscalar'), tier7) > 1.2);
});

test('most new jobs show off a part, the newest most often, and each one really is faster with it', () => {
  const random = seeded(11);
  const counts = new Map<string, number>();
  const deals = 300;
  for (let i = 0; i < deals; i++) {
    const contract = newContract('fair', i, random, tier7);
    const shows = contract.shows ?? 'none';
    counts.set(shows, (counts.get(shows) ?? 0) + 1);
    if (contract.shows) {
      assert.ok(gainOf(contract.program, part(contract.shows), tier7) >= SHOWCASE.minGain, `${contract.program} for ${contract.shows}`);
      assert.match(showcaseLine(contract, tier7) ?? '', /^YOUR [A-Z0-9 -]+: (\d+%|\d+\.\dx) FASTER ON THIS JOB$/);
    } else assert.equal(showcaseLine(contract, tier7), undefined);
  }
  const share = (id: string) => (counts.get(id) ?? 0) / deals;
  // About three in four (a few find no job the part speeds up enough); the newest part, superscalar, the most.
  assert.ok(share('none') > 0.15 && share('none') < 0.4, `${share('none')} ordinary`);
  assert.ok(share('superscalar') > 0.25, `superscalar ${share('superscalar')}`);
  for (const id of ['forwarding', 'predictor2', 'l1size', 'l2']) assert.ok(share('superscalar') > share(id), `${id} ${share(id)}`);
  // A new game has nothing to show off, and draws nothing for it: its board is dealt as before.
  assert.equal(showcaseJob(NEW_GAME, () => assert.fail('drew a number')), undefined);
});

test('each part picks the jobs it changes: unrolled loops for superscalar, data read twice for a bigger L1', () => {
  const pick = (progress: Progress, id: string, seed: number) => {
    const latest: Progress = { ...progress, bought: [...progress.bought.filter((key) => key !== id), id] };
    // Always a showcase, always the newest part.
    const random = seeded(seed);
    let draws = 0;
    const steered = () => (draws++ < 2 ? 0 : random());
    return showcaseJob(latest, steered);
  };
  const superscalar = new Set<string>();
  const bigger = new Set<string>();
  const withStep: Progress = { ...tier7, cacheLevels: 1, cacheSizes: [1, 0, 0] };
  for (let seed = 1; seed <= 40; seed++) {
    superscalar.add(kindOf(pick(tier7, 'superscalar', seed)?.program.name ?? 'none #1'));
    bigger.add(kindOf(pick(withStep, 'l1size', seed)?.program.name ?? 'none #1'));
  }
  assert.ok(superscalar.has('UNROLLED SUM') || superscalar.has('UNROLLED CHECKSUM'), [...superscalar].join());
  for (const kind of superscalar) assert.ok(['UNROLLED SUM', 'UNROLLED CHECKSUM', 'FILL', 'COPY', 'DOUBLE', 'none'].includes(kind), kind);
  // A bigger L1: wide data read twice (bytes fit the first L1 anyway).
  assert.ok(bigger.has('OTHERS') && bigger.has('CHECKED COPY'), [...bigger].join());
});

test("a level's size step is shown off against the same level one step smaller, on data wide enough to need it", () => {
  const l1size = part('l1size');
  const one: Progress = { ...tier7, cacheLevels: 1, cacheSizes: [1, 0, 0] };
  assert.ok(l1size.inUse(one) && !l1size.inUse({ ...one, cacheSizes: [0, 0, 0] }));
  assert.deepEqual(l1size.without(hardwareOptions(one), one).cache, { lines: 4, blockBytes: 4 });
  assert.deepEqual(l1size.widths?.(one), [16, 32, 64]);
  const deep: Progress = { ...tier7, wordBits: 64, cacheLevels: 3, cacheSizes: [2, 2, 1] };
  const l2size = part('l2size');
  const l3size = part('l3size');
  assert.ok(l2size.inUse(deep) && l3size.inUse(deep));
  assert.ok(!l2size.inUse({ ...deep, cacheLevels: 1 }));
  // Without it, only that level shrinks a step; the others stay as they are.
  const options = hardwareOptions(deep);
  const noL2 = l2size.without(options, deep);
  assert.deepEqual(noL2.lowerCaches?.map((level) => level.shape.blockBytes), [32, 128]);
  assert.deepEqual(noL2.cache, options.cache);
  assert.deepEqual(l3size.without(options, deep).lowerCaches?.map((level) => level.shape.blockBytes), [64, 64]);
  assert.deepEqual([l2size.widths?.(deep), l3size.widths?.(deep)], [[32, 64], [64]]);
});

test('an unrolled loop pairs: superscalar speeds it up more than the plain loop', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const gain = (kind: string) => {
      const spec = generateProgram(seed, kind);
      return perfectRun(cpuFor(spec), { forwarding: true }).cycles / perfectRun(cpuFor(spec), { forwarding: true, superscalar: true }).cycles;
    };
    assert.ok(gain('UNROLLED SUM') > 1.3, `#${seed}: ${gain('UNROLLED SUM')}`);
    assert.ok(gain('UNROLLED SUM') > gain('SUM'));
  }
});

test('a showcase job keeps what it shows off through a save; an unknown part is dropped', () => {
  const board = fillBoard(tier7, seeded(5));
  assert.ok(board.board.some((contract) => contract.shows));
  const saved = parseSave(saveText(board, 0));
  assert.deepEqual(saved?.progress.board, board.board);
  assert.deepEqual(saved?.progress.bought, tier7.bought);
  const edited = { ...board, board: board.board.map((contract) => ({ ...contract, shows: 'teleporter' })), bought: ['l1', 'l2', 'l1', 7] };
  const cleaned = parseSave(saveText(edited as unknown as Progress, 0))?.progress;
  assert.ok(cleaned?.board.every((contract) => contract.shows === undefined));
  assert.deepEqual(cleaned?.bought, ['l2', 'l1']);
});
