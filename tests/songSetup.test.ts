import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEEP_PIPELINE } from '../game/src/data/economy.ts';
import { RELAXED_WINDOWS, NORMAL_WINDOWS } from '../game/src/rhythm/judge.ts';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../game/src/rhythm/tempo.ts';
import { NEW_GAME, newContract, ratedMhzFor, type Progress } from '../game/src/sim/progress.ts';
import { THERMAL } from '../game/src/sim/thermal.ts';
import { ROWS, SINGLE_CYCLE_ROWS } from '../game/src/song/layout.ts';
import { pipelineOptions, playAgain, songSetup, watch, type Recording } from '../game/src/song/setup.ts';

// A song's setup comes from what it was started with, then the save, then the
// URL; retries and replays carry it on. Checked here without a browser.

const url = (query = '') => new URLSearchParams(query);
const contract = newContract('easy', 7, () => 0.5, NEW_GAME);
/** A save with the L1, the overclocking upgrade and a worn chip. */
const worn: Progress = { ...NEW_GAME, cacheLevels: 1, overclocking: true, chipMaxDial: 1.3 };
const recording: Recording = { cycles: [], dials: [1, 1.1], maxDial: 1.5, canOverclock: true, paid: true, late: true };

test('a song is set up from what it was started with, then the save, then the URL', () => {
  const tier3 = songSetup({ forwarding: true }, NEW_GAME, url());
  assert.equal(tier3.forwarding, true);
  assert.equal(tier3.guessing, false);
  assert.equal(tier3.program, 'SUM ARRAY');
  assert.equal(tier3.l1, false);
  assert.equal(tier3.practice, false);
  assert.equal(tier3.watching, false);
  assert.equal(tier3.rows, ROWS);
  assert.equal(tier3.ratedMhz, ratedMhzFor(NEW_GAME, true));

  const fromUrl = songSetup({}, NEW_GAME, url('forwarding&guessing&predictor=2-bit&cache&practice'));
  assert.deepEqual([fromUrl.forwarding, fromUrl.guessing, fromUrl.predictor, fromUrl.l1, fromUrl.practice], [true, true, '2-bit', true, true]);
  assert.equal(fromUrl.program, 'SUM GRID');
  assert.equal(songSetup({}, NEW_GAME, url('predictor=3-bit')).predictor, undefined);
  // What the song was started with wins over the URL.
  assert.equal(songSetup({ forwarding: false }, NEW_GAME, url('forwarding')).forwarding, false);

  const tier1 = songSetup({ singleCycle: true }, NEW_GAME, url());
  assert.equal(tier1.rows, SINGLE_CYCLE_ROWS);
  assert.equal(tier1.ratedMhz, ratedMhzFor(NEW_GAME, false));
});

test('a contract plays its own program, and the save fits the cache and sets the chip', () => {
  const setup = songSetup({ contract }, worn, url());
  assert.equal(setup.program, contract.program);
  assert.equal(setup.spec.name, contract.program);
  assert.equal(setup.l1, true);
  assert.equal(setup.maxDial, 1.3);
  assert.equal(setup.canOverclock, true);
  // Practice always runs on a new chip.
  assert.equal(songSetup({ contract, practice: true }, worn, url()).maxDial, THERMAL.maxDial);
  // ?contract=easy picks the board's first easy contract.
  assert.equal(songSetup({}, { ...NEW_GAME, board: [contract] }, url('contract=easy')).contract, contract);
});

test('?clock starts a real run overclocked and allows it, but never practice or a replay', () => {
  const setup = songSetup({}, NEW_GAME, url('clock=150'));
  assert.equal(setup.startDial, 1.5);
  assert.equal(setup.canOverclock, true);
  assert.equal(songSetup({ practice: true }, NEW_GAME, url('clock=150')).startDial, undefined);
  assert.equal(songSetup({ replay: recording }, NEW_GAME, url('clock=150')).startDial, undefined);
  assert.equal(songSetup({}, NEW_GAME, url()).startDial, undefined);
});

test('playing again keeps the CPU, program and contract, on the chip as the save has it now', () => {
  const practice = songSetup({ forwarding: true, guessing: true, contract, practice: true }, worn, url());
  // An overheat in the run wore the chip further.
  const later: Progress = { ...worn, chipMaxDial: 1.2 };
  const again = songSetup(playAgain(practice), later, url());
  assert.deepEqual([again.forwarding, again.guessing, again.program, again.contract], [true, true, contract.program, contract]);
  assert.equal(again.practice, false);
  assert.equal(again.watching, false);
  assert.equal(again.maxDial, 1.2);
});

test('a replay plays on the chip its run started on, and watching again or playing again works from it', () => {
  const run = songSetup({ forwarding: true, contract }, worn, url());
  const watched = songSetup(watch(run, recording), { ...worn, chipMaxDial: 1.2 }, url());
  assert.equal(watched.watching, true);
  assert.equal(watched.replay, recording);
  assert.equal(watched.maxDial, 1.5);
  assert.equal(watched.forwarding, true);
  assert.equal(watched.contract, contract);
  assert.deepEqual(songSetup(watch(watched, recording), worn, url()), watched);
  assert.equal(songSetup(playAgain(watched), worn, url()).watching, false);
  // A replay is never practice, even with ?practice in the URL.
  assert.equal(songSetup(watch(run, recording), worn, url('practice')).practice, false);
});

