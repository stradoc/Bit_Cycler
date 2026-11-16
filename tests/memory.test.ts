import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programByName, PROGRAMS } from '../game/src/data/programs.ts';
import { NORMAL_WINDOWS } from '../game/src/rhythm/judge.ts';
import { PipelineRun } from '../game/src/rhythm/pipelineRun.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu, cpuFor as programCpu } from '../game/src/sim/cpu.ts';
import { unitOf } from '../game/src/sim/isa.ts';
import { Cache, cachesBelow, cacheShape, cacheWords, cyclesFor, freezeBeats, L1_BASE, LOWER_CACHES, MemorySystem, missNs, ramCycles } from '../game/src/sim/memory.ts';
import { MEMORY_PARTS } from '../game/src/data/economy.ts';
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

test('a memory wait gets a beat more each time its cycles about triple, never more beats than cycles', () => {
  assert.equal(freezeBeats(0), 0);
  assert.equal(freezeBeats(1), 1); // one cycle is one beat, as always
  assert.equal(freezeBeats(2), 2);
  assert.equal(freezeBeats(9), 2);
  assert.equal(freezeBeats(10), 3);
  assert.equal(freezeBeats(31), 3);
  assert.equal(freezeBeats(32), 4);
  assert.equal(freezeBeats(99), 4);
  assert.equal(freezeBeats(100), 5);
  assert.equal(freezeBeats(243), 5); // the L1 alone at 4 GHz: a trip to RAM is 5 beats, as before the L2
  assert.equal(freezeBeats(316), 5);
  assert.equal(freezeBeats(317), 6);
  // At the 32-bit chip's top clock and the 64-bit chip's, the levels each take longer than the one before: 3, 4 and 5 beats.
  for (const mhz of [2000, 4000]) {
    const beats = (from: 'L2' | 'L3' | 'RAM') => freezeBeats(cyclesFor(missNs(L1_BASE, cachesBelow(2), from), mhz) - 1);
    assert.deepEqual([beats('L2'), beats('L3'), beats('RAM')], [3, 4, 5], `${mhz} MHz`);
  }
});

test('reading bytes in order: one miss per 4-byte block, then hits (spatial locality)', () => {
  const cache = new Cache();
  const results = [0, 1, 2, 3, 4, 5].map((address) => cache.read(address));
  assert.deepEqual(results.map((r) => r.hit), [false, true, true, true, false, true]);
  assert.equal(results[0].missKind, 'first-use');
  assert.equal(results[4].missKind, 'first-use');
});

test('any block can go in any line: two blocks a cache apart both stay', () => {
  const cache = new Cache();
  const results = [0, 16, 1, 17].map((address) => cache.read(address));
  assert.deepEqual(results.map((r) => r.hit), [false, false, true, true]);
  assert.deepEqual(results.map((r) => r.line), [0, 1, 0, 1]);
});

test('more blocks than the cache holds, reused: the line used longest ago made room (too small)', () => {
  const cache = new Cache();
  // Blocks 0-4 (5 blocks, the cache holds 4): block 4 pushed out block 0, the one used longest ago.
  for (const address of [0, 4, 8, 12, 16]) cache.read(address);
  // Block 0 again: too small. Now block 1 (addresses 4-7, in line 1) is the one used longest ago.
  assert.deepEqual(cache.read(0), { hit: false, line: 1, missKind: 'too-small', evicted: 1 });
  assert.deepEqual(cache.lines.map((line) => line.block), [4, 0, 2, 3]);
});

