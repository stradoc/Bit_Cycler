import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRADES, REPUTATION } from '../game/src/data/economy.ts';
import { afterDay, afterJob, changeLine, cleanReputation, inGrace, levelOf, NO_REPUTATION, payMultiplier, reputationLine, statusLine, type Reputation } from '../game/src/sim/reputation.ts';
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

test("pay: the level's rate, 5% less for each bad mark, never below the floor (x1.0 in the first week, x0.5 after)", () => {
  assert.deepEqual(REPUTATION.levels.map((level) => level.pay), [1, 1.5, 2, 3, 4]);
  assert.ok(close(payMultiplier(rep(15, 2), 8), 1.8));
  assert.ok(close(payMultiplier(rep(0, 3), 7), 1));
  assert.ok(close(payMultiplier(rep(0, 3), 8), 0.85));
  assert.ok(close(payMultiplier(rep(0, 14), 8), 0.5));
  assert.ok(close(payMultiplier(rep(50), 30), 4));
  assert.ok(close(payMultiplier(NO_REPUTATION, 1), 1));
  assert.deepEqual([1, 7, 8].map(inGrace), [true, true, false]);
});

test('a job on time adds GOOD and takes a bad mark off; a late one adds a bad mark', () => {
  const onTime = afterJob(rep(4, 2), 'fair', false);
  assert.deepEqual(onTime.after, rep(5, 1));
  assert.equal(onTime.levelUp, 'LOCAL');
  assert.deepEqual(afterJob(rep(4), 'easy', false).after, rep(5, 0), 'never below 0 marks');
  const late = afterJob(rep(4, 2), 'stretch', true);
  assert.deepEqual(late.after, rep(4, 3));
  assert.equal(late.levelUp, undefined);
  assert.equal(afterJob(rep(5), 'fair', false).levelUp, undefined, 'already LOCAL');
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

test('the player sees only a status: no pay rates, counts or bad marks', () => {
  assert.deepEqual([rep(0), rep(4, 3), rep(15, 9), rep(500)].map(statusLine), ['STATUS: UNKNOWN', 'STATUS: UNKNOWN', 'STATUS: TRUSTED', 'STATUS: FAMOUS']);
  // The card says something only when the status goes up.
  assert.equal(changeLine(afterJob(rep(0), 'fair', false)), undefined);
  assert.equal(changeLine(afterJob(rep(0), 'fair', true)), undefined);
  assert.equal(changeLine(afterJob(rep(4), 'fair', false)), 'NEW STATUS: LOCAL');
  // The developer screen and the cheats still see the numbers.
  assert.equal(reputationLine(rep(24, 2), 10, ASCII), 'TRUSTED ##.. +24 -2  PAY x1.80');
  const cp437 = new Set(JSON.stringify(CP437));
  for (const r of [rep(0), rep(500, 12)]) assert.ok([...reputationLine(r, 10, CP437)].every((ch) => (ch >= ' ' && ch <= '~') || cp437.has(ch)));
});

test("the anti-goal: a player late on one job in three still earns at least today's pay", () => {
  let r = NO_REPUTATION;
  const multipliers: number[] = [];
  for (let day = 1; day <= 30; day++) {
    for (let job = 1; job <= 3; job++) {
      const now = payMultiplier(r, day);
      if (day <= 7) assert.ok(now >= 1, `day ${day} job ${job}: x${now}`);
      multipliers.push(now);
      r = afterJob(r, 'fair', job === 3).after;
    }
    r = afterDay(r);
  }
  assert.ok(multipliers.reduce((a, b) => a + b, 0) / multipliers.length >= 1);
});

test("one late job doesn't cost a level", () => {
  const after = afterJob(rep(15), 'fair', true).after;
  assert.equal(levelOf(after).level.name, 'TRUSTED');
  assert.ok(payMultiplier(after, 20) >= 2 * 0.95 - 1e-9);
});