test('the simulator runs the setup\'s hardware', () => {
  const setup = songSetup({ forwarding: true, predictor: '1-bit' }, worn, url());
  assert.deepEqual(pipelineOptions(setup, 40), { forwarding: true, predictor: '1-bit', singleCycle: false, cache: true, mhz: 40, wrongGuessCycles: 1, superscalar: false });
});

test('the deep pipeline: from the save where branches are guessed, a faster rated clock, dearer wrong guesses, kept by retries and replays', () => {
  const tier4: Progress = { ...NEW_GAME, wordBits: 32, parts: ['pipeline', 'forwarding', 'guessing'], clockLevel: 4, deepPipeline: 'on' };
  const deep = songSetup({ forwarding: true, guessing: true }, tier4, url());
  assert.equal(deep.deep, true);
  assert.equal(deep.ratedMhz, ratedMhzFor(tier4, true, false) * DEEP_PIPELINE.clockFactor);
  assert.equal(pipelineOptions(deep, deep.ratedMhz).wrongGuessCycles, DEEP_PIPELINE.wrongGuessCycles);
  assert.equal(songSetup(playAgain(deep), { ...tier4, deepPipeline: 'off' }, url()).deep, true, 'a retry plays the same CPU');
  assert.equal(songSetup(watch(deep, recording), tier4, url()).deep, true);
  assert.equal(songSetup({ forwarding: true, guessing: true }, { ...tier4, deepPipeline: 'off' }, url()).deep, false, 'switched off');
  assert.equal(songSetup({ forwarding: true }, tier4, url()).deep, false, 'a lesson without guessing (tier 3) runs without it');
  assert.equal(songSetup({ singleCycle: true }, NEW_GAME, url('deep')).deep, false, 'never on the single-cycle CPU');
  assert.equal(songSetup({ forwarding: true, guessing: true }, NEW_GAME, url('deep')).deep, true, '?deep');
});

test("the guide's tour plays once: retries and replays drop it", () => {
  const first = songSetup({ practice: true, tour: ['tier1'], afterTour: { scene: 'title' } }, NEW_GAME, url());
  assert.deepEqual(first.tour, ['tier1']);
  assert.deepEqual(first.afterTour, { scene: 'title' });
  assert.equal(songSetup(playAgain(first), NEW_GAME, url()).tour, undefined);
  assert.equal(songSetup(playAgain(first), NEW_GAME, url()).afterTour, undefined);
  assert.equal(songSetup(watch(first, recording), NEW_GAME, url()).tour, undefined);
  assert.deepEqual(songSetup({}, NEW_GAME, url('practice&tour=tier1')).tour, ['tier1']);
  assert.deepEqual(songSetup({}, NEW_GAME, url('tour=memwall,cache')).tour, ['memwall', 'cache']);
  assert.equal(songSetup({ replay: recording }, NEW_GAME, url('tour=tier1')).tour, undefined);
});

test('the difficulty sets the pace: from the start, then ?difficulty, then MEDIUM; practice always relaxed; retries and replays keep it', () => {
  assert.equal(songSetup({}, NEW_GAME, url()).difficulty, DEFAULT_DIFFICULTY);
  assert.equal(songSetup({}, NEW_GAME, url('difficulty=hard')).pace.speed, 1.5);
  assert.equal(songSetup({}, NEW_GAME, url('difficulty=nonsense')).difficulty, 'medium');
  const hard = songSetup({ difficulty: 'hard', contract }, NEW_GAME, url('difficulty=easy'));
  assert.equal(hard.pace, DIFFICULTIES.hard);
  assert.equal(hard.pace.windows, NORMAL_WINDOWS);
  // Practice plays relaxed (wider windows, a slower beat), but keeps the difficulty chosen for the real run after it.
  const practice = songSetup({ difficulty: 'hard', practice: true }, NEW_GAME, url());
  assert.equal(practice.pace.windows, RELAXED_WINDOWS);
  assert.equal(songSetup(playAgain(practice), NEW_GAME, url()).pace, DIFFICULTIES.hard);
  assert.equal(songSetup(watch(hard, recording), NEW_GAME, url()).difficulty, 'hard');
  assert.equal(songSetup(playAgain(hard), NEW_GAME, url()).difficulty, 'hard');
});

test('only the first practice (the single-cycle CPU) is guided: there a wrong key stops it for TICK to explain', () => {
  assert.equal(songSetup({ singleCycle: true, practice: true }, NEW_GAME, url()).guided, true);
  assert.equal(songSetup({ forwarding: true, practice: true }, NEW_GAME, url()).guided, false);
  assert.equal(songSetup({ singleCycle: true }, NEW_GAME, url()).guided, false);
});