test('misses are first use or too small: there are no others', () => {
  assert.deepEqual(Object.keys(new MemorySystem(L1_BASE).missKinds), ['first-use', 'too-small']);
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

// ---- size steps (data/economy.ts MEMORY_PARTS' sizes): each doubles a level's blocks ----

test("each level's size steps double its blocks, and stop at the last", () => {
  assert.deepEqual(cacheShape(0), L1_BASE);
  assert.deepEqual([0, 1, 2, 3].map((steps) => cacheShape(0, steps).blockBytes), [4, 8, 16, 16]);
  assert.deepEqual(cacheShape(1, 2), { lines: 8, blockBytes: 64 });
  assert.deepEqual(cacheShape(2, 2), { lines: 4, blockBytes: 256 });
  assert.equal(cacheWords(L1_BASE), '16 BYTES: 4 LINES OF 4');
  assert.equal(cacheWords(cacheShape(0, 2)), '64 BYTES: 4 LINES OF 16');
  assert.deepEqual(cachesBelow(2, [0, 1, 2]).map((level) => level.shape.blockBytes), [32, 256]);
});

test("a level's blocks are never smaller than the level above's, at any steps", () => {
  const most = MEMORY_PARTS.map((part) => part.sizes.length);
  for (let a = 0; a <= most[0]; a++) for (let b = 0; b <= most[1]; b++) for (let c = 0; c <= most[2]; c++) {
    const blocks = [cacheShape(0, a), ...cachesBelow(2, [a, b, c]).map((level) => level.shape)].map((shape) => shape.blockBytes);
    assert.ok(blocks[0] <= blocks[1] && blocks[1] <= blocks[2], `${a}${b}${c}: ${blocks}`);
  }
});

test('8-byte blocks: one miss per 8 bytes in order, each 5 ns longer', () => {
  const big = cacheShape(0, 1);
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

test("bigger L1 blocks make a trip to RAM longer; a lower level's bigger blocks add nothing", () => {
  assert.equal(missNs(L1_BASE), 61);
  assert.equal(missNs(cacheShape(0, 1)), 66);
  assert.equal(missNs(cacheShape(0, 2)), 76);
  assert.equal(missNs(L1_BASE, cachesBelow(2, [0, 2, 2])), 78);
});

/** A program's loads on a cache: how many missed, and of each kind (a perfect run at 4 GHz). */
function misses(program: string, steps: number) {
  const run = perfectRun(programCpu(programByName(program)), { forwarding: true, mhz: 4000, cache: cacheShape(0, steps) });
  const without = perfectRun(programCpu(programByName(program)), { forwarding: true });
  // Every trip to RAM freezes the pipeline for its cycles beyond the MEMORY stage's one.
  assert.equal(run.cycles, without.cycles + run.memory.ramTrips * (ramCycles(4000, cacheShape(0, steps)) - 1), program);
  return { misses: run.memory.misses, ...run.memory.missKinds };
}

test("the practice programs: the misses each L1 size step saves, counted by hand", () => {
  // SUM WORDS: six 32-bit numbers, each a 4-byte block of its own: 6 first uses. In 8-byte blocks, two to a block: 3. In 16, four: 2.
  assert.deepEqual(misses('SUM WORDS', 0), { misses: 6, 'first-use': 6, 'too-small': 0 });
  assert.deepEqual(misses('SUM WORDS', 1), { misses: 3, 'first-use': 3, 'too-small': 0 });
  assert.deepEqual(misses('SUM WORDS', 2), { misses: 2, 'first-use': 2, 'too-small': 0 });
  // TWO PASSES: six 32-bit numbers (blocks 0-5), read twice. The first L1 holds 4 blocks: by the second pass the
  // line used longest ago always holds the block wanted next, so every load misses: 6 first uses, 6 too small.
  // In 8-byte blocks the six numbers are 3 blocks, which fit: only 3 first uses.
  assert.deepEqual(misses('TWO PASSES', 0), { misses: 12, 'first-use': 6, 'too-small': 6 });
  assert.deepEqual(misses('TWO PASSES', 1), { misses: 3, 'first-use': 3, 'too-small': 0 });
  // Each program leaves its answer, whatever the cache.
  const sums = perfectRun(programCpu(programByName('TWO PASSES')), { forwarding: true, mhz: 4000, cache: L1_BASE }).cpu;
  assert.equal(sums.regs[3], 203000);
});

// The caches below the L1 (LOWER_CACHES): the L2, then the L3.

test('a miss checks each level below the L1 in turn, each adding its lookup, and the first that has the block answers', () => {
  // The L1 check (1 ns), the L2 (5), the L3 (12), RAM (60).
  assert.equal(missNs(L1_BASE, cachesBelow(1), 'L2'), 6);
  assert.equal(missNs(L1_BASE, cachesBelow(1)), 66);
  assert.equal(missNs(L1_BASE, cachesBelow(2), 'L3'), 18);
  assert.equal(missNs(L1_BASE, cachesBelow(2)), 78);
  assert.equal(ramCycles(4000, L1_BASE, cachesBelow(2)), 312);
  // A bigger L1 block takes longer only from RAM: inside the chip, a cache hands over the whole block at once.
  const big = cacheShape(0, 1);
  assert.equal(missNs(big, cachesBelow(2)), 83);
  assert.equal(missNs(big, cachesBelow(2), 'L2'), 6);
  assert.throws(() => missNs(L1_BASE, cachesBelow(1), 'L3'));
  assert.deepEqual(LOWER_CACHES.map((level) => cacheWords(level.shape)), ['128 BYTES: 8 LINES OF 16', '256 BYTES: 4 LINES OF 64']);
});

test('the L2 keeps the 16-byte block a miss brought from RAM: the next three 4-byte blocks come from it', () => {
  const memory = new MemorySystem(L1_BASE, cachesBelow(1));
  const loads = [0, 4, 8, 12, 16].map((address) => memory.access('load', address, 4000));
  assert.deepEqual(loads.map((load) => load.level), ['RAM', 'L2', 'L2', 'L2', 'RAM']);
  assert.deepEqual(loads.map((load) => [load.ns, load.cycles]), [[66, 264], [6, 24], [6, 24], [6, 24], [66, 264]]);
  // Each was an L1 miss, the first use of its 4-byte block; only the trips past the L2 count as trips to RAM.
  assert.deepEqual(loads.map((load) => load.missKind), ['first-use', 'first-use', 'first-use', 'first-use', 'first-use']);
  assert.equal(memory.ramTrips, 2);
  assert.deepEqual(memory.served, { L1: 0, L2: 3, L3: 0, RAM: 2, BUFFER: 0 });
  // A block the L1 has lost is still in the L2 (every level a miss passed keeps a copy).
  for (const address of [20, 24, 28, 32]) memory.access('load', address, 4000);
  assert.equal(memory.access('load', 0, 4000).level, 'L2');
});

test('an L2 with 32-byte blocks: after one trip to RAM, the next seven 4-byte L1 blocks come from it', () => {
  const memory = new MemorySystem(L1_BASE, cachesBelow(1, [0, 1]));
  const levels = [0, 4, 8, 12, 16, 20, 24, 28, 32].map((address) => memory.access('load', address, 4000).level);
  assert.deepEqual(levels, ['RAM', 'L2', 'L2', 'L2', 'L2', 'L2', 'L2', 'L2', 'RAM']);
});

test('the L3 answers what the L2 has lost or never had: its 64-byte blocks hold four of the L2\'s', () => {
  const memory = new MemorySystem(L1_BASE, cachesBelow(2));
  const levels = [0, 16, 32, 48, 64].map((address) => memory.access('load', address, 4000).level);
  assert.deepEqual(levels, ['RAM', 'L3', 'L3', 'L3', 'RAM']);
  // The L1 (4 lines) lost block 0 to the fifth block; the L2 (8 lines of 16 bytes) still has it.
  assert.equal(memory.access('load', 0, 4000).ns, missNs(L1_BASE, cachesBelow(2), 'L2'));
});

test('stores go through every level and allocate in none; without an L1 there are no levels below it', () => {
  const memory = new MemorySystem(L1_BASE, cachesBelow(2));
  assert.equal(memory.access('store', 40, 4000).level, 'BUFFER');
  assert.equal(memory.access('load', 40, 4000).level, 'RAM');
  assert.equal(new MemorySystem(undefined, cachesBelow(2)).lower.length, 0);
  assert.equal(new MemorySystem(undefined, cachesBelow(2)).access('load', 0, 4000).cycles, 240);
});

test("an item wider than the L1's blocks: one trip down for each, the second found in the L2 the first one filled", () => {
  const load = new MemorySystem(L1_BASE, cachesBelow(1)).access('load', 0, 4000, 8);
  assert.deepEqual([load.level, load.ns, load.cycles], ['RAM', 66 + 6, 264 + 24]);
});

/** A program's loads on the first L1 with `lower` caches below it: where each was found, and their average time. */
function levelsOf(program: string, lower: number) {
  const run = perfectRun(programCpu(programByName(program)), { forwarding: true, mhz: 4000, cache: L1_BASE, lowerCaches: cachesBelow(lower) });
  const { L1, L2, L3, RAM } = run.memory.served;
  return { L1, L2, L3, RAM, amat: run.memory.averageLoadNs(), waited: run.memoryCycles };
}

test("the L2's and L3's practice programs: where every load is found, counted by hand, and the AMAT", () => {
  // TWO PASSES (24 bytes, read twice): the L1 alone misses all 12 loads, all to RAM (61 ns): AMAT = 1 + 12/12 x 60 = 61 ns.
  // The L2's two 16-byte blocks hold all six numbers: 2 trips to RAM, the other 10 misses found in the L2.
  // AMAT = 1 + 12/12 x (5 + 2/12 x 60) = 16 ns.
  assert.deepEqual(levelsOf('TWO PASSES', 0), { L1: 0, L2: 0, L3: 0, RAM: 12, amat: 61, waited: 12 * 243 });
  const l2 = levelsOf('TWO PASSES', 1);
  assert.deepEqual([l2.L1, l2.L2, l2.RAM, l2.waited], [0, 10, 2, 2 * 263 + 10 * 23]);
  assert.ok(Math.abs(l2.amat - (1 + (12 / 12) * (5 + (2 / 12) * 60))) < 1e-9);
  // SUM BIG NUMBERS (sixteen 64-bit numbers, each two 4-byte L1 blocks, so every load misses the L1):
  // with the L2, every other number starts a 16-byte block from RAM (66 + 6 ns); the others are two L2 hits (12 ns).
  const before = levelsOf('SUM BIG NUMBERS', 1);
  assert.deepEqual([before.L1, before.L2, before.RAM], [0, 8, 8]);
  assert.equal(before.amat, (8 * 72 + 8 * 12) / 16);
  // With the L3, RAM sends 64 bytes (8 numbers): 2 trips, and each L2 block after the first in them comes from the L3.
  const after = levelsOf('SUM BIG NUMBERS', 2);
  assert.deepEqual([after.L1, after.L2, after.L3, after.RAM], [0, 8, 6, 2]);
  assert.equal(after.amat, (2 * (78 + 6) + 6 * (18 + 6) + 8 * 12) / 16);
  assert.equal(perfectRun(programCpu(programByName('SUM BIG NUMBERS')), { forwarding: true }).cpu.regs[3], 64_800_000_000);
});
