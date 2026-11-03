import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programByName, PROGRAMS } from '../game/src/data/programs.ts';
import { NORMAL_WINDOWS } from '../game/src/rhythm/judge.ts';
import { PipelineRun } from '../game/src/rhythm/pipelineRun.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu, cpuFor as programCpu } from '../game/src/sim/cpu.ts';
import { unitOf } from '../game/src/sim/isa.ts';
import { addressSplit, Cache, cacheShape, cacheWords, cyclesFor, freezeBeats, L1_BASE, MemorySystem, missNs, ramCycles, setOf, tagOf } from '../game/src/sim/memory.ts';
import { perfectRun, type PipelineOptions } from '../game/src/sim/pipeline.ts';
import { Chip } from '../game/src/sim/thermal.ts';

const sumArray = PROGRAMS[0];
const cpuFor = (spec = sumArray) => new Cpu(assemble(spec.source), 8, spec.memory);

test('RAM takes a fixed 60 ns, so its cycles grow with the clock', () => {
  // A 4 MHz cycle is 250 ns: RAM fits. At 16 MHz (62.5 ns) it still just fits.
  assert.equal(ramCycles(4), 1);
  assert.equal(ramCycles(16), 1);
  // 32 MHz: 31.25 ns per cycle, so 60 ns needs 2. Then it climbs with the clock.
  assert.equal(ramCycles(32), 2);
  assert.equal(ramCycles(64), 4);
  assert.equal(ramCycles(256), 16);
  assert.equal(ramCycles(1000), 60);
  assert.equal(ramCycles(4000), 240);
  // Overclocked 10% past 4 GHz: 264, not 265 (no rounding creep).
  assert.equal(ramCycles(4000 * 1.1), 264);
  // With a cache, a miss checks L1 (1 ns) on the way: 61 ns.
  assert.equal(ramCycles(4000, L1_BASE), 244);
  assert.equal(cyclesFor(0.5, 4000), 2);
});

test('a memory wait is drawn over 2, 3 or 5 beats on a log scale, never more beats than cycles', () => {
  assert.equal(freezeBeats(0), 0);
  assert.equal(freezeBeats(1), 1); // one cycle is one beat, as always
  assert.equal(freezeBeats(2), 2);
  assert.equal(freezeBeats(9), 2);
  assert.equal(freezeBeats(10), 3);
  assert.equal(freezeBeats(99), 3);
  assert.equal(freezeBeats(100), 5);
  assert.equal(freezeBeats(243), 5);
});

test('an address splits into tag, line and offset: tttt ii oo', () => {
  // 13 = 0000 11 01: line 3, tag 0. 21 = 0001 01 01: line 1, tag 1.
  assert.deepEqual([setOf(L1_BASE, 13), tagOf(L1_BASE, 13)], [3, 0]);
  assert.deepEqual([setOf(L1_BASE, 21), tagOf(L1_BASE, 21)], [1, 1]);
  // 0 and 16 are a cache-full apart: same line, different tags.
  assert.deepEqual([setOf(L1_BASE, 0), tagOf(L1_BASE, 0)], [0, 0]);
  assert.deepEqual([setOf(L1_BASE, 16), tagOf(L1_BASE, 16)], [0, 1]);
});

test('reading bytes in order: one miss per 4-byte block, then hits (spatial locality)', () => {
  const cache = new Cache();
  const results = [0, 1, 2, 3, 4, 5].map((address) => cache.read(address));
  assert.deepEqual(results.map((r) => r.hit), [false, true, true, true, false, true]);
  assert.equal(results[0].missKind, 'first-use');
  assert.equal(results[4].missKind, 'first-use');
});

test('two blocks fighting over one line miss every time: conflict misses', () => {
  const cache = new Cache();
  const results = [0, 16, 1, 17].map((address) => cache.read(address));
  assert.deepEqual(results.map((r) => r.hit), [false, false, false, false]);
  assert.deepEqual(results.map((r) => r.missKind), ['first-use', 'first-use', 'conflict', 'conflict']);
  // Each miss pushed out the other block (block 0 = addresses 0-3, block 4 = 16-19).
  assert.equal(results[1].evicted, 0);
  assert.equal(results[2].evicted, 4);
});

