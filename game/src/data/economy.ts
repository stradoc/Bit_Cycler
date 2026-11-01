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
 * Memory parts, separate from the CPU tiers, bought in this order. The L1
 * cache goes on sale once your clock outruns RAM (a trip takes over a cycle).
 */
export const MEMORY_PARTS = [
  {
    id: 'l1',
    name: 'L1 CACHE: 16 BYTES',
    price: 500,
    about: 'A tiny, fast memory beside the CPU: 4 lines of 4 bytes. A load it holds needs no trip to RAM; a miss brings in the whole 4-byte block, so the next bytes hit. Stores go out through a write buffer and never wait.',
  },
] as const;

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

/**
 * Contract board sections. A job's size is its instruction count and its
 * deadline how soon it's needed (both log-uniform in their ranges). Pay grows
 * with size and with urgency. A job is locked if your CPU couldn't meet its
 * deadline even playing perfectly; a run sloppy enough to miss it pays
 * LATE_PAY_FACTOR of the pay.
 */
const MINUTE = 60;
const DAY = 86400;
export const SECTIONS = [
  { id: 'starter', name: 'STARTER', instructions: [1e4, 1e6], deadline: [1 * MINUTE, 10 * MINUTE], pay: [40, 80] },
  { id: 'standard', name: 'STANDARD', instructions: [1e11, 3e13], deadline: [1 * DAY, 7 * DAY], pay: [150, 400] },
  // Sized so a fully upgraded CPU (with the L1 cache) can take every advanced job, even the biggest,
  // most urgent one on the program that misses most (ADD ARRAYS: CPI about 32 at 4 GHz).
  { id: 'advanced', name: 'ADVANCED', instructions: [1e13, 7e13], deadline: [7 * DAY, 60 * DAY], pay: [500, 1200] },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export const CONTRACTS_PER_SECTION = 2;
/** A new game's first job, the only one on the board until it's done (data/programs.ts TUTORIAL_PROGRAM): what it pays, and how soon it's needed. */
export const TUTORIAL_JOB = { pay: 50, deadline: 1 * MINUTE } as const;
/** Finishing after the deadline pays this much of the pay. */
export const LATE_PAY_FACTOR = 0.5;
/** A job your CPU would finish within this share of its deadline (playing perfectly) is tight: a sloppy run could be late. */
export const TIGHT_SHARE = 0.8;
