import { DEEP_PIPELINE, MEMORY_PARTS } from '../data/economy.js';
import { programByName } from '../data/programs.js';
import { songFor } from '../data/songs.js';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, isDifficulty } from '../rhythm/tempo.js';
import { cachesBelow, cacheShape } from '../sim/memory.js';
import { cacheOf, deepActive, lowerCachesOf, ratedMhzFor } from '../sim/progress.js';
import { THERMAL } from '../sim/thermal.js';
import { ROWS, SINGLE_CYCLE_ROWS } from './layout.js';
/**
 * Works out a song's setup: `start` first, then the save (the parts owned
 * and the chip's wear), then the URL's dev shortcuts for anything still missing.
 */
export function songSetup(start, progress, params) {
    // ?single, ?forwarding, ?guessing and ?predictor=1-bit (or 2-bit) play tiers 1 and 3-6; ?practice starts in practice.
    const singleCycle = start.singleCycle ?? params.has('single');
    const predictorParam = params.get('predictor');
    const predictor = start.predictor ?? (predictorParam === '1-bit' || predictorParam === '2-bit' ? predictorParam : undefined);
    const practice = start.practice ?? params.has('practice');
    // ?contract=fair plays the board's first contract of that grade (easy, fair or stretch).
    const contract = start.contract ?? progress.board.find((c) => c.grade === params.get('contract'));
    // ?program=SUM WORDS plays a program by name (data/programs.ts, or a contract's: "32-BIT SUM #4821").
    const program = start.program ?? contract?.program ?? params.get('program') ?? (predictor ? 'SUM GRID' : 'SUM ARRAY');
    const { replay } = start;
    const guessing = start.guessing ?? params.has('guessing');
    // ?deep fits the deep pipeline (on a pipelined CPU); from the save, only where branches are guessed.
    const deep = !singleCycle && (start.deep ?? ((guessing && deepActive(progress)) || params.has('deep')));
    // ?clock=150 starts the song overclocked, and allows it without the upgrade. Practice always runs at the rated clock.
    const clock = Number(params.get('clock')) / 100;
    const asked = params.get('difficulty');
    const difficulty = start.difficulty ?? (isDifficulty(asked) ? asked : DEFAULT_DIFFICULTY);
    // ?cache fits the L1 cache; ?cache=l2 or l3 with the caches below it, and ?sizes=2,1,0 with those size steps.
    // A lesson that names its L1 runs it alone unless it names the levels below too.
    const l1 = start.l1 ?? cacheOf(progress) ?? cacheParam(params);
    const lowerCaches = !l1 ? [] : (start.lowerCaches ?? (start.l1 !== undefined ? [] : cacheOf(progress) ? lowerCachesOf(progress) : lowerParam(params)));
    return {
        program,
        spec: programByName(program),
        dataBits: programByName(program).dataBits ?? 8,
        song: songFor(program),
        singleCycle,
        forwarding: start.forwarding ?? params.has('forwarding'),
        guessing,
        predictor,
        l1,
        lowerCaches,
        deep,
        // ?superscalar lets two start together (a tier's options pass it in, like its other hardware).
        superscalar: !singleCycle && (start.superscalar ?? params.has('superscalar')),
        ratedMhz: ratedMhzFor(progress, !singleCycle, deep),
        // Wear is the chip's own, and a replay plays on the chip its run started on.
        // Practice always runs on a new chip, so it never overheats.
        maxDial: replay?.maxDial ?? (practice ? THERMAL.maxDial : progress.chipMaxDial),
        canOverclock: replay?.canOverclock ?? (progress.overclocking || params.has('clock')),
        startDial: clock && !practice && !replay ? clock : undefined,
        difficulty,
        pace: DIFFICULTIES[practice ? 'relaxed' : difficulty],
        practice,
        guided: practice && singleCycle,
        contract,
        returnTo: start.returnTo,
        replay,
        watching: replay !== undefined,
        // ?tour=tier1 plays a lesson's tour first (with ?practice); ?tour=memwall,cache plays two.
        tour: replay ? undefined : (start.tour ?? params.get('tour')?.split(',') ?? undefined),
        afterTour: replay ? undefined : start.afterTour,
        rows: singleCycle ? SINGLE_CYCLE_ROWS : ROWS,
    };
}
/** The size steps the URL asks for, each level's (?sizes=2,1,0: the L1 first), as Progress.cacheSizes keeps them. */
function sizesParam(params) {
    return (params.get('sizes') ?? '').split(',').map((steps) => Number(steps) || 0);
}
/** The L1 the URL asks for: ?cache for the first one, with ?sizes' steps. */
function cacheParam(params) {
    if (!params.has('cache'))
        return false;
    return cacheShape(0, sizesParam(params)[0] ?? 0);
}
/** The caches below the L1 the URL asks for: ?cache=l2 the L2, ?cache=l3 the L2 and L3 (MEMORY_PARTS' ids), with ?sizes' steps. */
function lowerParam(params) {
    const asked = (params.get('cache') ?? '').split(',');
    const levels = MEMORY_PARTS.reduce((most, part, i) => (i > 0 && asked.includes(part.id) ? i : most), 0);
    return cachesBelow(levels, sizesParam(params));
}
/** The hardware the simulator runs for this song, at a clock (MHz). */
export function pipelineOptions(setup, mhz) {
    const { forwarding, predictor, singleCycle, l1, lowerCaches, deep, superscalar } = setup;
    return { forwarding, predictor, singleCycle, cache: l1 || undefined, lowerCaches, mhz, wrongGuessCycles: deep ? DEEP_PIPELINE.wrongGuessCycles : 1, superscalar };
}
// Starting the song again passes its whole setup on. songSetup reads only what
// SongStart names and works out the rest again, so the chip's wear is the save's
// latest (after an overheat in this run), unless a replay says otherwise.
/** Playing again, after practice or a replay: the same CPU, program and contract, for real. */
export function playAgain(setup) {
    return { ...setup, practice: false, replay: undefined, tour: undefined, afterTour: undefined };
}
/** Watching a run: the same song, playing back what was played. */
export function watch(setup, replay) {
    return { ...setup, practice: false, replay, tour: undefined, afterTour: undefined };
}
//# sourceMappingURL=setup.js.map