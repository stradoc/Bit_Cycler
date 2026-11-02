import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eased, keyframes, MOTIONS, passAt, recipeFor, styleFor, valueAt, type EraMotion, type MotionName, type Recipe } from '../game/src/data/motions.ts';
import { ERAS } from '../game/src/ui/eras.ts';

// Animations as data (data/motions.ts): the recipes, the maths that plays
// them, and each era's way of moving. Checked here without a browser.

const EASE: EraMotion = { style: 'ease' };
const TWEEN: EraMotion = { style: 'tween' };
const slide: Recipe = { tracks: { y: [0, 100] }, duration: 1000, ease: 'out' };

test('easings start at 0 and end at 1; out is fast first, in is slow first', () => {
  for (const ease of ['linear', 'in', 'out', 'inOut'] as const) {
    assert.equal(eased(ease, 0), 0, ease);
    assert.equal(eased(ease, 1), 1, ease);
  }
  assert.ok(eased('out', 0.5) > 0.5 && eased('in', 0.5) < 0.5);
  assert.equal(eased('inOut', 0.5), 0.5);
});

test('tracks: plain keyframes, offsets from where it started, multiples of it, and a goal', () => {
  assert.deepEqual(keyframes([1, 2, 3], 50, undefined), [1, 2, 3]);
  assert.deepEqual(keyframes({ by: [14, 0] }, 200, undefined), [214, 200]);
  assert.deepEqual(keyframes({ times: [0, 1] }, 0.8, undefined), [0, 0.8]);
  assert.deepEqual(keyframes('goal', 120, 300), [120, 300]);
});

test('a one-shot ends on its last keyframe; loops wrap, and a yoyo comes back', () => {
  assert.deepEqual(passAt(slide, 1500), { at: 1, back: false, done: true });
  const pulse: Recipe = { ...slide, loop: 'yoyo' };
  assert.deepEqual(passAt(pulse, 1500), { at: 0.5, back: true, done: false });
  assert.deepEqual(passAt({ ...slide, loop: 'restart' }, 1250), { at: 0.25, back: false, done: false });
  assert.equal(valueAt(slide, slide.tracks.y!, 0, undefined, 5000, EASE), 100);
});

test("each era's style: eased, plain, stepped in character cells, or jumping", () => {
  const at = (motion: EraMotion, ms: number, axis?: 'x' | 'y') => valueAt(slide, slide.tracks.y!, 0, undefined, ms, motion, axis);
  // Modern: eased (out: past halfway at half the time). 90s: plain, even.
  assert.ok(at(EASE, 500) > 50);
  assert.equal(at(TWEEN, 500), 50);
  // DOS: drawn 10 times a second (140 ms shows as 100 ms) and in whole 16-pixel rows.
  const dos: EraMotion = { style: 'step', fps: 10, cell: { x: 8, y: 16 } };
  assert.equal(at(dos, 140), 10);
  assert.equal(at(dos, 140, 'y'), 100 + Math.round((10 - 100) / 16) * 16);
  assert.equal(Math.abs((at(dos, 450, 'y') - 100) % 16), 0);
  // Finished means exactly at the end, even between DOS's steps.
  assert.equal(at(dos, 1000), 100);
  // Green CRT: no in-betweens, the end reached at once.
  assert.equal(at({ style: 'cut' }, 1), 100);
  // Not its turn yet (a delay): where it starts, in every style.
  for (const motion of [EASE, TWEEN, dos, { style: 'cut' } as const]) assert.equal(at(motion, -50), 0);
});

test('the green CRT: a fade down glows off like phosphor, a back-and-forth pulse blinks', () => {
  const crt: EraMotion = { style: 'cut', afterglow: 250 };
  const fade: Recipe = { tracks: { alpha: [1, 0] }, duration: 400 };
  const glow = [0, 50, 100, 200].map((ms) => valueAt(fade, fade.tracks.alpha!, 1, undefined, ms, crt));
  assert.equal(glow[0], 1);
  for (let i = 1; i < glow.length; i++) assert.ok(glow[i] < glow[i - 1] && glow[i] > 0, `glowing off: ${glow}`);
  assert.equal(valueAt(fade, fade.tracks.alpha!, 1, undefined, 400, crt), 0);
  // A pulse that dims and comes back: dim for its first half, bright for its second.
  const pulse: Recipe = { tracks: { alpha: [1, 0.35] }, duration: 300, loop: 'yoyo' };
  assert.equal(valueAt(pulse, pulse.tracks.alpha!, 1, undefined, 100, { style: 'cut' }), 0.35);
  assert.equal(valueAt(pulse, pulse.tracks.alpha!, 1, undefined, 400, { style: 'cut' }), 1);
});

test("an era's variant replaces the recipe it names; REDUCED MOTION jumps, except what gameplay needs", () => {
  const motion: EraMotion = { style: 'ease', variants: { 'glide-in': { duration: 999 } } };
  assert.equal(recipeFor('glide-in', motion).duration, 999);
  assert.deepEqual(recipeFor('glide-in', motion).tracks, MOTIONS['glide-in'].tracks);
  assert.deepEqual(styleFor(EASE, MOTIONS['glide-in'], true), { style: 'cut' });
  assert.equal(styleFor(EASE, { ...slide, essential: true }, true), EASE);
  assert.equal(styleFor(EASE, MOTIONS['glide-in'], false), EASE);
});

test('every era moves its own way, and every recipe plays to its end in every era', () => {
  assert.deepEqual(ERAS.map((era) => era.motion.style), ['cut', 'step', 'tween', 'ease']);
  for (const era of ERAS) {
    for (const name of Object.keys(MOTIONS) as MotionName[]) {
      const recipe = recipeFor(name, era.motion);
      assert.ok(recipe.duration > 0, name);
      for (const [prop, track] of Object.entries(recipe.tracks)) {
        for (const ms of [0, recipe.duration / 3, recipe.duration * 2]) {
          const value = valueAt(recipe, track, 10, 20, ms, era.motion, prop === 'x' || prop === 'y' ? prop : undefined);
          assert.ok(Number.isFinite(value), `${era.name} ${name} ${prop} at ${ms}`);
        }
        const last = keyframes(track, 10, 20).at(-1);
        if (!recipe.loop) assert.equal(valueAt(recipe, track, 10, 20, recipe.duration, era.motion), last, `${era.name} ${name} ends where it should`);
      }
    }
  }
});
