import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programByName } from '../game/src/data/programs.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu, cpuFor, itemAt, trace } from '../game/src/sim/cpu.ts';
import { bitsOf, generateProgram, kindOf, seedOf } from '../game/src/sim/generator.ts';
import { cacheShape, L1_BASE, SHOWN_BYTES } from '../game/src/sim/memory.ts';
import { perfectRun } from '../game/src/sim/pipeline.ts';

const SEEDS = Array.from({ length: 3000 }, (_, i) => i * 7919 + 1);

test('every generated program finishes, leaves the right answer, and stays in the memory the panel shows', () => {
  for (const seed of SEEDS) {
    const spec = generateProgram(seed);
    const cpu = new Cpu(assemble(spec.source, 8), 8, spec.memory);
    const steps = trace(cpu, 400);
    while (!cpu.halted) cpu.step();
    assert.ok(steps.length >= 16 && steps.length <= 120, `${spec.name}: ${steps.length} instructions`);
    assert.ok(spec.memory.length <= SHOWN_BYTES, spec.name);
    for (const step of steps) {
      const address = step.loaded ?? step.stored;
      if (address !== undefined) assert.ok(address < SHOWN_BYTES, `${spec.name} uses memory outside the panel`);
    }
    for (const { address, value } of spec.answer) {
      assert.ok(address < SHOWN_BYTES);
      assert.equal(cpu.memory[address], value, `${spec.name}: address ${address}`);
    }
  }
});

test('ADD ARRAYS sometimes puts its arrays a cache-full apart: then every load is a conflict miss', () => {
  const runs = SEEDS.map((seed) => generateProgram(seed))
    .filter((spec) => spec.name.startsWith('ADD ARRAYS'))
    .map((spec) => perfectRun(new Cpu(assemble(spec.source, 8), 8, spec.memory), { forwarding: true, cache: L1_BASE }).memory);
  const colliding = runs.filter((m) => m.missKinds.conflict > 0);
  const apart = runs.filter((m) => m.missKinds.conflict === 0);
  assert.ok(colliding.length > runs.length / 4 && apart.length > runs.length / 4, `${colliding.length} of ${runs.length} collide`);
  // Colliding: every load misses (after the first two, all conflicts). Apart: one miss per 4-byte block of each array.
  for (const m of colliding) assert.equal(m.hits, 0);
  for (const m of apart) assert.ok(m.hits > m.misses);
});

test('every generated program has a client whose name fits a board card, and a job in its own words', () => {
  const clients = new Set<string>();
  for (const seed of SEEDS) {
    const spec = generateProgram(seed);
    assert.ok(spec.client && spec.client.length <= 19, `${spec.name}: client "${spec.client}"`);
    assert.ok(spec.verb.length > 0 && spec.unit.length > 0, spec.name);
    clients.add(spec.client);
  }
  assert.ok(clients.size >= 20, `only ${clients.size} clients turn up`);
});

test('every program tags its NEXT (always x1) and END (always x2) registers: the pair its loop branch compares', () => {
  const specs = [...SEEDS.map((seed) => generateProgram(seed)), programByName('SUM ARRAY'), programByName('SUM GRID')];
  for (const spec of specs) {
    const keys = spec.keys ?? [];
    const next = keys.find((key) => key.tag === 'NEXT');
    const end = keys.find((key) => key.tag === 'END');
    assert.ok(next && end, `${spec.name}: no NEXT / END`);
    assert.deepEqual([next.reg, end.reg], [1, 2], `${spec.name}: NEXT is x${next.reg}, END is x${end.reg}`);
    assert.match(spec.source, new RegExp(`bne +x${next.reg}, x${end.reg},`), `${spec.name}: the loop doesn't compare them`);
    assert.equal(new Set(keys.map((key) => key.reg)).size, keys.length, spec.name);
    for (const key of keys) {
      assert.ok(key.tag.length <= 4, `${spec.name}: tag ${key.tag} too long for the panel`);
      assert.ok(`x${key.reg} = ${key.tag}: ${key.about}`.length <= 44, `${spec.name}: "${key.about}" too long for the count-in`);
      assert.ok(spec.roles?.[key.reg], `${spec.name}: x${key.reg} has no role`);
    }
  }
});

test('generated programs give the same answers on every CPU: single-cycle, pipelined, forwarding, predictors', () => {
  for (const seed of SEEDS.slice(0, 300)) {
    const spec = generateProgram(seed);
    for (const options of [
      { forwarding: false, singleCycle: true },
      { forwarding: false },
      { forwarding: true },
      { forwarding: true, predictor: '1-bit' as const },
      { forwarding: true, predictor: '2-bit' as const },
    ]) {
      const run = perfectRun(new Cpu(assemble(spec.source, 8), 8, spec.memory), options);
      for (const { address, value } of spec.answer) assert.equal(run.cpu.memory[address], value, `${spec.name} ${JSON.stringify(options)}`);
    }
  }
});

