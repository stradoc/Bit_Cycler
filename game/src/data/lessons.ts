import { cacheShape, L1_BASE, type CacheShape } from '../sim/memory.ts';
import { WIP_PARTS } from './economy.ts';
import type { TierOptions } from './tiers.ts';

// The lessons: what TICK teaches, one idea at a time, as a tour of the song
// screen (data/tours.ts SONG_TOURS, keyed by these ids), holding up these
// pictures (visual/diagrams.ts) and pointing at the real screen. A lesson
// plays the first time its idea comes up, and any lesson can be played again
// from BRIEFS on the main menu.

export type DiagramId =
  | 'cpu' | 'clock' | 'units' | 'storage' | 'highway' | 'score'
  | 'laundry' | 'stages' | 'stall' | 'pipeplay' | 'speedup'
  | 'forward' | 'loaduse' | 'forwardplay' | 'speedup3'
  | 'fork' | 'guess' | 'guessplay' | 'speedup4'
  | 'branchread' | 'loopend' | 'howguess'
  | 'table1' | 'grid' | 'misses1' | 'override' | 'when1'
  | 'counter2' | 'misses2' | 'weak2' | 'when2' | 'score2'
  | 'overclock' | 'power' | 'throttle' | 'damage'
  | 'ramtrip' | 'wallchart' | 'floor' | 'freezeplay'
  | 'desk' | 'lines' | 'address' | 'locality' | 'misskinds' | 'cacheplay' | 'cachescore'
  | 'morelines' | 'twoway' | 'sets' | 'bigblocks'
  | 'shelf' | 'l2loads' | 'amat' | 'library' | 'l3loads'
  | 'deep' | 'deeptrade';

export type Lesson = {
  readonly id: string;
  readonly title: string;
  /** The screen its tour plays on, and how that song is set up. */
  readonly scene: 'pipeline';
  /**
   * How its song is set up. A practice right after buying (flow.ts) runs on
   * the player's own CPU, but keeps the lesson's `program`, `l1` and
   * `lowerCaches`: the L1's upgrades and the caches below it are each shown on
   * a program made for what they fix, on the first L1 with just that change,
   * so the difference is plain.
   */
  readonly options?: TierOptions & { readonly l1?: CacheShape; readonly lowerCaches?: number; readonly deep?: boolean };
  /** A practice follows the tour (a new kind of CPU); without one, the tour explains and the game goes on. */
  readonly practice: boolean;
};

export const LESSONS: Readonly<Record<string, Lesson>> = Object.fromEntries(
  ([
    { id: 'tier1', title: 'LESSON 1: HOW A CPU RUNS A PROGRAM', scene: 'pipeline', options: { singleCycle: true }, practice: true },
    { id: 'tier2', title: 'LESSON 2: PIPELINING', scene: 'pipeline', practice: true },
    { id: 'tier3', title: 'LESSON 3: FORWARDING', scene: 'pipeline', options: { forwarding: true }, practice: true },
    { id: 'tier4', title: 'LESSON 4: BRANCH PREDICTION', scene: 'pipeline', options: { forwarding: true, guessing: true }, practice: true },
    { id: 'tier5', title: 'LESSON 5: A 1-BIT PREDICTOR', scene: 'pipeline', options: { forwarding: true, guessing: true, predictor: '1-bit', program: 'SUM GRID' }, practice: true },
    { id: 'tier6', title: 'LESSON 6: A 2-BIT PREDICTOR', scene: 'pipeline', options: { forwarding: true, guessing: true, predictor: '2-bit', program: 'SUM GRID' }, practice: true },
    { id: 'tier7', title: 'LESSON 7: TWO AT ONCE (SUPERSCALAR)', scene: 'pipeline', options: { forwarding: true, guessing: true, predictor: '2-bit', superscalar: true, program: 'SUM PAIRS' }, practice: true },
    // Explained once, on the song screen, as the upgrade arrives (or the clock first outruns RAM); no practice of their own.
    { id: 'overclock', title: 'OVERCLOCKING', scene: 'pipeline', practice: false },
    { id: 'memwall', title: 'THE MEMORY WALL', scene: 'pipeline', options: { forwarding: true }, practice: false },
    { id: 'cache', title: 'THE L1 CACHE', scene: 'pipeline', options: { forwarding: true, l1: L1_BASE }, practice: true },
    { id: 'morelines', title: 'L1: 8 LINES', scene: 'pipeline', options: { forwarding: true, l1: cacheShape(['lines']), program: 'TWO PASSES' }, practice: true },
    { id: 'twoway', title: 'L1: 2-WAY SETS', scene: 'pipeline', options: { forwarding: true, l1: cacheShape(['ways']), program: 'ADD TWO LISTS' }, practice: true },
    { id: 'bigblocks', title: 'L1: 8-BYTE BLOCKS', scene: 'pipeline', options: { forwarding: true, l1: cacheShape(['blocks']), program: 'SUM WORDS' }, practice: true },
    { id: 'l2', title: 'THE L2 CACHE', scene: 'pipeline', options: { forwarding: true, l1: L1_BASE, lowerCaches: 1, program: 'TWO PASSES' }, practice: true },
    { id: 'l3', title: 'THE L3 CACHE', scene: 'pipeline', options: { forwarding: true, l1: L1_BASE, lowerCaches: 2, program: 'SUM BIG NUMBERS' }, practice: true },
    { id: 'deep', title: 'THE DEEP PIPELINE', scene: 'pipeline', options: { forwarding: true, guessing: true, deep: true }, practice: true },
  ] satisfies Lesson[]).map((lesson) => [lesson.id, lesson]),
);

/** A lesson about a part still being reworked (WIP_PARTS in data/economy.ts), marked WIP where it's listed. */
export function isWip(lessonId: string): boolean {
  return WIP_PARTS.some((part) => part.lessonId === lessonId);
}
