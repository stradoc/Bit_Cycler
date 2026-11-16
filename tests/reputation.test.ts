import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRADES, REPUTATION } from '../game/src/data/economy.ts';
import { afterDay, afterJob, changeLine, cleanReputation, inGrace, levelOf, NO_REPUTATION, payMultiplier, reputationLine, type Reputation } from '../game/src/sim/reputation.ts';
import { ASCII, CP437 } from '../game/src/visual/asciiChart.ts';

// Reputation (sim/reputation.ts): jobs done on time build GOOD, which sets a
// level and its pay; late jobs leave BAD marks that cut pay and fade.

const rep = (good: number, bad = 0): Reputation => ({ good, bad });
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('the table climbs: each level needs more GOOD and pays at least as much, and every grade has a weight', () => {
  assert.equal(REPUTATION.levels[0].good, 0);
  for (let i = 1; i < REPUTATION.levels.length; i++) {
    assert.ok(REPUTATION.levels[i].good > REPUTATION.levels[i - 1].good);
    assert.ok(REPUTATION.levels[i].pay >= REPUTATION.levels[i - 1].pay);
  }
  for (const grade of GRADES) assert.ok(REPUTATION.goodPerJob[grade.id] > 0, grade.id);
});

test('levels come from GOOD alone', () => {
  const name = (good: number, bad = 0) => levelOf(rep(good, bad)).level.name;
  assert.deepEqual([name(0), name(4), name(5), name(15), name(49), name(50), name(500)], ['UNKNOWN', 'UNKNOWN', 'LOCAL', 'TRUSTED', 'RESPECTED', 'FAMOUS', 'FAMOUS']);
  assert.equal(name(15, 9), 'TRUSTED', 'bad marks never cost a level');
  assert.equal(levelOf(rep(4)).next?.name, 'LOCAL');
  assert.equal(levelOf(rep(50)).next, undefined);
});

test("pay: the level's rate, 5% less for each bad mark, never below the floor (x1.0 in the first week, x0.75 after)", () => {
  assert.ok(close(payMultiplier(rep(15, 2), 8), 1.35));
  assert.ok(close(payMultiplier(rep(0, 3), 7), 1));
  assert.ok(close(payMultiplier(rep(0, 3), 8), 0.85));
  assert.ok(close(payMultiplier(rep(0, 10), 8), 0.75));
  assert.ok(close(payMultiplier(rep(50), 30), 2));
  assert.ok(close(payMultiplier(NO_REPUTATION, 1), 1));
  assert.deepEqual([1, 7, 8].map(inGrace), [true, true, false]);
});

test('a job on time adds GOOD and takes a bad mark off; a late one adds a bad mark', () => {
  const onTime = afterJob(rep(4, 2), 'fair', false, 9);
  assert.deepEqual(onTime.after, rep(5, 1));
  assert.equal(onTime.levelUp, 'LOCAL');
  assert.deepEqual(afterJob(rep(4), 'easy', false, 9).after, rep(5, 0), 'never below 0 marks');
  const late = afterJob(rep(4, 2), 'stretch', true, 9);
  assert.deepEqual(late.after, rep(4, 3));
  assert.equal(late.levelUp, undefined);
  assert.equal(afterJob(rep(5), 'fair', false, 9).levelUp, undefined, 'already LOCAL');
  assert.deepEqual([afterJob(rep(0), 'fair', true, 3).grace, afterJob(rep(0), 'fair', true, 8).grace], [true, false]);
  assert.deepEqual(onTime.before, rep(4, 2));
});

test('logging off takes a bad mark off, never below 0', () => {
  assert.deepEqual(afterDay(rep(3, 2)), rep(3, 1));
  assert.deepEqual(afterDay(rep(3, 0)), rep(3, 0));
});

test('a saved reputation is whole numbers in range; anything else starts again at nothing', () => {
  for (const raw of [undefined, null, 5, { good: -3, bad: 'x' }, { good: 2.5, bad: 0 }, { good: Number.NaN, bad: 0 }, { good: 1 }]) {
    assert.deepEqual(cleanReputation(raw), NO_REPUTATION, JSON.stringify(raw));
  }
  assert.deepEqual(cleanReputation({ good: 24, bad: 2 }), rep(24, 2));
});

test("the words fit, and use only the era fonts' characters", () => {
  const cp437 = new Set(JSON.stringify(CP437));
  const fits = (text: string) => [...text].every((ch) => (ch >= ' ' && ch <= '~') || cp437.has(ch));
  for (const glyphs of [ASCII, CP437]) {
    for (const r of [rep(0), rep(4, 1), rep(24, 2), rep(500, 12)]) {
      const line = reputationLine(r, 10, glyphs);
      assert.ok(line.length <= 40, line);
      assert.ok(fits(line), line);
    }
  }
  assert.equal(reputationLine(rep(24, 2), 10, ASCII), 'TRUSTED ##.. +24 -2  PAY x1.35');
  assert.equal(reputationLine(rep(24, 0), 10, ASCII), 'TRUSTED ##.. +24  PAY x1.50');
  const lines = [afterJob(rep(0), 'fair', false, 9), afterJob(rep(0), 'fair', true, 3), afterJob(rep(0), 'fair', true, 9), afterJob(rep(4), 'fair', false, 9)].map(changeLine);
  assert.deepEqual(lines.map((line) => line.left), ['REPUTATION +1', 'BAD MARK +1 (GRACE WEEK)', 'BAD MARK +1', 'LEVEL UP: LOCAL']);
  assert.equal(lines[3].right, 'PAY x1.25 NEXT JOB');
  for (const line of lines) assert.ok(fits(`${line.left} ${line.right ?? ''}`) && line.left.length + (line.right?.length ?? 0) <= 48);
});

test("the anti-goal: a player late on one job in three still earns at least today's pay", () => {
  let r = NO_REPUTATION;
  const multipliers: number[] = [];
  for (let day = 1; day <= 30; day++) {
    for (let job = 1; job <= 3; job++) {
      const now = payMultiplier(r, day);
      if (day <= 7) assert.ok(now >= 1, `day ${day} job ${job}: x${now}`);
      multipliers.push(now);
      r = afterJob(r, 'fair', job === 3, day).after;
    }
    r = afterDay(r);
  }
  assert.ok(multipliers.reduce((a, b) => a + b, 0) / multipliers.length >= 1);
});

test("one late job doesn't cost a level", () => {
  const after = afterJob(rep(15), 'fair', true, 20).after;
  assert.equal(levelOf(after).level.name, 'TRUSTED');
  assert.ok(payMultiplier(after, 20) >= 1.5 * 0.95 - 1e-9);
});

test('a level-up names what the next job really pays, bad marks included', () => {
  const change = afterJob({ good: 4, bad: 3 }, 'fair', false, 9);
  assert.equal(change.levelUp, 'LOCAL');
  assert.ok(Math.abs(change.nextPay - 1.25 * 0.9) < 1e-9);
  assert.equal(changeLine(change).right, 'PAY x1.13 NEXT JOB');
});

test('a late job says GRACE WEEK only when the grace week kept pay from dropping below normal', () => {
  // UNKNOWN on day 3: the mark would cut pay below x1.0, and the grace week stops it.
  assert.equal(afterJob({ good: 0, bad: 0 }, 'fair', true, 3).grace, true);
  // TRUSTED on day 3: x1.5 less 5% is still above x1.0, so the mark does cut pay; no grace to speak of.
  const trusted = afterJob({ good: 15, bad: 0 }, 'fair', true, 3);
  assert.equal(trusted.grace, false);
  assert.equal(changeLine(trusted).left, 'BAD MARK +1');
});
