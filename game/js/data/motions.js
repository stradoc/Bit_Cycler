// Every animation in the game, as data (the plan: ROADMAP.md item 0). A
// recipe names what changes on an object (its position, size, angle, alpha,
// or how far along a path it is), as keyframes over a time, with an easing,
// an optional delay, a stagger between several objects, and whether it loops.
// Each era moves in its own way (ui/eras.ts `motion`): the green CRT jumps but
// lets fading things glow off like phosphor, DOS moves in whole character
// cells a few times a second, the 90s desktop slides plainly, the modern era
// eases. An era can also play any recipe its own way (`variants`), and a
// whole group of recipes can move one way in every era (`GROUP_STYLES`: TICK
// and the song's gameplay are smooth everywhere). visual/motion.ts plays
// them; everything here is pure, so the tests check it in Node.
export const PROPS = ['x', 'y', 'alpha', 'scale', 'scaleX', 'scaleY', 'angle', 'progress'];
/**
 * The lengths the song's gameplay animations use (ms), so they keep one
 * rhythm: every `song` recipe lasts one of these (the tests check). A new
 * length is a new entry here, not a number in a recipe.
 */
export const PACE = {
    /** A key's flash, a note stepping down a row, a jolt. */
    blink: 120,
    /** Something leaving or arriving, the listing settling. */
    quick: 200,
    /** A note on a path no longer taken sliding away. */
    slide: 300,
    /** A value settling back to dim. */
    settle: 400,
    /** A value travelling the bus, at most (it also fits in a beat). */
    travel: 600,
    /** Something thrown out, a mark fading. */
    linger: 700,
    /** A callout said over the highway: it comes in, holds, and goes. */
    callout: 1600,
    /** A waiting note's pulse, each way. */
    pulse: 280,
};
/**
 * Groups that move one way in every era, whatever the era's own style
 * (REDUCED MOTION still wins). The rest move the era's way.
 */
