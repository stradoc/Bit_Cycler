import { test } from 'node:test';
import assert from 'node:assert/strict';

// Which slot is played, and which campaign the developer screen goes back to,
// on a stand-in for the browser's storage.

const stored = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  },
});
const { activeSlot, campaignSlot, eraseEverything, hasSave, newGame, switchSlot } = await import('../game/src/save.ts');

test('with no campaign played yet, the developer save goes back to slot 1', () => {
  switchSlot('dev');
  assert.equal(campaignSlot(), '1');
});

test('the developer save goes back to the campaign played last, and stays active until then', () => {
  switchSlot('2');
  assert.equal(campaignSlot(), '2');
  switchSlot('dev');
  assert.equal(activeSlot(), 'dev');
  assert.equal(campaignSlot(), '2');
  assert.equal(stored.get('bit-cycler-campaign-slot'), '2', 'kept across a reload');
});

test('starting over erases every save, the developer save too, and plays slot 1 next', () => {
  stored.set('bit-cycler-settings', JSON.stringify({ tutorial: 'full' }));
  for (const slot of ['1', '3', 'dev'] as const) newGame(slot);
  switchSlot('3');
  eraseEverything();
  for (const slot of ['1', '2', '3', 'dev'] as const) assert.equal(hasSave(slot), false, `slot ${slot}`);
  assert.equal(activeSlot(), '1');
  assert.equal(campaignSlot(), '1');
});
