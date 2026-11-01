import type { Predictor } from '../sim/pipeline.ts';

// The CPU tiers: each CPU part bought in the shop is the next tier
// (sim/progress.ts `tierOf`), and its options set up the song's hardware.

export type Tier = {
  readonly number: number;
  readonly name: string;
  /** The lesson (TICK's tour, data/tours.ts) played before the tier is first played. */
  readonly lessonId: string;
  /** Scene that plays the tier. */
  readonly scene: 'pipeline';
  /** Extra hardware this tier has, and its program (passed to the scene). */
  readonly options?: TierOptions;
};

export type TierOptions = {
  /** Tier 1: a single-cycle CPU (no pipeline). */
  readonly singleCycle?: boolean;
  readonly forwarding?: boolean;
  /** The player guesses branches (J not taken, K taken). */
  readonly guessing?: boolean;
  /** A hardware predictor guesses first; the player can override it. */
  readonly predictor?: Predictor;
  /** Program name (see data/programs.ts); SUM ARRAY by default. */
  readonly program?: string;
};

export const TIERS: readonly Tier[] = [
  { number: 1, name: 'SINGLE-CYCLE', lessonId: 'tier1', scene: 'pipeline', options: { singleCycle: true } },
  { number: 2, name: 'PIPELINE', lessonId: 'tier2', scene: 'pipeline' },
  { number: 3, name: 'FORWARDING', lessonId: 'tier3', scene: 'pipeline', options: { forwarding: true } },
  { number: 4, name: 'BRANCH PREDICTION', lessonId: 'tier4', scene: 'pipeline', options: { forwarding: true, guessing: true } },
  {
    number: 5, name: '1-BIT PREDICTOR', lessonId: 'tier5', scene: 'pipeline',
    options: { forwarding: true, guessing: true, predictor: '1-bit', program: 'SUM GRID' },
  },
  {
    number: 6, name: '2-BIT PREDICTOR', lessonId: 'tier6', scene: 'pipeline',
    options: { forwarding: true, guessing: true, predictor: '2-bit', program: 'SUM GRID' },
  },
];

export function tierByNumber(number: number): Tier {
  return TIERS.find((tier) => tier.number === number) ?? TIERS[0];
}
