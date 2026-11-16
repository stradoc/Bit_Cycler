import { DATA_WIDTHS, MEMORY_PARTS, SHOWCASE } from '../data/economy.js';
import { generateProgram } from './generator.js';
import { cacheShape } from './memory.js';
import { cpiOn, deepActive, hardwareOptions, ratedMhzFor, tierOf } from './progress.js';
const tier = (progress) => tierOf(progress).number;
/** Jobs with branches that depend on the data or loops inside loops: what a predictor is for. */
const BRANCHY = ['GRID SUM', 'COUNT', 'REPLACE', 'FIND'];
/** Every part a job can show off, oldest first (the order used for parts bought before Progress.bought kept them). */
export const SHOWCASES = [
    { id: 'forwarding', name: 'FORWARDING UNIT', inUse: (p) => tier(p) >= 3, without: (o) => ({ ...o, forwarding: false }) },
    { id: 'predictor1', name: '1-BIT PREDICTOR', inUse: (p) => tier(p) === 5, without: (o) => ({ ...o, predictor: undefined }), kinds: BRANCHY },
    { id: 'predictor2', name: '2-BIT PREDICTOR', inUse: (p) => tier(p) >= 6, without: (o) => ({ ...o, predictor: '1-bit' }), kinds: BRANCHY },
    {
        id: 'superscalar',
        name: 'SUPERSCALAR',
        inUse: (p) => tier(p) >= 7,
        without: (o) => ({ ...o, superscalar: false }),
        kinds: ['UNROLLED SUM', 'UNROLLED CHECKSUM', 'FILL', 'COPY', 'DOUBLE'],
    },
    { id: 'deep', name: 'DEEP PIPELINE', inUse: deepActive, without: (o, p) => ({ ...o, wrongGuessCycles: 1, mhz: ratedMhzFor(p, true, false) }) },
    // Each cache level is shown off while it's the lowest (there's no L3 without the L2 above it, nor either without the L1).
    { id: 'l1', name: 'L1 CACHE', inUse: (p) => p.cacheLevels === 1, without: (o) => ({ ...o, cache: undefined }) },
    // A level's size step against the same level one step smaller.
    {
        id: `${MEMORY_PARTS[0].id}size`,
        name: 'BIGGER L1',
        inUse: (p) => p.cacheLevels >= 1 && p.cacheSizes[0] > 0,
        without: (o, p) => ({ ...o, cache: cacheShape(0, p.cacheSizes[0] - 1) }),
        // Bytes fit the first L1 already: only wider data outgrows it before the second pass.
        kinds: ['OTHERS', 'CHECKED COPY'],
        widths: () => [16, 32, 64],
    },
    { id: 'l2', name: 'L2 CACHE', inUse: (p) => p.cacheLevels === 2, without: (o) => ({ ...o, lowerCaches: [] }) },
    {
        id: `${MEMORY_PARTS[1].id}size`,
        name: 'BIGGER L2',
        inUse: (p) => p.cacheLevels >= 2 && p.cacheSizes[1] > 0,
        without: (o, p) => ({ ...o, lowerCaches: smaller(o, 1, p.cacheSizes[1] - 1) }),
        // Only data wider than the L1 keeps going down to the L2.
        widths: () => [32, 64],
    },
    { id: 'l3', name: 'L3 CACHE', inUse: (p) => p.cacheLevels >= 3, without: (o) => ({ ...o, lowerCaches: (o.lowerCaches ?? []).slice(0, 1) }) },
    {
        id: `${MEMORY_PARTS[2].id}size`,
        name: 'BIGGER L3',
        inUse: (p) => p.cacheLevels >= 3 && p.cacheSizes[2] > 0,
        without: (o, p) => ({ ...o, lowerCaches: smaller(o, 2, p.cacheSizes[2] - 1) }),
        widths: () => [64],
    },
];
/** The caches below the L1 in `options`, with `level` (1 the L2, 2 the L3) at `steps` instead. */
function smaller(options, level, steps) {
    return (options.lowerCaches ?? []).map((each, i) => (i === level - 1 ? { ...each, shape: cacheShape(level, steps) } : each));
}
// Every cache level's size step is here, under its shop key.
for (const part of MEMORY_PARTS)
    if (!SHOWCASES.some((each) => each.id === `${part.id}size`))
        throw new Error(`no showcase for ${part.id}size`);
/** The parts your CPU uses now, newest last: in the order bought, those bought before the shop kept a log first, in the table's order. */
export function partsInUse(progress) {
    const at = (part) => progress.bought.lastIndexOf(part.id);
    return SHOWCASES.filter((part) => part.inUse(progress)).sort((a, b) => at(a) - at(b));
}
/** How much faster `part` makes a program on your hardware: its time without the part over its time with it (above 1: faster). */
export function gainOf(programName, part, progress) {
    const withIt = hardwareOptions(progress);
    const without = part.without(withIt, progress);
    const time = (options) => cpiOn(programName, options) / (options.mhz ?? 1);
    return time(without) / time(withIt);
}
/** Which part a new job shows off: the newest most often (SHOWCASE.newest), the rest sharing what's left. */
function choosePart(parts, random) {
    const newestFirst = [...parts].reverse();
    const named = SHOWCASE.newest;
    const left = Math.max(0, 1 - named.reduce((sum, share) => sum + share, 0)) / Math.max(1, newestFirst.length - named.length);
    const shares = newestFirst.map((_, i) => named[i] ?? left);
    let pick = random() * shares.reduce((sum, share) => sum + share, 0);
    return newestFirst.find((_, i) => (pick -= shares[i]) < 0) ?? newestFirst[0];
}
/**
 * A new job picked to show off one of your parts, or undefined for an
 * ordinary job: most of the time (SHOWCASE.share), the job among a few
 * candidates that the part speeds up most, if it speeds it up enough. Draws
 * nothing from `random` while your CPU has no part to show. Skips companies in
 * `busy` (full on the board: JOBS_PER_COMPANY).
 */
export function showcaseJob(progress, random, busy = new Set()) {
    const parts = partsInUse(progress);
    if (parts.length === 0 || random() >= SHOWCASE.share)
        return undefined;
    const part = choosePart(parts, random);
    const open = DATA_WIDTHS.map((width) => width.bits).filter((bits) => bits <= progress.wordBits);
    const widths = (part.widths?.(progress) ?? open).filter((bits) => open.includes(bits));
    let best;
    let bestGain = SHOWCASE.minGain;
    for (let i = 0; i < SHOWCASE.candidates && widths.length > 0; i++) {
        const bits = widths[Math.floor(random() * widths.length)];
        const kind = part.kinds?.[Math.floor(random() * part.kinds.length)];
        const program = generateProgram(Math.floor(random() * 1_000_000), kind, bits);
        if (busy.has(program.client ?? ''))
            continue;
        const gain = gainOf(program.name, part, progress);
        if (gain >= bestGain)
            [best, bestGain] = [program, gain];
    }
    return best && { program: best, part };
}
/** The job sheet's line for a job dealt to show off a part your CPU still uses: "YOUR SUPERSCALAR: 27% FASTER ON THIS JOB". */
export function showcaseLine(contract, progress) {
    const part = SHOWCASES.find((each) => each.id === contract.shows);
    if (!part || !part.inUse(progress))
        return undefined;
    const gain = gainOf(contract.program, part, progress);
    if (gain < SHOWCASE.minGain)
        return undefined;
    return `YOUR ${part.name}: ${gain >= 2 ? `${gain.toFixed(1)}x` : `${Math.round((gain - 1) * 100)}%`} FASTER ON THIS JOB`;
}
//# sourceMappingURL=showcase.js.map