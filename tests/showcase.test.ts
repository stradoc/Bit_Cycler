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

/** A tier 7 CPU on the 32-bit chip at 256 MHz, with the L1 (2-way) and the L2, superscalar bought last. */
const tier7: Progress = {
  ...withTier({ ...NEW_GAME, wordBits: 32 }, 7),
  wordBits: 32,
  clockLevel: 6,
  cacheLevels: 2,
  cacheUpgrades: ['ways'],
  bought: ['pipeline', 'forwarding', 'l1', 'guessing', 'predictor1', 'predictor2', 'ways', 'l2', 'superscalar'],
};

test('the parts a job can show off are the ones your CPU uses now, newest last (by the shop log, else their own order)', () => {
  assert.deepEqual(partsInUse(NEW_GAME), []);
  assert.deepEqual(partsInUse(tier7).map((each) => each.id), ['forwarding', 'predictor2', 'ways', 'l2', 'superscalar']);
  // The 1-bit predictor gave way to the 2-bit one; the L1 to the L2 below it (only the lowest level is shown off).
  assert.ok(!part('predictor1').inUse(tier7) && !part('l1').inUse(tier7));
  // A save from before the log: the table's order.
  assert.deepEqual(partsInUse({ ...tier7, bought: [] }).map((each) => each.id), ['forwarding', 'predictor2', 'superscalar', 'ways', 'l2']);
  // Buying logs the shop key, at the end even if bought before.
  const bought = buy({ ...tier7, money: 10_000, bought: ['blocks', 'l2'] }, 'blocks');
  assert.deepEqual(bought?.bought, ['l2', 'blocks']);
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
  for (const id of ['forwarding', 'predictor2', 'ways', 'l2']) assert.ok(share('superscalar') > share(id), `${id} ${share(id)}`);
  // A new game has nothing to show off, and draws nothing for it: its board is dealt as before.
  assert.equal(showcaseJob(NEW_GAME, () => assert.fail('drew a number')), undefined);
});

test('each part picks the jobs it changes: unrolled loops for superscalar, colliding arrays for 2-WAY, data read twice for 8 LINES', () => {
  const pick = (progress: Progress, id: string, seed: number) => {
    const latest: Progress = { ...progress, bought: [...progress.bought.filter((key) => key !== id), id] };
    // Always a showcase, always the newest part.
    const random = seeded(seed);
    let draws = 0;
    const steered = () => (draws++ < 2 ? 0 : random());
    return showcaseJob(latest, steered);
  };
  const superscalar = new Set<string>();
  const ways = new Set<string>();
  const lines = new Set<string>();
  const withLines: Progress = { ...tier7, cacheLevels: 1, cacheUpgrades: ['lines'] };
  // The L1 alone: with the L2 behind it, a conflict miss is answered in 6 ns and 2-WAY saves only about a tenth.
  const l1Ways: Progress = { ...tier7, cacheLevels: 1 };
  for (let seed = 1; seed <= 40; seed++) {
    superscalar.add(kindOf(pick(tier7, 'superscalar', seed)?.program.name ?? 'none #1'));
    const collide = pick(l1Ways, 'ways', seed);
    if (collide) {
      ways.add(collide.program.name.replace(/ #\d+$/, ''));
      // Two arrays a cache apart: their blocks keep pushing each other out of a line, and both fit in a 2-way set.
      assert.ok(gainOf(collide.program.name, part('ways'), l1Ways) > 1.4, collide.program.name);
    }
    lines.add(kindOf(pick(withLines, 'lines', seed)?.program.name ?? 'none #1'));
  }
  assert.ok(superscalar.has('UNROLLED SUM') || superscalar.has('UNROLLED CHECKSUM'), [...superscalar].join());
  for (const kind of superscalar) assert.ok(['UNROLLED SUM', 'UNROLLED CHECKSUM', 'FILL', 'COPY', 'DOUBLE', 'none'].includes(kind), kind);
  // 2-WAY: only arrays whose blocks hold more than one item (bytes and 16-bit with 4-byte blocks).
  for (const name of ways) assert.match(name, /^(16-BIT )?ADD ARRAYS$/);
  assert.ok(ways.size > 0);
  // 8 LINES: wide data read twice (bytes fit the first L1 anyway).
  assert.ok(lines.has('OTHERS') && lines.has('CHECKED COPY'), [...lines].join());
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
