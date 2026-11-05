import { test } from 'node:test';
import assert from 'node:assert/strict';

// Which slot is played, on a stand-in for the browser's storage. There are
// three slots; the developer screen changes whichever is active.

const stored = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  },
});
// Someone last seen playing the old developer save (before it was dropped, 2026-11-01), who came from slot 2.
stored.set('bit-cycler-slot', 'dev');
stored.set('bit-cycler-campaign-slot', '2');
stored.set('bit-cycler-save-dev', '{"game":"bit-cycler"}');
const { activeSlot, eraseEverything, hasSave, newGame, switchSlot } = await import('../game/src/save.ts');

test('a player left in the old developer save goes back to the slot they came from, and that save is cleared', () => {
  assert.equal(activeSlot(), '2');
  assert.equal(stored.get('bit-cycler-slot'), '2', 'kept across a reload');
  assert.equal(stored.has('bit-cycler-save-dev'), false);
  assert.equal(stored.has('bit-cycler-campaign-slot'), false);
});

test('the slot chosen is the one played, and stays chosen', () => {
  switchSlot('3');
  assert.equal(activeSlot(), '3');
  assert.equal(stored.get('bit-cycler-slot'), '3');
});

test('starting over erases every slot and plays slot 1 next', () => {
  stored.set('bit-cycler-settings', JSON.stringify({ tutorial: 'full' }));
  for (const slot of ['1', '3'] as const) newGame(slot);
  switchSlot('3');
  eraseEverything();
  for (const slot of ['1', '2', '3'] as const) assert.equal(hasSave(slot), false, `slot ${slot}`);
  assert.equal(activeSlot(), '1');
});
