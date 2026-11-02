import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../game/src/sim/assembler.ts';
import { Cpu } from '../game/src/sim/cpu.ts';
import { programByName } from '../game/src/data/programs.ts';
import { tierByNumber } from '../game/src/data/tiers.ts';
import { generateProgram } from '../game/src/sim/generator.ts';
import { Pipeline, perfectRun, type PipelineOptions } from '../game/src/sim/pipeline.ts';
import { NORMAL_WINDOWS } from '../game/src/rhythm/judge.ts';
import { PipelineRun } from '../game/src/rhythm/pipelineRun.ts';

// Superscalar (tier 7, sim/pipeline.ts): the instruction in ID and the one
// behind it start together when each goes to a different unit, the second
// doesn't need the first's result, the first isn't a branch, and neither is
// waiting for an older result. Cycle counts worked out by hand.

const run = (source: string, options: PipelineOptions, memory: number[] = []) => perfectRun(new Cpu(assemble(source), 8, memory), options);
const SUPER: PipelineOptions = { forwarding: true, superscalar: true };

test('four independent instructions: 8 cycles one at a time, 6 as two pairs', () => {
  // One at a time: 4 instructions + 4 cycles to fill and drain the 5 stages.
  // Paired: cycle 1 fetches; cycle 2 starts addi+lb (ALU+MEM), cycle 3 add+sb
  // (ALU+MEM; sb stores x1, not add's x3); cycles 4-6 drain. CPI 1.5.
  const source = 'addi x1, x0, 1\nlb x2, 0(x0)\nadd x3, x1, x1\nsb x1, 4(x0)';
  assert.equal(run(source, { forwarding: true }).cycles, 8);
  const paired = run(source, SUPER);
  assert.equal(paired.cycles, 6);
  assert.equal(paired.pairs, 2);
  assert.equal(paired.instructions, 4);
  assert.deepEqual(paired.regs.slice(1, 4), [1, 0, 2]);
  assert.equal(paired.cpu.memory[4], 1);
});

test('a loop run twice: pairs where nothing depends, 15 cycles instead of 17', () => {
  // loop: lb x4 / addi x1 / add x3 (needs the load) / bne x1, x2 (needs addi in ID).
  // First time round nothing pairs: addi can't take add (add waits for the load), add can't take bne
  // (bne compares x1 in ID, a stage too early for the addi just ahead). The setup's last addi pairs
  // with lb instead. Second time: lb+addi pair, add stalls for the load, add+bne pair. 17 -> 15 cycles.
  const loop = 'addi x1, x0, 0\naddi x2, x0, 2\naddi x3, x0, 0\nloop: lb x4, 0(x1)\naddi x1, x1, 1\nadd x3, x3, x4\nbne x1, x2, loop\nsb x3, 8(x0)';
  const scalar = run(loop, { forwarding: true }, [5, 7]);
  const paired = run(loop, SUPER, [5, 7]);
  assert.equal(scalar.cycles, 17);
  assert.equal(paired.cycles, 15);
  assert.equal(paired.pairs, 3);
  assert.equal(paired.cpu.memory[8], 12);
});

test("each reason two can't start together", () => {
  // After the first cycle, ID holds the first instruction and IF the second.
  const check = (source: string, cycles = 1) => {
    const p = new Pipeline(new Cpu(assemble(source), 8, [1, 2, 3]), SUPER);
    for (let i = 0; i < cycles; i++) p.step(p.bestAction());
    return p.pairCheck();
  };
  assert.deepEqual(check('addi x1, x0, 1\nlb x2, 0(x0)'), { ok: true });
  assert.deepEqual(check('addi x1, x0, 1\naddi x2, x0, 2'), { ok: false, reason: 'same-unit' });
  assert.deepEqual(check('addi x1, x0, 5\nsb x1, 0(x0)'), { ok: false, reason: 'depends' });
  assert.deepEqual(check('bne x0, x0, end\naddi x2, x0, 2\nend: addi x3, x0, 3'), { ok: false, reason: 'branch-first' });
  assert.deepEqual(check('addi x1, x0, 1'), { ok: false, reason: 'no-second' });
  // lb x1 and addi x5 pair; then sb x1 (behind addi x2) needs the load still in EX: the second must wait.
  assert.deepEqual(check('lb x1, 0(x0)\naddi x5, x0, 0\naddi x2, x0, 1\nsb x1, 4(x0)', 2), { ok: false, reason: 'hazard' });
  // Without the hardware, nothing pairs.
  const scalar = new Pipeline(new Cpu(assemble('addi x1, x0, 1\nlb x2, 0(x0)'), 8, []), { forwarding: true });
  scalar.step('issue');
  assert.deepEqual(scalar.pairCheck(), { ok: false, reason: 'no-second' });
});

