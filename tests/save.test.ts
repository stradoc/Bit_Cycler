import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOCK, COOLING, MEMORY_PARTS } from '../game/src/data/economy.ts';
import { parseSave, saveText } from '../game/src/saveFile.ts';
import { fillBoard, NEW_GAME, withEverything, type Progress } from '../game/src/sim/progress.ts';
import { THERMAL } from '../game/src/sim/thermal.ts';

const SAVED_AT = Date.UTC(2026, 9, 30, 14, 2);

test('a save reads back exactly as it was written, with when it was saved', () => {
  const progress: Progress = { ...fillBoard(withEverything(NEW_GAME), () => 0.5), seenLessons: ['tier1', 'tier2'] };
  const saved = parseSave(saveText(progress, SAVED_AT));
  assert.deepEqual(saved, { progress, savedAt: SAVED_AT });
});

test('a save from before slots (the progress alone) loads, missing fields taking a new game\'s values', () => {
  const old = { money: 750, parts: ['pipeline'], clockLevel: 2, cooling: 1, overclocking: true, chipMaxDial: 1.3, board: [], nextId: 9 };
  const saved = parseSave(JSON.stringify(old));
  assert.ok(saved);
  assert.equal(saved.savedAt, 0);
  assert.equal(saved.progress.money, 750);
  assert.deepEqual(saved.progress.parts, ['pipeline']);
  assert.equal(saved.progress.cacheLevels, 0); // saved before the cache existed
  assert.deepEqual(saved.progress.cacheUpgrades, []); // and before its upgrades
  assert.deepEqual(saved.progress.seenLessons, []); // the settings kept these then
  assert.deepEqual(saved.progress.seenTips, []); // saved before tips were remembered
  assert.equal(saved.progress.wordBits, 16); // saved before the chips: the pipeline needs the 16-bit one
});

test('a save from before the chips gets the narrowest chip its parts and clock need', () => {
  const chipFor = (old: object) => parseSave(JSON.stringify({ ...old, board: [], nextId: 1 }))?.progress.wordBits;
  assert.equal(chipFor({ money: 0, parts: [], clockLevel: 0 }), 8);
  assert.equal(chipFor({ money: 0, parts: ['pipeline', 'forwarding'], clockLevel: 2 }), 32);
  assert.equal(chipFor({ money: 0, parts: [], clockLevel: CLOCK.factors.length - 1 }), 64); // 4 GHz runs only on 64-bit
  // A save's own chip stays, even one wider than it needs.
  assert.equal(chipFor({ money: 0, parts: [], clockLevel: 0, wordBits: 64 }), 64);
});

test('text that is not a save is refused', () => {
  for (const text of ['', 'hello', '[]', 'null', '{"game":"bit-cycler"}', '{"money":"lots","parts":[]}', '{"money":5}']) {
    assert.equal(parseSave(text), null, text);
  }
});

test('an edited save is pulled back into range', () => {
  const edited = {
    ...NEW_GAME,
    money: -50,
    parts: ['pipeline', 'predictor2'], // skips the parts in between
    clockLevel: 99,
    cacheLevels: 7,
    cacheUpgrades: ['ways', 'bogus', 'ways', 'lines'],
    cooling: -3,
    overclocking: 'yes',
    chipMaxDial: 9,
    seenLessons: ['tier1', 42],
    seenTips: ['hazard', null],
    wordBits: 12,
  };
  const saved = parseSave(saveText(edited as unknown as Progress, SAVED_AT));
  assert.ok(saved);
  const p = saved.progress;
  assert.equal(p.money, 0);
  assert.deepEqual(p.parts, ['pipeline']);
  assert.equal(p.clockLevel, CLOCK.factors.length - 1);
  assert.equal(p.cacheLevels, MEMORY_PARTS.length); // the L1, the L2 and the L3: no more levels to own
  // Each L1 upgrade once, unknown ones dropped, in the order bought.
  assert.deepEqual(p.cacheUpgrades, ['ways', 'lines']);
  assert.equal(p.cooling, 0);
  assert.equal(p.overclocking, false);
  assert.equal(p.chipMaxDial, THERMAL.maxDial);
  assert.deepEqual(p.seenLessons, ['tier1']);
  assert.deepEqual(p.seenTips, ['hazard']);
  assert.ok(p.cooling < COOLING.length);
  assert.equal(p.wordBits, 64); // no 12-bit chip: the narrowest that runs the top clock
});

test('contracts saved before deadlines existed are dropped', () => {
  const board = fillBoard(NEW_GAME, () => 0.3).board;
  const { deadline: _, ...noDeadline } = board[0];
  const saved = parseSave(saveText({ ...NEW_GAME, board: [noDeadline, ...board.slice(1)] } as Progress, SAVED_AT));
  assert.equal(saved?.progress.board.length, board.length - 1);
});