export const GROUP_STYLES = {
    // The user: "I kind of liked the old smooth animations for TICK in 16 and 8 bit, I know it's less accurate, but I'd rather keep it, its easier on the eyes."
    tick: 'ease',
    // The user chose smooth gameplay in every era too (2026-11-02): readable while playing, whatever the era.
    song: 'ease',
};
/** Every animation, by name. A new one is an entry here; an era's own version goes in its `motion.variants`. */
export const MOTIONS = {
    /** Something new arriving: it fades in, rising a little (a results card). */
    'glide-in': { tracks: { alpha: { times: [0, 1] }, y: { by: [14, 0] } }, duration: 260, ease: 'out' },
    /** The list's highlight sliding to the chosen row. */
    'list-select': { tracks: { y: 'goal' }, duration: 160, ease: 'out' },
    // ---- TICK ----
    /** TICK swaying up and down as he waits (keyframes along a sine wave). */
    'tick-bob': { tracks: { y: { by: [0, -2.1, -3, -2.1, 0, 2.1, 3, 2.1, 0] } }, duration: 2400, ease: 'linear', loop: 'restart', group: 'tick' },
    /** TICK bobbing faster while he talks. */
    'tick-bob-talk': { tracks: { y: { by: [0, -2.8, -4, -2.8, 0, 2.8, 4, 2.8, 0] } }, duration: 880, ease: 'linear', loop: 'restart', group: 'tick' },
    /** TICK walking over to where he'll stand (his feet step while he's on his way). */
    'tick-walk': { tracks: { x: 'goal', y: 'goal' }, duration: 450, ease: 'out', group: 'tick' },
    /** The frame around what TICK points at, pulsing. */
    'tick-spotlight': { tracks: { alpha: [1, 0.6] }, duration: 470, ease: 'inOut', loop: 'yoyo', group: 'tick' },
    // ---- the song (song/, PipelineScene). Where a falling note is stays on the beat in the song's own code; these are everything else. ----
    /** A key was pressed: its lane lights up and fades (essential: it's the press being heard, and nothing moves). */
    'lane-flash': { tracks: { alpha: [0.35, 0] }, duration: PACE.blink, ease: 'linear', group: 'song', essential: true },
    /** A routed note stepping down to the row of the stage it's in now. */
    'row-step': { tracks: { y: 'goal' }, duration: PACE.blink, ease: 'out', group: 'song' },
    /** A note arriving mid-highway (fetch went somewhere new), and a finished one leaving after WRITE BACK. */
    'note-arrive': { tracks: { alpha: { times: [0, 1] } }, duration: PACE.quick, ease: 'out', group: 'song' },
    'note-leave': { tracks: { alpha: { times: [1, 0] } }, duration: PACE.quick, ease: 'linear', group: 'song' },
    /** A FLUSHED note, struck through and stamped: pushed out of its slot (the right instruction takes it) and fading. */
    'note-flush': { tracks: { x: 'goal', alpha: { times: [1, 1, 0.6, 0] } }, duration: PACE.linger, ease: 'out', group: 'song' },
    /** The line struck through a flushed note, drawn across it from the middle. */
    'strike-draw': { tracks: { scaleX: [0, 1] }, duration: PACE.blink, ease: 'out', group: 'song' },
    /** A note that won't be fetched after all (a branch sent fetch elsewhere, or the guess changed): it slides out of its lane and fades. */
    'note-drop': { tracks: { x: { by: [0, 26] }, alpha: { times: [1, 0] } }, duration: PACE.slide, ease: 'in', group: 'song' },
    /** Words over the highway about what just happened (REDIRECTED BY BRANCH UNIT): they come in, hold, and go; their link with them. */
    callout: { tracks: { alpha: [0, 1, 1, 1, 1, 1, 0] }, duration: PACE.callout, ease: 'linear', group: 'song' },
    /** A note waiting (a value not ready, memory not there yet): the frame around it pulses. */
    'wait-pulse': { tracks: { alpha: [1, 0.1] }, duration: PACE.pulse, ease: 'inOut', loop: 'yoyo', group: 'song' },
    /** The count-in: the key registers pulse, dim and back each beat. */
    'count-in-pulse': { tracks: { alpha: [1, 0.35] }, duration: PACE.linger, beats: 0.5, ease: 'inOut', loop: 'yoyo', group: 'song' },
    /** A value just changed in the panel: bright, then settling back to dim. */
    'value-settle': { tracks: { alpha: [1, 0.8] }, duration: PACE.settle, ease: 'out', group: 'song' },
    /** A mark around a cache line or a byte, fading as it's used (essential: jumping to its end would never show it). */
    'mark-fade': { tracks: { alpha: [1, 0] }, duration: PACE.linger, ease: 'linear', group: 'song', essential: true },
    /** The listing sliding its lines to their new place. */
    'listing-scroll': { tracks: { y: 'goal' }, duration: PACE.quick, ease: 'out', group: 'song' },
    /** A result travelling along the bus to its register or memory cell, within a beat. */
    'bus-carry': { tracks: { progress: [0, 1] }, duration: PACE.travel, beats: 0.8, ease: 'out', group: 'song' },
    /** Tier 3: a forwarded value jumping up its wire, within half a beat. */
    'bus-forward': { tracks: { progress: [0, 1] }, duration: PACE.travel, beats: 0.45, ease: 'out', group: 'song' },
    /** A timing mistake (a value read too early): the screen jolts. */
    jolt: { tracks: { x: { by: [0, -4, 4, -3, 3, -1, 0] } }, duration: PACE.blink, ease: 'linear', group: 'song' },
};
/** The recipe `name` as an era plays it (its variant laid over the recipe). */
export function recipeFor(name, motion) {
    return { ...MOTIONS[name], ...motion.variants?.[name] };
}
/**
 * How a recipe moves in an era: the era's way, or its group's (`GROUP_STYLES`).
 * With REDUCED MOTION on, everything jumps (no afterglow) and nothing loops, except what gameplay needs.
 */
