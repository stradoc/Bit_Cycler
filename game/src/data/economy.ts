// Every price and balance number for the contract board and shop, in one place.

/**
 * CPU chips by word size, bought in this order: each is a new generation,
 * wider and built with smaller transistors, and it sets the era (ui/eras.ts).
 * The order follows when each feature reached real microprocessors (the
 * design doc's "Eras and upgrade order"): a chip goes on sale once you own
 * tier `afterTier`, and the CPU parts that need it say so (CPU_PARTS' `bits`).
 * `maxClock` is the highest clock step (an index into CLOCK.factors) the chip
 * runs: about 4 MHz at 8-bit, 16 MHz at 16-bit (with the pipeline's 4x),
 * 2 GHz at 32-bit, and 4 GHz at 64-bit, where real clocks stopped climbing
 * (the power wall). Prices are provisional until the balance pass.
 */
export const CHIPS = [
  { bits: 8, name: '8-BIT CPU', price: 0, afterTier: 1, maxClock: 2, about: 'The chip you start with.' },
  {
    bits: 16,
    name: '16-BIT CPU',
    price: 250,
    afterTier: 1,
    maxClock: 2,
    about: 'The next chip generation, built with smaller transistors. The 5-stage pipeline needs it. Your computer moves on to the 16-bit era.',
  },
  {
    bits: 32,
    name: '32-BIT CPU',
    price: 450,
    afterTier: 2,
    maxClock: 9,
    about: 'Smaller transistors again: the clock can climb to 2 GHz. Forwarding and branch prediction need it. Your computer moves on to the 32-bit era.',
  },
  {
    bits: 64,
    name: '64-BIT CPU',
    price: 3000,
    afterTier: 6,
    maxClock: 10,
    about: 'The last generation: the clock reaches 4 GHz, and there it stops, as real clocks did (the power wall). Your computer moves on to the 64-bit era.',
  },
] as const;

export type WordBits = (typeof CHIPS)[number]['bits'];

/** CPU parts, bought in this order: each one is the next tier, and needs a chip at least `bits` wide. */
export const CPU_PARTS = [
  {
    id: 'pipeline',
    name: '5-STAGE PIPELINE',
    price: 300,
    tier: 2,
    bits: 16,
    about: 'Splits each instruction into 5 short stages, so 5 run at once. CPI rises a little, but each stage is short, so the clock can run 4x faster.',
  },
  {
    id: 'forwarding',
    name: 'FORWARDING UNIT',
    price: 500,
    tier: 3,
    bits: 32,
    about: 'Hands a result straight from EXECUTE or MEMORY to the next instruction, so most stalls disappear.',
  },
  {
    id: 'guessing',
    name: 'BRANCH GUESSING',
    price: 700,
    tier: 4,
    bits: 32,
    about: 'Lets fetch follow a guess about each branch, so a right guess loses no cycle. You make the guesses.',
  },
  {
    id: 'predictor1',
    name: '1-BIT PREDICTOR',
    price: 900,
    tier: 5,
    bits: 32,
    about: 'Hardware that guesses each branch from what it did last time. You can follow it or override it.',
  },
  {
    id: 'predictor2',
    name: '2-BIT PREDICTOR',
    price: 1200,
    tier: 6,
    bits: 32,
    about: 'A counter per branch: one surprise only weakens it, so loops are guessed better.',
  },
  {
    id: 'superscalar',
    name: 'SUPERSCALAR (2 AT ONCE)',
    price: 1800,
    tier: 7,
    bits: 32,
    about: 'A second path through the CPU: two instructions can start in one cycle, if they need different units and the second needs nothing from the first.',
  },
] as const;

export type PartId = (typeof CPU_PARTS)[number]['id'];

/**
 * The deep pipeline: an optional part, switched on or off in the shop. Ten
 * shorter stages instead of five, so the clock runs faster, but a branch is
 * decided further from fetch, so a wrong guess throws away more work.
 * Stylized: real deep pipelines (the 1990s-2000s desktops, up to about 20
 * stages) gained less than 2x from twice the stages (the latches between
 * stages take their own time), and paid 10-20 cycles per wrong guess.
 */
export const DEEP_PIPELINE = {
  name: 'DEEP PIPELINE (10 STAGES)',
  price: 800,
  /** It needs branch guessing (tier 4: guesses are what it's about) and the 32-bit chip. */
  afterTier: 4,
  bits: 32,
  /** How much faster the rated clock runs with it on. */
  clockFactor: 1.5,
  /** Cycles a wrong guess costs with it on (the 5-stage pipeline: 1). */
  wrongGuessCycles: 4,
} as const;

/** Rated clock before any clock upgrades: a single-cycle CPU's long cycle vs a pipeline's short stage. */
export const BASE_MHZ = { singleCycle: 1, pipelined: 4 } as const;

