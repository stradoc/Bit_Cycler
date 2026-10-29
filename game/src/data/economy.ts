// Every price and balance number for the contract board and shop, in one place.

/** CPU parts, bought in this order: each one is the next tier. */
export const CPU_PARTS = [
  {
    id: 'pipeline',
    name: '5-STAGE PIPELINE',
    price: 300,
    tier: 2,
    about: 'Splits each instruction into 5 short stages, so 5 run at once. CPI rises a little, but each stage is short, so the clock can run 4x faster.',
  },
  {
    id: 'forwarding',
    name: 'FORWARDING UNIT',
    price: 500,
    tier: 3,
    about: 'Hands a result straight from EXECUTE or MEMORY to the next instruction, so most stalls disappear.',
  },
  {
    id: 'guessing',
    name: 'BRANCH GUESSING',
    price: 700,
    tier: 4,
    about: 'Lets fetch follow a guess about each branch, so a right guess loses no cycle. You make the guesses.',
  },
  {
    id: 'predictor1',
    name: '1-BIT PREDICTOR',
    price: 900,
    tier: 5,
    about: 'Hardware that guesses each branch from what it did last time. You can follow it or override it.',
  },
  {
    id: 'predictor2',
    name: '2-BIT PREDICTOR',
    price: 1200,
    tier: 6,
    about: 'A counter per branch: one surprise only weakens it, so loops are guessed better.',
  },
] as const;

export type PartId = (typeof CPU_PARTS)[number]['id'];

/** Rated clock before any clock upgrades: a single-cycle CPU's long cycle vs a pipeline's short stage. */
export const BASE_MHZ = { singleCycle: 1, pipelined: 4 } as const;

/**
 * Clock upgrades: each level multiplies the rated clock (a smaller, faster
 * process). A fully upgraded pipeline runs at 4 GHz, like a modern desktop.
 * prices[i] buys level i + 1.
 */
export const CLOCK = {
  factors: [1, 2, 4, 8, 16, 32, 64, 125, 250, 500, 1000],
  prices: [200, 290, 420, 610, 885, 1280, 1860, 2700, 3900, 5660],
} as const;

/** Unlocks H (overclocking past the rated clock) in songs. Underclocking (G) is always allowed. */
export const OVERCLOCKING_PRICE = 400;

/** Coolers: how far above ambient a busy chip settles at its rated clock (°C; 30 with the stock cooler). */
export const COOLING = [
  { name: 'STOCK COOLER', ratedRise: 30, price: 0, about: 'The cooler the chip came with.' },
  { name: 'HEATSINK', ratedRise: 27, price: 250, about: 'A bigger block of metal: 140% no longer overheats.' },
  { name: 'FAN', ratedRise: 24, price: 600, about: 'Moves heat away faster: even 150% stays below the throttle point.' },
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
  // Sized so a fully upgraded CPU can take every advanced job, even the biggest, most urgent one.
  { id: 'advanced', name: 'ADVANCED', instructions: [1e14, 1e15], deadline: [7 * DAY, 60 * DAY], pay: [500, 1200] },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export const CONTRACTS_PER_SECTION = 2;
/** Finishing after the deadline pays this much of the pay. */
export const LATE_PAY_FACTOR = 0.5;
/** A job your CPU would finish within this share of its deadline (playing perfectly) is tight: a sloppy run could be late. */
export const TIGHT_SHARE = 0.8;
/** Programs contracts are drawn from (see data/programs.ts). */
export const CONTRACT_PROGRAMS = ['SUM ARRAY', 'SUM GRID'] as const;