test('a wrong pair throws both away and fetches them again: two cycles lost', () => {
  // Two ALU instructions can't start together (one ALU). Right: 2 + 4 = 6 cycles.
  // Paired anyway in cycle 2: both flushed, refetched in cycle 3, then issued: 8 cycles.
  const source = 'addi x1, x0, 1\naddi x2, x0, 2';
  const p = new Pipeline(new Cpu(assemble(source), 8, []), SUPER);
  p.step('issue');
  const wrong = p.step('pair');
  assert.equal(wrong.event.kind, 'pair-violation');
  assert.equal(wrong.flushed.length, 2);
  while (!p.done) p.step(p.bestAction());
  assert.equal(p.cycles, 8);
  assert.deepEqual(p.regs.slice(1, 3), [1, 2]);
});

test('a branch can be the second of a pair: decided as it starts, its guess followed', () => {
  // addi x1, then addi x6 (one at a time: both ALU), then add+bne pair (ALU+BRANCH; bne doesn't read
  // add's x3, and x1 is two stages ahead, in time for a branch). Taken, guessed taken: nothing flushed.
  const source = 'addi x1, x0, 1\naddi x6, x0, 0\nadd x3, x0, x0\nbne x1, x0, skip\naddi x4, x0, 9\nskip: addi x5, x0, 7';
  const start = () => {
    const p = new Pipeline(new Cpu(assemble(source), 8, []), SUPER);
    for (let i = 0; i < 3; i++) p.step('issue');
    return p;
  };
  const p = start();
  assert.deepEqual(p.pairCheck(), { ok: true });
  assert.equal(p.branchOutcome('IF'), true);
  p.predictPartner(true);
  const pair = p.step('pair');
  assert.equal(pair.event.kind, 'paired');
  assert.equal(pair.mispredicted, false);
  assert.equal(pair.flushed.length, 0);
  assert.equal(p.stages.ID?.pc, 5, 'fetch went on from the target');
  while (!p.done) p.step(p.bestAction());
  assert.deepEqual([p.regs[4], p.regs[5]], [0, 7]);
  // No guess (not taken): the instruction fetched behind the branch is thrown away.
  const q = start();
  const missed = q.step('pair');
  assert.equal(missed.mispredicted, true);
  assert.equal(missed.flushed.length, 1);
});

test('generated programs: the same answers, and never slower than one at a time', () => {
  for (let i = 0; i < 400; i++) {
    const spec = generateProgram(i * 7919 + 1);
    const cpu = () => new Cpu(assemble(spec.source, 8), 8, spec.memory);
    for (const options of [{ forwarding: true }, { forwarding: true, predictor: '2-bit' as const }]) {
      const scalar = perfectRun(cpu(), options);
      const paired = perfectRun(cpu(), { ...options, superscalar: true });
      for (const { address, value } of spec.answer) assert.equal(paired.cpu.memory[address], value, spec.name);
      assert.ok(paired.cycles < scalar.cycles, `${spec.name}: ${paired.cycles} vs ${scalar.cycles}`);
    }
  }
});

// ---- chords: the run logic (rhythm/pipelineRun.ts) ----

const SPB = 0.6;
const superRun = (source: string, memory: number[] = []) => new PipelineRun(new Cpu(assemble(source), 8, memory), SUPER, 3, SPB, NORMAL_WINDOWS);
/** Past the current cycle's timing window. */
const endCycle = (r: PipelineRun) => r.update(r.dueBeat + 0.5);

test('a chord starts a pair, whichever key comes first; one key alone still issues one', () => {
  for (const [first, second] of [['ALU', 'MEM'], ['MEM', 'ALU']] as const) {
    const r = superRun('addi x1, x0, 1\nlb x2, 0(x0)\nadd x3, x1, x1');
    endCycle(r); // cycle 1: fetching
    assert.equal(r.press({ kind: 'route', unit: first }, r.dueBeat)?.outcome, first === 'ALU' ? 'issued' : 'wrong-unit');
    const chord = r.chord({ unit: second }, r.dueBeat + 0.02);
    assert.equal(chord?.outcome, 'paired');
    assert.equal(chord?.pairable, true);
    const [report] = endCycle(r);
    assert.equal(report.event.kind, 'paired');
    assert.equal(r.counts.paired, 1);
  }
  // One key on a pairable two: issued (right), but the chance to pair is noted.
  const r = superRun('addi x1, x0, 1\nlb x2, 0(x0)');
  endCycle(r);
  const alone = r.press({ kind: 'route', unit: 'ALU' }, r.dueBeat);
  assert.equal(alone?.outcome, 'issued');
  assert.equal(alone?.pairable, true);
});