/**
 * Clock upgrades: each level multiplies the rated clock (a smaller, faster
 * process). A fully upgraded pipeline runs at 4 GHz, like a modern desktop.
 * prices[i] buys level i + 1. Each chip stops at its own level (CHIPS' `maxClock`).
 */
export const CLOCK = {
  factors: [1, 2, 4, 8, 16, 32, 64, 125, 250, 500, 1000],
  prices: [200, 290, 420, 610, 885, 1280, 1860, 2700, 3900, 5660],
} as const;

/**
 * Memory parts, separate from the CPU tiers, bought in this order: each is
 * the next cache level (sim/memory.ts: the L1's shape, then LOWER_CACHES).
 * The L1 goes on sale once your clock outruns RAM (a trip takes over a
 * cycle); each level after it once your chip is `bits` wide, when the data
 * outgrows the level above (a 32-bit job's 128 bytes, a 64-bit job's 256).
 * `later` is what the shop says before it's on sale. `wip`: still being
 * reworked (WIP_PARTS). Prices are provisional until the balance pass.
 */
export const MEMORY_PARTS = [
  {
    id: 'l1',
    name: 'L1 CACHE: 16 BYTES',
    price: 500,
    bits: 8,
    lessonId: 'cache',
    wip: false,
    about: 'A tiny, fast memory beside the CPU: 4 lines of 4 bytes. A load it holds needs no trip to RAM; a miss brings in the whole 4-byte block, so the next bytes hit. Stores go out through a write buffer and never wait.',
    later: 'RAM keeps up with your clock for now: a trip fits in one cycle. Once a faster clock makes loads wait for RAM, this goes on sale.',
  },
  {
    id: 'l2',
    name: 'L2 CACHE: 128 BYTES',
    price: 800,
    bits: 32,
    lessonId: 'l2',
    wip: true,
    about: "A second, bigger cache behind the L1: 8 lines of 16 bytes, 2-way. When the L1 misses, the L2 answers in 5 ns instead of RAM's 60; each miss on the way to RAM takes 5 ns longer.",
    later: 'A bigger cache behind the L1, for wide data. Needs the L1 cache and the 32-bit chip.',
  },
  {
    id: 'l3',
    name: 'L3 CACHE: 256 BYTES',
    price: 1500,
    bits: 64,
    lessonId: 'l3',
    wip: true,
    about: 'A third cache behind the L2: 4 lines of 64 bytes, room for a whole 64-bit job. When the L2 misses, the L3 answers in 12 ns more; each miss on the way to RAM takes 12 ns longer.',
    later: 'The biggest cache, behind the L2. Needs the L2 cache and the 64-bit chip.',
  },
] as const;

/**
 * Upgrades to the L1 cache, on sale once it's bought, in any order. Each
 * changes one thing about its shape (sim/memory.ts `cacheShape`) and fixes one
 * kind of miss the game names (Patterson & Hennessy 5.3-5.4): more lines hold
 * more blocks (fewer TOO SMALL), two lines per set let two blocks share a place
 * (fewer CONFLICT; the same 16 bytes, so only the placement rule changes),
 * bigger blocks bring in more neighbours per miss (fewer FIRST USE) at a
 * slightly longer miss. Lines and blocks each double the cache. All three are
 * still being reworked (`wip`, WIP_PARTS). Prices are provisional until the
 * balance pass.
 */
export const CACHE_UPGRADES = [
  {
    id: 'lines',
    name: 'L1: 8 LINES',
    price: 600,
    field: 'lines',
    value: 8,
    lessonId: 'morelines',
    wip: true,
    about: 'Twice the lines, so twice the blocks fit: data you come back to is still there. Fewer TOO SMALL misses.',
  },
  {
    id: 'ways',
    name: 'L1: 2-WAY SETS',
    price: 800,
    field: 'ways',
    value: 2,
    lessonId: 'twoway',
    wip: true,
    about: 'Pairs the lines into sets: a block can go in either line of its set, so two blocks no longer push each other out. Fewer CONFLICT misses.',
  },
  {
    id: 'blocks',
    name: 'L1: 8-BYTE BLOCKS',
    price: 700,
    field: 'blockBytes',
    value: 8,
    lessonId: 'bigblocks',
    wip: true,
    about: 'Each miss brings in 8 bytes instead of 4, so more of the next data is already there. Fewer FIRST USE misses; each trip to RAM takes 5 ns longer.',
  },
] as const;

export type CacheUpgradeId = (typeof CACHE_UPGRADES)[number]['id'];

/**
 * Work in progress: parts that are in the game but still being reworked
 * (`wip` above). The shop and BRIEFS mark them and their lessons WIP. The
 * L1's upgrades and the L2 and L3 (user, 2026-11-02): first-use misses
 * interrupt the song too often once the data is wide, and TICK's lessons
 * on them are too technical for players new to computers (ROADMAP.md).
 */