export function styleFor(motion, recipe, reduced) {
    if (reduced && !recipe.essential)
        return { style: recipe.loop ? 'still' : 'cut' };
    const style = GROUP_STYLES[recipe.group ?? 'screen'];
    return style ? { style } : motion;
}
/**
 * The recipe as played: a recipe fitted to the beat (`beats`) lasts that
 * many beats of `beatMs` each, never longer than its own duration; `duration`
 * (a length the game sets, like a memory wait) replaces it.
 */
export function timed(recipe, options) {
    if (options.duration !== undefined)
        return { ...recipe, duration: Math.max(1, options.duration) };
    if (recipe.beats === undefined || options.beatMs === undefined)
        return recipe;
    return { ...recipe, duration: Math.max(1, Math.min(recipe.duration, recipe.beats * options.beatMs)) };
}
/** Where an easing is at `t` (0-1). */
export function eased(ease, t) {
    switch (ease) {
        case 'linear':
            return t;
        case 'in':
            return t ** 3;
        case 'out':
            return 1 - (1 - t) ** 3;
        case 'inOut':
            return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    }
}
/** A track's keyframes as values, from the value it started at (`rest`) and the motion's goal. */
export function keyframes(track, rest, goal) {
    if (track === 'goal')
        return [rest, goal ?? rest];
    if ('by' in track)
        return track.by.map((offset) => rest + offset);
    if ('times' in track)
        return track.times.map((factor) => rest * factor);
    return [...track];
}
/**
 * Where one pass of a recipe is at `elapsed` ms (0-1; loops wrap), whether
 * it's on the way back (a yoyo's second half), and whether it has finished.
 */
export function passAt(recipe, elapsed) {
    const t = Math.max(0, elapsed) / recipe.duration;
    if (!recipe.loop)
        return { at: Math.min(1, t), back: false, done: t >= 1 };
    const inCycle = t % (recipe.loop === 'yoyo' ? 2 : 1);
    return inCycle <= 1 ? { at: inCycle, back: false, done: false } : { at: 2 - inCycle, back: true, done: false };
}
/**
 * A property's value `elapsed` ms into a recipe, the way `motion` moves:
 * the keyframes (from `rest` and `goal`), the era's style, and its easing.
 * `axis`: for an x or y, which DOS moves in whole character cells.
 */
export function valueAt(recipe, track, rest, goal, elapsed, motion, axis) {
    const frames = keyframes(track, rest, goal);
    // Not its turn yet (a delay, a stagger): where it starts.
    if (frames.length === 1 || elapsed < 0)
        return frames[0];
    const segments = frames.length - 1;
    // Finished: exactly on its last keyframe, whatever the style.
    if (passAt(recipe, elapsed).done)
        return frames[segments];
    const { style } = motion;
    if (style === 'still')
        return frames[0];
    // DOS draws a few times a second: time moves in steps.
    const fps = style === 'step' ? (motion.fps ?? 10) : 0;
    const time = fps > 0 ? Math.floor(Math.max(0, elapsed) / (1000 / fps)) * (1000 / fps) : elapsed;
    const { at, back } = passAt(recipe, time);
    const position = at * segments;
    const index = Math.min(segments - 1, Math.floor(position));
    const [from, to] = [frames[index], frames[index + 1]];
    if (style === 'cut') {
        // No in-betweens: the keyframe it's heading for is reached as its part begins. A fall in alpha glows off instead, like phosphor.
        const [leaving, heading] = back ? [to, from] : [from, to];
        const afterglow = motion.afterglow ?? 0;
        if (heading < leaving && afterglow > 0 && !axis) {
            const since = ((back ? index + 1 - position : position - index) * recipe.duration) / segments;
            return heading + (leaving - heading) * Math.exp((-4 * since) / afterglow);
        }
        return heading;
    }
    const local = position - index;
    const shaped = style === 'ease' ? eased(recipe.ease ?? 'out', local) : local;
    const value = from + (to - from) * shaped;
    if (style === 'step' && axis && motion.cell) {
        // Whole character cells: the distance from where it ends up is rounded to cells.
        const size = motion.cell[axis];
        return frames[segments] + Math.round((value - frames[segments]) / size) * size;
    }
    return value;
}
//# sourceMappingURL=motions.js.map