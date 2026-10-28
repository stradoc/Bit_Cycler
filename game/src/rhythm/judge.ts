export type Judgment = 'PERFECT' | 'GOOD' | 'MISS';

/** Timing windows in seconds, measured from the exact beat. */
export type Windows = {
  readonly perfect: number;
  readonly good: number;
  /** Presses earlier than this are ignored rather than counted as a miss. */
  readonly early: number;
};

export const NORMAL_WINDOWS: Windows = { perfect: 0.045, good: 0.1, early: 0.15 };
export const RELAXED_WINDOWS: Windows = { perfect: 0.08, good: 0.18, early: 0.25 };

export function judge(offsetSeconds: number, windows: Windows): Judgment {
  const distance = Math.abs(offsetSeconds);
  if (distance <= windows.perfect) return 'PERFECT';
  if (distance <= windows.good) return 'GOOD';
  return 'MISS';
}