export const WIP_PARTS = [...MEMORY_PARTS, ...CACHE_UPGRADES].filter((part) => part.wip);

/** Unlocks H (overclocking past the rated clock) in songs. Underclocking (G) is always allowed. */
export const OVERCLOCKING_PRICE = 400;

/** Coolers: how far above ambient a busy chip settles at its rated clock (°C; 30 with the stock cooler). */
export const COOLING = [
  { name: 'STOCK COOLER', ratedRise: 30, price: 0, about: 'The cooler the chip came with.' },
  { name: 'HEATSINK', ratedRise: 27, price: 250, about: 'A bigger block of metal: on an undamaged chip, 140% no longer overheats.' },
  { name: 'FAN', ratedRise: 24, price: 600, about: 'Moves heat away faster: even the top clock stays below the throttle point, worn chip or not.' },
] as const;

/** Repairing a chip worn by overheating: per 10% of maximum clock restored. */
export const REPAIR_PRICE_PER_STEP = 60;

const HOUR = 3600;

/**
 * The workday: the game's clock runs only while your CPU works (each job
 * takes its job time: instructions x the CPI you played x the clock period)
 * or when you log off. A day is 8 hours of your CPU's time, 9:00 to 5:00.
 * Offers are due a few hours after they're taken, and disappear a day or
 * two after they're posted if nobody takes them.
 */
export const WORKDAY = {
  /** When the day starts (24-hour clock), and how long it is (hours). */
  startHour: 9,
  hours: 8,
  /** How many days an offer stays on the board, at least and at most (it disappears at the end of its last day). */
  offerDays: [1, 2],
  /** How soon a job is due once it's taken (hours), at least and at most. */
  deadlineHours: [2, 8],
  /** Day 1's date: Monday, November 1 (2027, a year whose November starts on a Monday, so the weeks line up). */
  firstDay: { year: 2027, month: 10, date: 1 },
  /** How many finished days the calendar remembers (their timecards). */
  historyDays: 62,
} as const;

/**
 * Jobs are sized to your CPU: each grade takes this share of its deadline
 * on your hardware, played perfectly. Easy jobs leave room for mistakes;
 * stretch jobs are tight (a sloppy run is late), and pay more for it.
 */
export const GRADES = [
  { id: 'easy', name: 'EASY JOBS', share: [0.35, 0.5], payBonus: 0.8 },
  { id: 'fair', name: 'FAIR JOBS', share: [0.6, 0.75], payBonus: 1 },
  { id: 'stretch', name: 'STRETCH JOBS', share: [0.85, 0.95], payBonus: 1.4 },
] as const;

export type GradeId = (typeof GRADES)[number]['id'];

export const CONTRACTS_PER_GRADE = 2;

/**
 * Pay per hour of job time grows with how fast your CPU is (its typical
 * instructions per second), more slowly than the speed itself: a CPU 1000x
 * faster earns about 11x as much an hour, so upgrades pay off without the
 * money running away. About $15 an hour at a million instructions a second.
 */
export const PAY = { perHourAtOneMips: 15, exponent: 0.35 } as const;

/**
 * How wide a contract's data is (word size, as the width of the job's
 * numbers: sim/generator.ts): offered once your chip is that wide, `weight`
 * how often among the widths your chip can take (the newest most often), and
 * `pay` a multiplier on the job's pay (wider data comes from bigger clients).
 * Weights and pay to be tuned by playing.
 */
export const DATA_WIDTHS = [
  { bits: 8, weight: 1, pay: 1 },
  { bits: 16, weight: 2, pay: 1.2 },
  { bits: 32, weight: 3, pay: 1.45 },
  { bits: 64, weight: 4, pay: 1.75 },
] as const;

/**
 * Jobs that show off what you've bought (sim/showcase.ts). Of the new
 * contracts dealt, `share` are picked because one of the parts your CPU uses
 * speeds them up: your newest part gets `newest[0]` of those, the one bought
 * before it `newest[1]`, and the rest share what's left. Each is the best of
 * `candidates` jobs, and only counts if the part makes it at least `minGain`
 * times as fast; otherwise an ordinary job is dealt. To tune by playing.
 */
export const SHOWCASE = { share: 0.75, newest: [0.5, 0.25], candidates: 4, minGain: 1.05 } as const;

/** A new game's first job, the only one on the board until it's done (data/programs.ts TUTORIAL_PROGRAM): what it pays, and how soon it's needed. */
export const TUTORIAL_JOB = { pay: 50, deadline: 2 * HOUR } as const;
/** Finishing after the deadline pays this much of the pay. */
export const LATE_PAY_FACTOR = 0.5;
/** A job your CPU would finish within this share of its deadline (playing perfectly) is tight: a sloppy run could be late. */
export const TIGHT_SHARE = 0.8;