test('more blocks than the cache holds, reused: capacity misses (too small)', () => {
  const cache = new Cache();
  // Blocks 0-4 (5 blocks, the cache holds 4), then block 0 again: even a cache
  // that could put blocks anywhere would have pushed it out by now.
  for (const address of [0, 4, 8, 12, 16]) cache.read(address);
  assert.deepEqual(cache.read(0), { hit: false, line: 0, missKind: 'too-small', evicted: 4 });
});

test('stores are write-through with no write allocate: a store miss leaves the cache alone', () => {
  const memory = new MemorySystem(L1_BASE);
  const store = memory.access('store', 8, 4000);
  assert.deepEqual([store.level, store.cycles, store.hit], ['BUFFER', 1, false]);
  const load = memory.access('load', 8, 4000);
  assert.deepEqual([load.level, load.cycles, load.missKind], ['RAM', 244, 'first-use']);
  assert.equal(memory.access('store', 9, 4000).hit, true);
  // Without a cache, a store waits for RAM like a load.
  assert.equal(new MemorySystem().access('store', 8, 4000).cycles, 240);
});

/** Cycles a perfect run of SUM ARRAY takes on this hardware. */
function sumArrayCycles(options: PipelineOptions): number {
  return perfectRun(cpuFor(), options).cycles;
}

test('SUM ARRAY: every load and store waits for RAM once the clock outruns it', () => {
  // 4 loads + 1 store. No wall: 35 cycles with forwarding (pipeline.test.ts).
  assert.equal(sumArrayCycles({ forwarding: true }), 35);
  assert.equal(sumArrayCycles({ forwarding: true, mhz: 16 }), 35);
  // 32 MHz: each access takes 2 cycles, 1 more than the MEMORY stage: +5.
  assert.equal(sumArrayCycles({ forwarding: true, mhz: 32 }), 40);
  // 4 GHz: 239 extra each: 35 + 5 x 239 = 1230, CPI 61.5 for 20 instructions.
  const run = perfectRun(cpuFor(), { forwarding: true, mhz: 4000 });
  assert.equal(run.cycles, 1230);
  assert.equal(run.memoryCycles, 1195);
  assert.equal(run.cpi, 61.5);
  // The answer is the same however long memory takes.
  assert.equal(run.cpu.memory[8], 17);
});

test('SUM ARRAY with the L1 cache at 4 GHz: one miss, three hits, and the store goes to the buffer', () => {
  const run = perfectRun(cpuFor(), { forwarding: true, mhz: 4000, cache: L1_BASE });
  // The first load misses (61 ns = 244 cycles, 243 frozen); bytes 1-3 came in with it.
  assert.equal(run.cycles, 35 + 243);
  assert.deepEqual([run.memory.loads, run.memory.hits, run.memory.misses, run.memory.stores], [4, 3, 1, 1]);
  assert.equal(run.memory.ramTrips, 1);
});

test('single-cycle CPU: a load or store stretches its long cycle', () => {
  // 20 instructions; at 32 MHz each of the 5 accesses adds a cycle.
  assert.equal(sumArrayCycles({ forwarding: false, singleCycle: true }), 20);
  assert.equal(sumArrayCycles({ forwarding: false, singleCycle: true, mhz: 32 }), 25);
});

test('a frozen pipeline keeps its distances: the load-use stall is still exactly one', () => {
  const cpu = new Cpu(assemble('addi x3, x0, 5\nlb x1, 0(x0)\nadd x2, x1, x1'), 8, [7]);
  const run = perfectRun(cpu, { forwarding: true, mhz: 4000 });
  assert.equal(run.stalls, 1);
  assert.equal(run.memoryCycles, 239);
  assert.equal(run.regs[2], 14);
});

