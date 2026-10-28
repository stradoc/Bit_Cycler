// The beat stands in for the CPU clock. Real clocks span about 1 MHz to 4 GHz
// (4000x), so the tempo grows with the clock's order of magnitude instead:
// every 10x faster clock adds BPM_PER_DECADE. CPU-time math always uses the
// real clock period; the tempo only represents it.
export const BASE_BPM = 75; // at 1 MHz
export const BPM_PER_DECADE = 12;
/** Relaxed mode and practice play at this fraction of the normal tempo. */
export const RELAXED_FACTOR = 0.8;
export function tempoForClock(mhz, relaxed = false) {
    const bpm = BASE_BPM + BPM_PER_DECADE * Math.log10(Math.max(1, mhz));
    return relaxed ? bpm * RELAXED_FACTOR : bpm;
}
//# sourceMappingURL=tempo.js.map