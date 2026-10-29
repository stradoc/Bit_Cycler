import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS } from '../game/src/data/programs.ts';
import { NORMAL_WINDOWS } from '../game/src/rhythm/judge.ts';
import { PipelineRun } from '../game/src/rhythm/pipelineRun.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu } from '../game/src/sim/cpu.ts';
import { unitOf } from '../game/src/sim/isa.ts';
import { Cache, cyclesFor, freezeBeats, lineOf, MemorySystem, ramCycles, tagOf } from '../game/src/sim/memory.ts';
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
  assert.equal(ramCycles(4000, true), 244);
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
  assert.deepEqual([lineOf(13), tagOf(13)], [3, 0]);
  assert.deepEqual([lineOf(21), tagOf(21)], [1, 1]);
  // 0 and 16 are a cache-full apart: same line, different tags.
  assert.deepEqual([lineOf(0), tagOf(0)], [0, 0]);
  assert.deepEqual([lineOf(16), tagOf(16)], [0, 1]);
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
  assert.deepEqual(cache.read(0), { hit: false, missKind: 'too-small', evicted: 4 });
});

test('stores are write-through with no write allocate: a store miss leaves the cache alone', () => {
  const memory = new MemorySystem(true);
  const store = memory.access('store', 8, 4000);
  assert.deepEqual([store.level, store.cycles, store.hit], ['BUFFER', 1, false]);
  const load = memory.access('load', 8, 4000);
  assert.deepEqual([load.level, load.cycles, load.missKind], ['RAM', 244, 'first-use']);
  assert.equal(memory.access('store', 9, 4000).hit, true);
  // Without a cache, a store waits for RAM like a load.
  assert.equal(new MemorySystem(false).access('store', 8, 4000).cycles, 240);
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
  const run = perfectRun(cpuFor(), { forwarding: true, mhz: 4000, cache: true });
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
  assert.equal(run.memoryBeats, 25);
  assert.equal(run.pipeline.cpu.memory[8], 17);
});
