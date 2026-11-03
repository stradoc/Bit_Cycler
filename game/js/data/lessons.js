import { cacheShape, L1_BASE } from '../sim/memory.js';
export const LESSONS = Object.fromEntries([
    { id: 'tier1', title: 'LESSON 1: HOW A CPU RUNS A PROGRAM', scene: 'pipeline', options: { singleCycle: true }, practice: true },
    { id: 'tier2', title: 'LESSON 2: PIPELINING', scene: 'pipeline', practice: true },
    { id: 'tier3', title: 'LESSON 3: FORWARDING', scene: 'pipeline', options: { forwarding: true }, practice: true },
    { id: 'tier4', title: 'LESSON 4: BRANCH PREDICTION', scene: 'pipeline', options: { forwarding: true, guessing: true }, practice: true },
    { id: 'tier5', title: 'LESSON 5: A 1-BIT PREDICTOR', scene: 'pipeline', options: { forwarding: true, guessing: true, predictor: '1-bit', program: 'SUM GRID' }, practice: true },
    { id: 'tier6', title: 'LESSON 6: A 2-BIT PREDICTOR', scene: 'pipeline', options: { forwarding: true, guessing: true, predictor: '2-bit', program: 'SUM GRID' }, practice: true },
    { id: 'tier7', title: 'LESSON 7: TWO AT ONCE (SUPERSCALAR)', scene: 'pipeline', options: { forwarding: true, guessing: true, predictor: '2-bit', superscalar: true, program: 'SUM PAIRS' }, practice: true },
    // Explained once, on the song screen, as the upgrade arrives (or the clock first outruns RAM); no practice of their own.
    { id: 'overclock', title: 'OVERCLOCKING', scene: 'pipeline', practice: false },
    { id: 'memwall', title: 'THE MEMORY WALL', scene: 'pipeline', options: { forwarding: true }, practice: false },
    { id: 'cache', title: 'THE L1 CACHE', scene: 'pipeline', options: { forwarding: true, l1: L1_BASE }, practice: true },
    { id: 'morelines', title: 'THE L1: 8 LINES', scene: 'pipeline', options: { forwarding: true, l1: cacheShape(['lines']), program: 'TWO PASSES' }, practice: true },
    { id: 'twoway', title: 'THE L1: 2-WAY SETS', scene: 'pipeline', options: { forwarding: true, l1: cacheShape(['ways']), program: 'ADD TWO LISTS' }, practice: true },
    { id: 'bigblocks', title: 'THE L1: 8-BYTE BLOCKS', scene: 'pipeline', options: { forwarding: true, l1: cacheShape(['blocks']), program: 'SUM WORDS' }, practice: true },
    { id: 'l2', title: 'THE L2 CACHE', scene: 'pipeline', options: { forwarding: true, l1: L1_BASE, lowerCaches: 1, program: 'TWO PASSES' }, practice: true },
    { id: 'l3', title: 'THE L3 CACHE', scene: 'pipeline', options: { forwarding: true, l1: L1_BASE, lowerCaches: 2, program: 'SUM BIG NUMBERS' }, practice: true },
    { id: 'deep', title: 'THE DEEP PIPELINE', scene: 'pipeline', options: { forwarding: true, guessing: true, deep: true }, practice: true },
].map((lesson) => [lesson.id, lesson]));
//# sourceMappingURL=lessons.js.map