test('in a song, a long memory wait freezes for 5 beats, ignores presses, and counts every cycle', () => {
  const chip = new Chip(4000);
  const run = new PipelineRun(cpuFor(), { forwarding: true }, 3, 0.4, NORMAL_WINDOWS, chip);
  const play = () => {
    const slot = run.pipeline.stages.ID;
    if (slot) run.press(run.pipeline.hazard() ? { kind: 'stall' } : { kind: 'route', unit: unitOf(slot.instr) }, run.dueBeat);
    run.update(run.dueBeat + 0.5);
  };
  while (!run.frozen) play();
  // The first load just reached memory: 239 cycles to wait, drawn over 5 beats.
  assert.deepEqual(run.waiting, { total: 239, left: 239, beatsLeft: 5 });
  const before = run.dueBeat;
  const id = run.pipeline.stages.ID;
  assert.ok(id);
  assert.equal(run.press({ kind: 'route', unit: unitOf(id.instr) }, run.dueBeat), null);
  run.update(run.dueBeat + 0.5);
  assert.equal(run.waiting?.beatsLeft, 4);
  for (let beat = 0; beat < 4; beat++) run.update(run.dueBeat + 0.5);
  assert.equal(run.frozen, false);
  assert.equal(run.dueBeat, before + 5);
  assert.equal(run.pipeline.memoryCycles, 239);
  // The chip counted all 239 cycles' time at 4 GHz (0.25 ns each).
  assert.equal(chip.cycles, run.pipeline.cycle - 1);
  while (!run.done) play();
  assert.equal(run.pipeline.cycles, 1230);
  assert.equal(run.waitBeats, 25);
  assert.equal(run.pipeline.cpu.memory[8], 17);
});

// ---- the L1's upgrades (data/economy.ts CACHE_UPGRADES): the cache's shape as data ----

test('each upgrade changes one thing about the L1, in any order', () => {
  assert.deepEqual(cacheShape([]), L1_BASE);
  assert.deepEqual(cacheShape(['lines']), { lines: 8, blockBytes: 4, ways: 1 });
  assert.deepEqual(cacheShape(['ways']), { lines: 4, blockBytes: 4, ways: 2 });
  assert.deepEqual(cacheShape(['blocks']), { lines: 4, blockBytes: 8, ways: 1 });
  assert.deepEqual(cacheShape(['blocks', 'lines', 'ways']), cacheShape(['ways', 'blocks', 'lines']));
  assert.equal(cacheWords(L1_BASE), '16 BYTES: 4 LINES OF 4, DIRECT-MAPPED');
  // 2-way pairs the same 4 lines: still 16 bytes.
  assert.equal(cacheWords(cacheShape(['ways'])), '16 BYTES: 4 LINES OF 4, 2-WAY');
  assert.equal(cacheWords(cacheShape(['lines', 'ways', 'blocks'])), '64 BYTES: 8 LINES OF 8, 2-WAY');
});

test("an 8-bit address splits by the cache's shape: tag, set (or line), offset", () => {
  const split = (upgrades: Parameters<typeof cacheShape>[0]) => Object.values(addressSplit(cacheShape(upgrades)));
  assert.deepEqual(split([]), [4, 2, 2]); // tttt ii oo
  assert.deepEqual(split(['lines']), [3, 3, 2]); // 8 lines: one more line bit
  assert.deepEqual(split(['ways']), [5, 1, 2]); // 2 sets: one set bit, one more tag bit
  assert.deepEqual(split(['blocks']), [3, 2, 3]); // 8-byte blocks: one more offset bit
  assert.deepEqual(split(['lines', 'ways', 'blocks']), [3, 2, 3]); // 4 sets of 8-byte blocks
  // 22 = 0001 01 10 in the first L1; in 2-way sets 00010 1 10: set 1, tag 2.
  const ways = cacheShape(['ways']);
  assert.deepEqual([setOf(L1_BASE, 22), tagOf(L1_BASE, 22)], [1, 1]);
  assert.deepEqual([setOf(ways, 22), tagOf(ways, 22)], [1, 2]);
});

test('2-way: two blocks that share a set both fit, and the one used longest ago makes room', () => {
  const cache = new Cache(cacheShape(['ways']));
  // Blocks 0 (bytes 0-3) and 4 (16-19) both need set 0: direct-mapped they'd push each other out.
  const results = [0, 16, 1, 17].map((address) => cache.read(address));
  assert.deepEqual(results.map((r) => r.hit), [false, false, true, true]);
  assert.deepEqual(results.map((r) => r.line), [0, 1, 0, 1]);
  // Block 8 (32-35) needs set 0 too: block 0 was used longest ago (17 came after 1), so it goes.
  assert.deepEqual(cache.read(32), { hit: false, line: 0, missKind: 'first-use', evicted: 0 });
  assert.equal(cache.read(16).hit, true);
  // A cache that put any block anywhere would have kept block 0 (only 3 blocks in use): a conflict.
  assert.equal(cache.read(0).missKind, 'conflict');
});

