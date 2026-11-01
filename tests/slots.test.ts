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
const { activeSlot, campaignSlot, switchSlot } = await import('../game/src/save.ts');

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
