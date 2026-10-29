import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programByName } from '../game/src/data/programs.ts';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu, trace } from '../game/src/sim/cpu.ts';
import { generateProgram, seedOf } from '../game/src/sim/generator.ts';
import { perfectRun } from '../game/src/sim/pipeline.ts';

const SEEDS = Array.from({ length: 3000 }, (_, i) => i * 7919 + 1);

test('every generated program finishes, leaves the right answer, and stays in memory 0-15', () => {
  for (const seed of SEEDS) {
    const spec = generateProgram(seed);
    const cpu = new Cpu(assemble(spec.source, 8), 8, spec.memory);
    const steps = trace(cpu, 400);
    while (!cpu.halted) cpu.step();
    assert.ok(steps.length >= 16 && steps.length <= 120, `${spec.name}: ${steps.length} instructions`);
    assert.ok(spec.memory.length <= 16, spec.name);
    for (const step of steps) if (step.stored !== undefined) assert.ok(step.stored < 16, `${spec.name} stores outside the panel`);
    for (const { address, value } of spec.answer) {
      assert.ok(address < 16);
      assert.equal(cpu.memory[address], value, `${spec.name}: address ${address}`);
    }
  }
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

test('every program tags its NEXT and END registers: the pair its loop branch compares', () => {
  const specs = [...SEEDS.map(generateProgram), programByName('SUM ARRAY'), programByName('SUM GRID')];
  for (const spec of specs) {
    const keys = spec.keys ?? [];
    const next = keys.find((key) => key.tag === 'NEXT');
    const end = keys.find((key) => key.tag === 'END');
    assert.ok(next && end, `${spec.name}: no NEXT / END`);
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
  assert.deepEqual([...kinds].sort(), ['ADD ARRAYS', 'CHECKSUM', 'COPY', 'COUNT', 'DOUBLE', 'FILL', 'FIND', 'GRID SUM', 'SUM']);
  const spec = generateProgram(123);
  assert.equal(seedOf(spec.name), 123);
  assert.equal(programByName(spec.name).source, spec.source); // contracts store only the name
  assert.equal(programByName('SUM ARRAY').name, 'SUM ARRAY');
});