test('8 lines: five blocks read again all still fit', () => {
  const cache = new Cache(cacheShape(['lines']));
  for (const address of [0, 4, 8, 12, 16]) cache.read(address);
  // The first L1 lost block 0 here (too small); with 8 lines block 4 has a line of its own.
  assert.deepEqual(cache.read(0), { hit: true, line: 0 });
  assert.equal(cache.read(16).line, 4);
});

test('8-byte blocks: one miss per 8 bytes in order, each 5 ns longer', () => {
  const big = cacheShape(['blocks']);
  const cache = new Cache(big);
  const results = Array.from({ length: 10 }, (_, address) => cache.read(address));
  assert.deepEqual(results.map((r) => r.hit), [false, true, true, true, true, true, true, true, false, true]);
  // 1 ns for L1, 60 for RAM, 5 more for the second 4 bytes: 66 ns, 264 cycles at 4 GHz.
  assert.equal(missNs(big), 66);
  assert.equal(ramCycles(4000, big), 264);
  // A 64-bit number fits in one 8-byte block: one trip, not the two it takes in 4-byte blocks.
  assert.equal(new MemorySystem(big).access('load', 8, 4000, 8).cycles, 264);
  assert.equal(new MemorySystem(L1_BASE).access('load', 8, 4000, 8).cycles, 2 * 244);
});

/** A program's loads on a cache: how many missed, and of each kind (a perfect run at 4 GHz). */
function misses(program: string, upgrades: Parameters<typeof cacheShape>[0]) {
  const run = perfectRun(programCpu(programByName(program)), { forwarding: true, mhz: 4000, cache: cacheShape(upgrades) });
  const without = perfectRun(programCpu(programByName(program)), { forwarding: true });
  // Every trip to RAM freezes the pipeline for its cycles beyond the MEMORY stage's one.
  assert.equal(run.cycles, without.cycles + run.memory.ramTrips * (ramCycles(4000, cacheShape(upgrades)) - 1), program);
  return { misses: run.memory.misses, ...run.memory.missKinds };
}

test("each upgrade's practice program: the misses it fixes, counted by hand", () => {
  // SUM WORDS: six 32-bit numbers, each a 4-byte block of its own: 6 first uses. In 8-byte blocks, two to a block: 3.
  assert.deepEqual(misses('SUM WORDS', []), { misses: 6, 'first-use': 6, conflict: 0, 'too-small': 0 });
  assert.deepEqual(misses('SUM WORDS', ['blocks']), { misses: 3, 'first-use': 3, conflict: 0, 'too-small': 0 });
  // ADD TWO LISTS: 6 pairs 16 bytes apart. Blocks 0, 1 (first list) and 4, 5 (second) are first uses;
  // every other load finds the other list's block in its line: 8 conflicts. 2-way sets hold both.
  assert.deepEqual(misses('ADD TWO LISTS', []), { misses: 12, 'first-use': 4, conflict: 8, 'too-small': 0 });
  assert.deepEqual(misses('ADD TWO LISTS', ['ways']), { misses: 4, 'first-use': 4, conflict: 0, 'too-small': 0 });
  // TWO PASSES: six 32-bit numbers (blocks 0-5), read twice. By the second pass lines 0 and 1 hold blocks 4 and 5:
  // blocks 0 and 1 miss, 2 and 3 hit, then 4 and 5 miss again (0 and 1 took their lines): 4 too small. 8 lines hold all six.
  assert.deepEqual(misses('TWO PASSES', []), { misses: 10, 'first-use': 6, conflict: 0, 'too-small': 4 });
  assert.deepEqual(misses('TWO PASSES', ['lines']), { misses: 6, 'first-use': 6, conflict: 0, 'too-small': 0 });
  // Each program leaves its answer, whatever the cache.
  const sums = perfectRun(programCpu(programByName('TWO PASSES')), { forwarding: true, mhz: 4000, cache: L1_BASE }).cpu;
  assert.equal(sums.regs[3], 203000);
});
