import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programByName } from '../game/src/data/programs.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu, trace } from '../game/src/sim/cpu.ts';
import { generateProgram, kindOf, seedOf } from '../game/src/sim/generator.ts';
import { SHOWN_BYTES } from '../game/src/sim/memory.ts';
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
    .map((spec) => perfectRun(new Cpu(assemble(spec.source, 8), 8, spec.memory), { forwarding: true, cache: true }).memory);
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
  assert.deepEqual([...kinds].sort(), ['ADD ARRAYS', 'CHANGES', 'CHECKSUM', 'COPY', 'COUNT', 'DOUBLE', 'FILL', 'FIND', 'GRID SUM', 'REPLACE', 'REVERSE', 'RUNNING TOTAL', 'SUM']);
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
