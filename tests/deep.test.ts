import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOCK, DEEP_PIPELINE } from '../game/src/data/economy.ts';
import { parseSave } from '../game/src/saveFile.ts';
import { buy, cpiFor, cpuName, deepActive, NEW_GAME, ratedMhz, shopItems, toggleDeep, withTier, type Progress } from '../game/src/sim/progress.ts';

// The deep pipeline: an optional part with a trade-off, a faster clock for
// dearer wrong guesses, switched on and off in the shop.

const tier4: Progress = { ...withTier(NEW_GAME, 4), wordBits: 32, clockLevel: 4, money: 5000 };
const deepItem = (p: Progress) => shopItems(p).find((item) => item.key === 'deep');

test('it goes on sale with branch guessing and the 32-bit chip, then switches on and off', () => {
  assert.equal(deepItem({ ...withTier(NEW_GAME, 3), wordBits: 32 })?.state, 'later');
  assert.equal(deepItem(tier4)?.state, 'buy');
  const bought = buy(tier4, 'deep');
  assert.ok(bought);
  assert.equal(bought.deepPipeline, 'on', 'switched on as it arrives');
  assert.equal(bought.money, tier4.money - DEEP_PIPELINE.price);
  assert.equal(deepItem(bought)?.state, 'owned');
  assert.equal(deepItem(bought)?.switchedOn, true);
  const off = toggleDeep(bought);
  assert.equal(off.deepPipeline, 'off');
  assert.equal(deepItem(off)?.switchedOn, false);
  assert.equal(toggleDeep(off).deepPipeline, 'on');
  assert.equal(toggleDeep(tier4), tier4, 'nothing to switch before it is bought');
});

test('on: the clock is faster, the CPU says so, and a tier or chip that can\'t run it leaves it idle', () => {
  const on: Progress = { ...tier4, deepPipeline: 'on' };
  assert.equal(ratedMhz(on), ratedMhz(tier4) * DEEP_PIPELINE.clockFactor);
  assert.match(cpuName(on), /DEEP PIPELINE/);
  assert.equal(deepActive({ ...on, deepPipeline: 'off' }), false);
  assert.equal(deepActive(withTier(on, 3)), false);
  assert.equal(deepActive({ ...on, wordBits: 16 }), false);
});

test('at the power wall its faster clock is gone: only the dearer wrong guesses are left', () => {
  const top: Progress = { ...withTier(NEW_GAME, 6), wordBits: 64, clockLevel: CLOCK.factors.length - 1 };
  assert.equal(ratedMhz({ ...top, deepPipeline: 'on' }), ratedMhz(top));
  assert.ok(cpiFor('SUM GRID', { ...top, deepPipeline: 'on' }) > cpiFor('SUM GRID', top));
});

test('the board weighs it: guessing "not taken" by default, wrong guesses cost more; a predictor gets most of them right', () => {
  const on = (p: Progress): Progress => ({ ...p, deepPipeline: 'on' });
  // Tier 4's hardware guesses not taken: every loop's jump back is a wrong guess, now 4 cycles.
  assert.ok(cpiFor('SUM ARRAY', on(tier4)) > cpiFor('SUM ARRAY', tier4));
  // Time per instruction (CPI x clock period): with a 2-bit predictor, the faster clock wins on SUM GRID.
  const tier6: Progress = { ...withTier(NEW_GAME, 6), wordBits: 32, clockLevel: 4 };
  const time = (p: Progress) => cpiFor('SUM GRID', p) / ratedMhz(p);
  assert.ok(time(on(tier6)) < time(tier6));
});

test('an old save loads with no deep pipeline; an edited one is cleaned', () => {
  const load = (deepPipeline: unknown) => parseSave(JSON.stringify({ game: 'bit-cycler', version: 1, savedAt: 0, progress: { ...NEW_GAME, deepPipeline } }))?.progress.deepPipeline;
  assert.equal(load(undefined), 'none');
  assert.equal(load('sideways'), 'none');
  assert.equal(load('off'), 'off');
});
