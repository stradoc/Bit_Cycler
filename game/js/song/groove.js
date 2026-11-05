/** The player's mistakes: cycles lost to a choice, not to the hardware. */
const MISTAKES = ['wasted-stall', 'wrong-unit', 'off-beat', 'missed'];
/** Which mode wins when several cycles fall in one beat: the worst. */
const RANK = { play: 0, hold: 1, skip: 2, flush: 3 };
/** What one cycle does to the song: whether it moves on, and how it sounds. */
function cycleMode(report, guessing) {
    const outcome = report.decision?.outcome;
    if (outcome === 'violation' || (report.flushed.length > 0 && guessing))
        return 'flush';
    if (outcome && MISTAKES.includes(outcome))
        return 'skip';
    if (report.flushed.length > 0 || report.event.kind === 'stalled')
        return 'hold';
    return 'play';
}
/**
 * The cycles since the last beat, as music: how many beats the song moves
 * on, and how the next beat plays. No cycles at all (practice waiting for the
 * player) holds; `started` false (no music yet) plays, so the song opens on
 * its first beat. `guessing`: branches are guessed (tier 4 on), so a flush is a wrong guess.
 */
export function groove(reports, started = true, guessing = false) {
    if (reports.length === 0)
        return started ? { advance: 0, mode: 'hold' } : { advance: 1, mode: 'play' };
    const modes = reports.map((report) => cycleMode(report, guessing));
    const advance = modes.filter((mode) => mode === 'play').length;
    const mode = modes.reduce((worst, mode) => (RANK[mode] > RANK[worst] ? mode : worst), 'play');
    return { advance, mode };
}
//# sourceMappingURL=groove.js.map