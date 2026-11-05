// The beat stands in for the CPU clock. Real clocks span about 1 MHz to 4 GHz
// (4000x), so the tempo grows with the clock's order of magnitude instead:
// every 10x faster clock adds BPM_PER_DECADE (75 BPM at 1 MHz, ~147 at 4 GHz).
// Clock upgrades raise the rated clock, so they speed the song up too.
// CPU-time math always uses the real clock period; the tempo only represents it.
// The player's difficulty speeds the whole song up or slows it down (the pay
// stays the same: rhythm skill never blocks learning).
import { NORMAL_WINDOWS, RELAXED_WINDOWS } from './judge.js';
export const BASE_BPM = 75; // at 1 MHz
export const BPM_PER_DECADE = 20;
/**
 * How fast a song goes, chosen in the settings: the beat's speed against the
 * clock's tempo, and the timing windows. RELAXED is for learning or a beat
 * that's too fast, and practice always plays at it.
 */
export const DIFFICULTIES = {
    relaxed: { name: 'RELAXED', speed: 0.8, windows: RELAXED_WINDOWS },
    easy: { name: 'EASY', speed: 1, windows: NORMAL_WINDOWS },
    medium: { name: 'MEDIUM', speed: 1.15, windows: NORMAL_WINDOWS },
    hard: { name: 'HARD', speed: 1.5, windows: NORMAL_WINDOWS },
};
/** The difficulties, slowest first (the order left / right steps through them). */
export const DIFFICULTY_ORDER = ['relaxed', 'easy', 'medium', 'hard'];
/** A new player's difficulty. */
export const DEFAULT_DIFFICULTY = 'medium';
export function isDifficulty(value) {
    return typeof value === 'string' && value in DIFFICULTIES;
}
/** The song's tempo at the rated clock `mhz`, times the difficulty's `speed`. */
export function tempoForClock(mhz, speed = 1) {
    return (BASE_BPM + BPM_PER_DECADE * Math.log10(Math.max(1, mhz))) * speed;
}
//# sourceMappingURL=tempo.js.map