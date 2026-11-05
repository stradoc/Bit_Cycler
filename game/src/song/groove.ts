import type { CycleReport, Outcome } from '../rhythm/pipelineRun.ts';

// How the song's music follows the run (audio/music.ts plays it): the song
// moves on one beat for each cycle that does work, so a lost cycle is a beat
// the song loses too, and a sloppy run makes the song itself take longer
// (more cycles for the same program: a higher CPI, by ear). How a lost beat
// sounds says why it was lost.

/**
 * How the next beat of music plays:
 * - play: the song moves on (an instruction issued, or the pipeline filling and emptying)
 * - hold: the song waits a beat (a stall the hazard needed, or nothing happening yet)
 * - skip: the song stutters like a scratched CD (the player's mistake: a miss, the wrong key, off the beat, a stall for nothing)
 * - flush: a tape-stop dive (work thrown away by a choice: a wrong branch guess, or an instruction issued too early)
 * Before branch guessing, every taken branch throws away the instructions
 * fetched after it: that's the hardware's cost, not a mistake, so it holds.
 */
export type BeatMode = 'play' | 'hold' | 'skip' | 'flush';

/** The player's mistakes: cycles lost to a choice, not to the hardware. */
const MISTAKES: readonly Outcome[] = ['wasted-stall', 'wrong-unit', 'off-beat', 'missed'];

/** Which mode wins when several cycles fall in one beat: the worst. */
const RANK: Readonly<Record<BeatMode, number>> = { play: 0, hold: 1, skip: 2, flush: 3 };

/** What one cycle does to the song: whether it moves on, and how it sounds. */
function cycleMode(report: CycleReport, guessing: boolean): BeatMode {
  const outcome = report.decision?.outcome;
  if (outcome === 'violation' || (report.flushed.length > 0 && guessing)) return 'flush';
  if (outcome && MISTAKES.includes(outcome)) return 'skip';
  if (report.flushed.length > 0 || report.event.kind === 'stalled') return 'hold';
  return 'play';
}

/**
 * The cycles since the last beat, as music: how many beats the song moves
 * on, and how the next beat plays. No cycles at all (practice waiting for the
 * player) holds; `started` false (no music yet) plays, so the song opens on
 * its first beat. `guessing`: branches are guessed (tier 4 on), so a flush is a wrong guess.
 */
export function groove(reports: readonly CycleReport[], started = true, guessing = false): { advance: number; mode: BeatMode } {
  if (reports.length === 0) return started ? { advance: 0, mode: 'hold' } : { advance: 1, mode: 'play' };
  const modes = reports.map((report) => cycleMode(report, guessing));
  const advance = modes.filter((mode) => mode === 'play').length;
  const mode = modes.reduce((worst, mode) => (RANK[mode] > RANK[worst] ? mode : worst), 'play' as BeatMode);
  return { advance, mode };
}