test('a seed always gives the same program, every kind of program turns up, and names lead back to seeds', () => {
  assert.equal(generateProgram(4821).source, generateProgram(4821).source);
  const kinds = new Set(SEEDS.slice(0, 500).map((seed) => generateProgram(seed).name.replace(/ #\d+$/, '')));
  assert.deepEqual([...kinds].sort(), ['ADD ARRAYS', 'CHANGES', 'CHECKSUM', 'COPY', 'COUNT', 'DOUBLE', 'FILL', 'FIND', 'GRID SUM', 'OTHERS', 'REPLACE', 'REVERSE', 'RUNNING TOTAL', 'SUM']);
  const spec = generateProgram(123);
  assert.equal(seedOf(spec.name), 123);
  assert.equal(programByName(spec.name).source, spec.source); // contracts store only the name
  assert.equal(programByName('SUM ARRAY').name, 'SUM ARRAY');
});

test("a stored program is rebuilt as the kind its name says, whatever kind its seed would pick now", () => {
  // Contracts keep only the name; a growing list of kinds must not turn an old job into a new kind.
  for (const seed of SEEDS.slice(0, 500)) {
    const spec = generateProgram(seed);
    assert.equal(programByName(spec.name).source, spec.source, spec.name);
    const other = generateProgram(seed, 'FILL');
    assert.equal(kindOf(other.name), 'FILL');
    assert.equal(seedOf(other.name), seed);
  }
  assert.equal(kindOf('GRID SUM #4821'), 'GRID SUM');
});

// Wide data (word size as the width of a job's numbers): the same programs on 16-, 32- and 64-bit items.
const WIDE = [16, 32, 64] as const;

test('wide data: every kind at every width finishes, leaves the right answer, and stays within its 32 items', () => {
  for (const bits of WIDE) {
    const size = bits / 8;
    for (const seed of SEEDS.slice(0, 600)) {
      const spec = generateProgram(seed, undefined, bits);
      assert.equal(spec.dataBits, bits);
      const cpu = cpuFor(spec);
      const steps = trace(cpu, 400);
      while (!cpu.halted) cpu.step();
      // The loop is the same length as on bytes: the same seed's byte program runs as many instructions.
      // OTHERS sizes its data in bytes instead (more than the first L1 holds, so its second pass misses).
      if (kindOf(spec.name) !== 'OTHERS') assert.equal(steps.length, trace(cpuFor(generateProgram(seed))).length, `${spec.name}: not the byte program's loop`);
      assert.ok(spec.memory.length <= SHOWN_BYTES * size, spec.name);
      for (const step of steps) {
        const address = step.loaded ?? step.stored;
        if (address === undefined) continue;
        assert.equal(step.size, size, `${spec.name}: moves ${step.size} bytes at a time`);
        assert.equal(address % size, 0, `${spec.name}: an item out of line at ${address}`);
        assert.ok(address + size <= SHOWN_BYTES * size, `${spec.name}: memory past its 32 items`);
      }
      for (const { address, value } of spec.answer) assert.equal(itemAt(cpu.memory, address, bits), value, `${spec.name}: address ${address}`);
    }
  }
});

test('wide data: the same answers on every CPU, and names that rebuild the program at its width', () => {
  for (const bits of WIDE) {
    for (const seed of SEEDS.slice(0, 100)) {
      const spec = generateProgram(seed, undefined, bits);
      assert.match(spec.name, new RegExp(`^${bits}-BIT [A-Z ]+ #${seed}$`));
      assert.equal(bitsOf(spec.name), bits);
      assert.equal(kindOf(spec.name), kindOf(generateProgram(seed).name));
      assert.equal(programByName(spec.name).source, spec.source);
      assert.match(spec.unit, new RegExp(`^${bits}-BIT `));
      for (const options of [{ forwarding: false, singleCycle: true }, { forwarding: true }, { forwarding: true, predictor: '2-bit' as const, cache: L1_BASE, mhz: 4000 }]) {
        const run = perfectRun(cpuFor(spec), options);
        for (const { address, value } of spec.answer) assert.equal(itemAt(run.cpu.memory, address, bits), value, `${spec.name} ${JSON.stringify(options)}`);
      }
    }
  }
  // 64-bit numbers really need 64 bits: a sum past what 32 bits hold.
  assert.ok(generateProgram(7, 'SUM', 64).answer[0].value > 2 ** 32);
});

test('wide data fills the cache faster: a 32-bit item takes a whole 4-byte block, so a pass over the data misses on every load', () => {
  const spec = (bits: 8 | 32) => generateProgram(1, 'SUM', bits);
  const misses = (bits: 8 | 32) => perfectRun(cpuFor(spec(bits)), { forwarding: true, cache: L1_BASE, mhz: 4000 }).memory;
  const bytes = misses(8);
  const words = misses(32);
  assert.equal(bytes.loads, words.loads);
  assert.ok(bytes.hits > bytes.misses, 'bytes: one miss per four');
  assert.equal(words.hits, 0, '32-bit: every load a first-use miss');
  // A 64-bit item spans two 4-byte blocks: each one missing is its own trip to RAM.
  const run = perfectRun(cpuFor(generateProgram(1, 'SUM', 64)), { forwarding: true, cache: L1_BASE, mhz: 4000 });
  assert.ok(run.memoryCycles >= 2 * bytes.loads * 200, `${run.memoryCycles} cycles waiting`);
});

test('OTHERS reads its data twice: wider data outgrows the first L1 (TOO SMALL), and 8 lines hold it', () => {
  const missKinds = (bits: 8 | 16 | 32 | 64, seed: number, upgrades: Parameters<typeof cacheShape>[0] = []) =>
    perfectRun(cpuFor(generateProgram(seed, 'OTHERS', bits)), { forwarding: true, cache: cacheShape(upgrades), mhz: 4000 }).memory.missKinds;
  for (const seed of SEEDS.slice(0, 200)) {
    // Bytes (8-12 of them) fit the first L1, so the second pass only hits.
    assert.equal(missKinds(8, seed)['too-small'], 0, `bytes #${seed}`);
    for (const bits of WIDE) {
      // 20-32 bytes: more than its 16, so the second pass finds the first items gone; 8 lines (32 bytes) keep them all.
      assert.ok(missKinds(bits, seed)['too-small'] > 0, `${bits}-bit #${seed}: no TOO SMALL misses`);
      assert.equal(missKinds(bits, seed, ['lines'])['too-small'], 0, `${bits}-bit #${seed} with 8 lines`);
    }
  }
});
