// The CPU tiers playable so far. The shop will unlock these; for now the
// title screen switches between them with T.

export type Tier = {
  readonly number: number;
  readonly name: string;
  /** Lesson (briefing) shown before the tier is first played. */
  readonly lessonId: string;
  /** Scene that plays the tier. */
  readonly scene: 'play' | 'pipeline';
  /** Extra hardware this tier has (passed to the scene). */
  readonly options?: { readonly forwarding?: boolean };
};

export const TIERS: readonly Tier[] = [
  { number: 1, name: 'SINGLE-CYCLE', lessonId: 'tier1', scene: 'play' },
  { number: 2, name: 'PIPELINE', lessonId: 'tier2', scene: 'pipeline' },
  { number: 3, name: 'FORWARDING', lessonId: 'tier3', scene: 'pipeline', options: { forwarding: true } },
];

export function tierByNumber(number: number): Tier {
  return TIERS.find((tier) => tier.number === number) ?? TIERS[0];
}
