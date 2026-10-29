import type { Predictor } from '../sim/pipeline.ts';

// The CPU tiers playable so far. The shop will unlock these; for now the
// title screen switches between them with T.

export type Tier = {
  readonly number: number;
  readonly name: string;
  /** Lesson (briefing) shown before the tier is first played. */
  readonly lessonId: string;
  /** Scene that plays the tier. */
  readonly scene: 'play' | 'pipeline';
  /** Extra hardware this tier has, and its program (passed to the scene). */
  readonly options?: TierOptions;
};

export type TierOptions = {
  readonly forwarding?: boolean;
  /** The player guesses branches (J not taken, K taken). */
  readonly guessing?: boolean;
  /** A hardware predictor guesses first; the player can override it. */
  readonly predictor?: Predictor;
  /** Program name (see data/programs.ts); SUM ARRAY by default. */
  readonly program?: string;
};

export const TIERS: readonly Tier[] = [
  { number: 1, name: 'SINGLE-CYCLE', lessonId: 'tier1', scene: 'play' },
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