test("a chord on two that can't start together is a wrong pair: both are fetched again", () => {
  const r = superRun('addi x1, x0, 5\nsb x1, 0(x0)');
  endCycle(r);
  r.press({ kind: 'route', unit: 'ALU' }, r.dueBeat);
  const chord = r.chord({ unit: 'MEM' }, r.dueBeat);
  assert.equal(chord?.outcome, 'wrong-pair');
  assert.equal(chord?.pairBlock, 'depends');
  const [report] = endCycle(r);
  assert.equal(report.event.kind, 'pair-violation');
  assert.equal(report.flushed.length, 2);
  assert.equal(r.streak, 0);
  // A second key of the same lane, a chord out of the window, or a chord without the hardware: no chord.
  const late = superRun('addi x1, x0, 1\nlb x2, 0(x0)');
  endCycle(late);
  late.press({ kind: 'route', unit: 'ALU' }, late.dueBeat);
  assert.equal(late.chord({ unit: 'ALU' }, late.dueBeat), null);
  assert.equal(late.chord({ unit: 'MEM' }, late.dueBeat + 0.4), null);
  const scalar = new PipelineRun(new Cpu(assemble('addi x1, x0, 1\nlb x2, 0(x0)'), 8, []), { forwarding: true }, 3, SPB, NORMAL_WINDOWS);
  endCycle(scalar);
  scalar.press({ kind: 'route', unit: 'ALU' }, scalar.dueBeat);
  assert.equal(scalar.chord({ unit: 'MEM' }, scalar.dueBeat), null);
});

test("a chord's branch carries its guess: a pair's second branch guessed taken fetches from the target", () => {
  const r = superRun('addi x1, x0, 1\naddi x6, x0, 0\nadd x3, x0, x0\nbne x1, x0, skip\naddi x4, x0, 9\nskip: addi x5, x0, 7');
  endCycle(r);
  for (let i = 0; i < 2; i++) {
    r.press({ kind: 'route', unit: 'ALU' }, r.dueBeat);
    endCycle(r);
  }
  r.press({ kind: 'route', unit: 'BRANCH', guessTaken: true }, r.dueBeat);
  assert.equal(r.chord({ unit: 'ALU' }, r.dueBeat)?.outcome, 'paired');
  const [report] = endCycle(r);
  assert.equal(report.mispredicted, false);
  assert.equal(r.pipeline.stages.ID?.pc, 5);
});

test("instruction order decides what can pair: SUM ARRAY's loop has no pair, the same sum reordered (SUM PAIRS) two each time round", () => {
  const pairs = (name: string) => {
    const spec = programByName(name);
    return perfectRun(new Cpu(assemble(spec.source), 8, spec.memory), { forwarding: true, predictor: '2-bit', superscalar: true }, 'perfect');
  };
  // SUM ARRAY: only the setup's last addi pairs with the first lb.
  assert.equal(pairs('SUM ARRAY').pairs, 1);
  // SUM PAIRS (tier 7's practice): lb+addi and add+bne on 5 of its 6 passes, plus the setup's.
  const paired = pairs('SUM PAIRS');
  assert.equal(paired.pairs, 11);
  assert.equal(paired.cpu.memory[8], 27);
  assert.equal(tierByNumber(7).options?.program, 'SUM PAIRS');
});

test('chords are known before they reach the front: the pairs a perfect run will start, worked out on a copy', () => {
  // addi+lb, then add+sb (the first test): seen from the very first cycle, before either pair is at the front.
  const pipeline = new Pipeline(new Cpu(assemble('addi x1, x0, 1\nlb x2, 0(x0)\nadd x3, x1, x1\nsb x1, 4(x0)'), 8), SUPER);
  assert.deepEqual([...pipeline.plannedPartners(20)].sort(), [1, 3]);
  // Planning changes nothing: the pipeline is still on its first cycle, with addi in fetch.
  assert.equal(pipeline.cycle, 1);
  assert.equal(pipeline.stages.IF?.seq, 0);
  assert.equal(pipeline.stages.ID, null);
  // SUM PAIRS, cycle by cycle: what's planned at each moment is what a perfect run then pairs.
  const spec = programByName('SUM PAIRS');
  const options: PipelineOptions = { forwarding: true, predictor: '2-bit', superscalar: true };
  const live = new Pipeline(new Cpu(assemble(spec.source), 8, spec.memory), options);
  const planned = live.plannedPartners(1000);
  const paired = new Set<number>();
  while (!live.done) {
    if (live.waitLeft > 0) {
      live.wait();
      continue;
    }
    const { event } = live.step(live.bestAction());
    if (event.kind === 'paired') paired.add(event.partner.seq);
  }
  assert.ok(paired.size >= 10);
  assert.deepEqual([...planned].sort((a, b) => a - b), [...paired].sort((a, b) => a - b));
  // Without superscalar nothing pairs.
  assert.equal(new Pipeline(new Cpu(assemble(spec.source), 8, spec.memory), { forwarding: true }).plannedPartners(50).size, 0);
});
