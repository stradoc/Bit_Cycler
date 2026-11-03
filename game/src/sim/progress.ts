// The player's progress: money, the CPU chip (its word size) and parts, clock,
// memory and cooling upgrades, chip wear, and the contract board. Pure functions over a plain object, so the
// rules are testable; game/src/save.ts stores it.

import {
  BASE_MHZ,
  CACHE_UPGRADES,
  CHIPS,
  DATA_WIDTHS,
  CLOCK,
  CONTRACTS_PER_GRADE,
  COOLING,
  CPU_PARTS,
  DEEP_PIPELINE,
  LATE_PAY_FACTOR,
  MEMORY_PARTS,
  OVERCLOCKING_PRICE,
  REPAIR_PRICE_PER_STEP,
  GRADES,
  PAY,
  TIGHT_SHARE,
  TUTORIAL_JOB,
  WORKDAY,
  type CacheUpgradeId,
  type PartId,
  type GradeId,
  type WordBits,
} from '../data/economy.ts';
import { programByName, TUTORIAL_PROGRAM } from '../data/programs.ts';
import { generateProgram } from './generator.ts';
import { showcaseJob } from './showcase.ts';
import type { SkillJob } from '../rhythm/skills.ts';
import { formatDuration, formatMhz } from '../format.ts';
import { tierByNumber, type Tier } from '../data/tiers.ts';
import { cpuFor, trace } from './cpu.ts';
import { cacheShape, cacheWords, ramCycles, type CacheShape } from './memory.ts';
import { perfectRun, type PipelineOptions } from './pipeline.ts';
import { THERMAL, type ThermalConfig } from './thermal.ts';
import { tempoForClock } from '../rhythm/tempo.ts';

/** A job on the board. The song plays the first part of it; the rest runs at the same pace. */
export type Contract = {
  readonly id: number;
  /** How hard it is for the CPU it was sized for (GRADES): easy, fair or stretch. */
  readonly grade: GradeId;
  readonly program: string;
  /** Instructions the whole job executes. */
  readonly instructions: number;
  /** How soon it's needed, in seconds of game time from when it's taken. */
  readonly deadline: number;
  readonly pay: number;
  /** The last day it's on offer (sim/workday.ts drops it when that day ends). */
  readonly expires: number;
  /** The part it was dealt to show off (sim/showcase.ts SHOWCASES' id), if it was. */
  readonly shows?: string;
};

/** What a day's work came to, for its timecard: jobs finished, how many of them late, and the money earned. */
export type DayTally = { readonly jobs: number; readonly late: number; readonly earned: number };

/** A finished day, as the calendar remembers it: its tally, which day it was, and when it ended (seconds since midnight). */
export type DayRecord = DayTally & { readonly day: number; readonly out: number };

export type Progress = {
  readonly money: number;
  /** The CPU chip's word size (CHIPS): it sets the era and the highest clock step. */
  readonly wordBits: WordBits;
  /** CPU parts owned, in the order bought (each is the next tier). */
  readonly parts: readonly PartId[];
  /** Index into CLOCK.factors. */
  readonly clockLevel: number;
  /** Cache levels owned (MEMORY_PARTS), in order: 0 = none, 1 = the L1, 2 = and the L2, 3 = and the L3. */
  readonly cacheLevels: number;
  /** Upgrades to the L1 owned (CACHE_UPGRADES), in the order bought. */
  readonly cacheUpgrades: readonly CacheUpgradeId[];
  /** What was bought in the shop, by item key, oldest first, each once (at its latest): the newest parts get the most jobs (sim/showcase.ts). */
  readonly bought: readonly string[];
  /** Index into COOLING. */
  readonly cooling: number;
  /** Bought the overclocking unlock: H can push the clock past its rating. */
  readonly overclocking: boolean;
  /** The deep pipeline (DEEP_PIPELINE): not bought, or bought and switched off or on in the shop. */
  readonly deepPipeline: 'none' | 'off' | 'on';
  /** Maximum clock dial: overheating lowers it until repaired. */
  readonly chipMaxDial: number;
  readonly board: readonly Contract[];
  readonly nextId: number;
  /** Lesson ids whose briefing this player has finished: a new campaign starts with none. */
  readonly seenLessons: readonly string[];
  /** Practice tips TICK has given (`Tip.id`, song/words.ts): each is said once a game, so a practice only teaches what's new. */
  readonly seenTips: readonly string[];
  /** The calendar (sim/workday.ts): the day (from 1), the seconds of it worked so far (0 at 9:00), and its tally. */
  readonly day: number;
  readonly worked: number;
  readonly today: DayTally;
  /** The days finished so far, oldest first (the last WORKDAY.historyDays of them). */
  readonly history: readonly DayRecord[];
  /** Each job's right calls (rhythm/skills.ts: the learning objective, measured), oldest first. */
  readonly skills: readonly SkillJob[];
};

export const NEW_GAME: Progress = {
  money: 0,
  wordBits: 8,
  parts: [],
  clockLevel: 0,
  cacheLevels: 0,
  cacheUpgrades: [],
  bought: [],
  cooling: 0,
  overclocking: false,
  deepPipeline: 'none',
  chipMaxDial: THERMAL.maxDial,
  board: [],
  nextId: 1,
  seenLessons: [],
  seenTips: [],
  day: 1,
  worked: 0,
  today: { jobs: 0, late: 0, earned: 0 },
  history: [],
  skills: [],
};

/** The player has seen a lesson or tour (data/tours.ts TAUGHT_IDS). */
export function hasSeen(progress: Progress, id: string): boolean {
  return progress.seenLessons.includes(id);
}

/** Lessons or tours marked seen (each once). */
export function withSeen(progress: Progress, ...ids: readonly string[]): Progress {
  return { ...progress, seenLessons: [...new Set([...progress.seenLessons, ...ids])] };
}

/** A practice tip marked given (each once). */
export function withTipSeen(progress: Progress, id: string): Progress {
  return progress.seenTips.includes(id) ? progress : { ...progress, seenTips: [...progress.seenTips, id] };
}

/** A random number in [0, 1); injectable so tests are repeatable. */
export type Random = () => number;

// ---- the CPU you own ----

export function tierOf(progress: Progress): Tier {
  return tierByNumber(1 + progress.parts.length);
}

/** A CPU chip: a word size, the tier it follows and its top clock step. */
export type CpuChip = (typeof CHIPS)[number];

/** The chip `bits` wide, if there is one (a cheat, an edited save). */
export function chipByBits(bits: number): CpuChip | undefined {
  return CHIPS.find((chip) => chip.bits === bits);
}

/** The chip you own. */
export function chipOf(progress: Progress): CpuChip {
  return chipByBits(progress.wordBits) ?? CHIPS[0];
}

/** A word size the way every screen writes it: "16-BIT". */
export function bitsName(bits: number): string {
  return `${bits}-BIT`;
}

/** Your CPU in words, as the screens and the boot show it: "16-BIT, TIER 2 PIPELINE". */
export function cpuName(progress: Progress): string {
  const tier = tierOf(progress);
  return `${bitsName(progress.wordBits)}, TIER ${tier.number} ${tier.name}${deepActive(progress) ? ', DEEP PIPELINE' : ''}`;
}

/**
 * The deep pipeline is in use: bought, switched on, and on a CPU that runs
 * it (branch guessing and its chip; a developer-screen tier or chip below
 * that leaves it bought but idle).
 */
export function deepActive(progress: Progress): boolean {
  return progress.deepPipeline === 'on' && tierOf(progress).number >= DEEP_PIPELINE.afterTier && progress.wordBits >= DEEP_PIPELINE.bits;
}

/** The deep pipeline switched the other way (bought: on and off; not bought: unchanged). */
export function toggleDeep(progress: Progress): Progress {
  if (progress.deepPipeline === 'none') return progress;
  return { ...progress, deepPipeline: progress.deepPipeline === 'on' ? 'off' : 'on' };
}

/** Your CPU and its rated clock: "16-BIT, TIER 2 PIPELINE AT 16 MHz". */
export function cpuLine(progress: Progress): string {
  return `${cpuName(progress)} AT ${formatMhz(ratedMhz(progress))}`;
}

/** The narrowest chip that runs these CPU parts and this clock step. */
export function chipNeeded(progress: Progress): WordBits {
  const parts = CPU_PARTS.filter((part) => progress.parts.includes(part.id));
  const bits = Math.max(8, ...parts.map((part) => part.bits));
  return (CHIPS.find((chip) => chip.bits >= bits && chip.maxClock >= progress.clockLevel) ?? CHIPS[CHIPS.length - 1]).bits;
}

/** `progress` on a chip wide enough for its parts and clock (an old save, a cheat). */
export function fitChip(progress: Progress): Progress {
  const bits = chipNeeded(progress);
  return bits > progress.wordBits ? { ...progress, wordBits: bits } : progress;
}

/**
 * A copy of `progress` on the `bits` chip, for testing: the CPU parts it
 * can't run are taken off (from the last bought), and the clock comes down to its top step.
 */
export function withWordBits(progress: Progress, bits: WordBits): Progress {
  const chip = chipByBits(bits) ?? CHIPS[0];
  // Parts are bought in order and each needs a chip at least as wide as the last one's, so this keeps the first few.
  const parts = progress.parts.filter((id) => (CPU_PARTS.find((part) => part.id === id)?.bits ?? 8) <= chip.bits);
  return { ...progress, wordBits: chip.bits, parts, clockLevel: Math.min(progress.clockLevel, chip.maxClock) };
}

export function isPipelined(progress: Progress): boolean {
  return progress.parts.length > 0;
}

/** Rated clock in MHz: the base clock (single-cycle or pipelined) times the clock upgrades. */
export function ratedMhz(progress: Progress): number {
  return ratedMhzFor(progress, isPipelined(progress));
}

/**
 * The rated clock a pipelined or single-cycle CPU would have with these
 * clock upgrades, and the deep pipeline if it's in use. The deep pipeline's
 * faster clock stops at the power wall (the top clock step), as real ones
 * did: there it keeps its dearer wrong guesses and gains nothing.
 */
export function ratedMhzFor(progress: Progress, pipelined: boolean, deep = pipelined && deepActive(progress)): number {
  const clock = (pipelined ? BASE_MHZ.pipelined : BASE_MHZ.singleCycle) * CLOCK.factors[progress.clockLevel];
  return deep ? Math.min(clock * DEEP_PIPELINE.clockFactor, BASE_MHZ.pipelined * CLOCK.factors[CLOCK.factors.length - 1]) : clock;
}

/** Owns the L1 cache. */
export function hasCache(progress: Progress): boolean {
  return progress.cacheLevels > 0;
}

/** The L1 cache you own, with its upgrades, or undefined without one. */
export function cacheOf(progress: Progress): CacheShape | undefined {
  return hasCache(progress) ? cacheShape(progress.cacheUpgrades) : undefined;
}

/** How many of the caches below the L1 you own (sim/memory.ts LOWER_CACHES): 0, 1 (the L2) or 2 (the L2 and L3). */
export function lowerCachesOf(progress: Progress): number {
  return Math.max(0, progress.cacheLevels - 1);
}

/**
 * The memory wall has arrived: at your rated clock, a trip to RAM (without a
 * cache) takes more than one cycle, so loads and stores freeze the pipeline.
 */
export function pastMemoryWall(progress: Progress): boolean {
  return ramCycles(ratedMhz(progress)) > 1;
}

/** The heat model with your cooler fitted. */
export function thermalConfig(progress: Progress): ThermalConfig {
  return { ...THERMAL, ratedRise: COOLING[progress.cooling].ratedRise };
}

/**
 * The hardware your CPU has, as the simulator runs it: the tier's parts, the
 * caches, the rated clock, the deep pipeline. Branches follow the hardware:
 * on a real job of billions of instructions, nobody guesses them by hand;
 * pairs start whenever they can, as a perfect player chords them.
 */
export function hardwareOptions(progress: Progress): PipelineOptions {
  const options = tierOf(progress).options;
  const deep = deepActive(progress);
  return {
    singleCycle: !isPipelined(progress),
    forwarding: options?.forwarding ?? false,
    predictor: options?.predictor,
    superscalar: options?.superscalar ?? false,
    cache: cacheOf(progress),
    lowerCaches: lowerCachesOf(progress),
    mhz: ratedMhz(progress),
    wrongGuessCycles: deep ? DEEP_PIPELINE.wrongGuessCycles : 1,
  };
}

const cpiCache = new Map<string, number>();

/** Cycles per instruction a program takes on this hardware, played perfectly (remembered: the board asks often). */
export function cpiOn(programName: string, options: PipelineOptions): number {
  const key = `${programName}:${JSON.stringify(options)}`;
  const cached = cpiCache.get(key);
  if (cached !== undefined) return cached;
  const run = perfectRun(cpuFor(programByName(programName)), options);
  const cpi = run.cycles / run.instructions;
  cpiCache.set(key, cpi);
  return cpi;
}

/**
 * Cycles per instruction your CPU's hardware gets on a program, played
 * perfectly (the board's estimates), at your rated clock: past the memory
 * wall, waiting for RAM raises it.
 */
export function cpiFor(programName: string, progress: Progress): number {
  return cpiOn(programName, hardwareOptions(progress));
}

/** Seconds per instruction on a typical job (SUM ARRAY) with this hardware: CPI x clock period. */
export function typicalSecondsPerInstruction(progress: Progress): number {
  return cpiFor('SUM ARRAY', progress) / (ratedMhz(progress) * 1e6);
}

/** Seconds your CPU takes for a whole contract: instructions x CPI x clock period. */
export function contractSeconds(contract: Contract, progress: Progress): number {
  return (contract.instructions * cpiFor(contract.program, progress)) / (ratedMhz(progress) * 1e6);
}

/** Too slow to take: your CPU couldn't meet the deadline even playing perfectly. */
export function isLocked(contract: Contract, progress: Progress): boolean {
  return contractSeconds(contract, progress) > contract.deadline;
}

/** Your CPU can make it, but only just: a sloppy run (higher CPI) could be late. */
export function isTight(contract: Contract, progress: Progress): boolean {
  const seconds = contractSeconds(contract, progress);
  return seconds <= contract.deadline && seconds > contract.deadline * TIGHT_SHARE;
}

/** What a contract pays: the full amount, or LATE_PAY_FACTOR of it if the job ran past its deadline. */
export function payFor(contract: Contract, late: boolean): number {
  return late ? Math.round(contract.pay * LATE_PAY_FACTOR) : contract.pay;
}

/** How many items (e.g. bytes) the job works through, from its program's instructions per item. */
export function jobItems(contract: Contract): number {
  const spec = programByName(contract.program);
  const executed = trace(cpuFor(spec)).length;
  return contract.instructions / (executed / spec.elements);
}

/** A copy of `progress` with exactly the CPU parts for `tier` (1-7), on a chip that runs them, for testing (cheat.tier). */
export function withTier(progress: Progress, tier: number): Progress {
  const count = Math.max(0, Math.min(CPU_PARTS.length, Math.round(tier) - 1));
  return fitChip({ ...progress, parts: CPU_PARTS.slice(0, count).map((part) => part.id) });
}

/** A copy of `progress` with every part, the top clock, the best cooler, a new chip and $100,000, for testing. */
export function withEverything(progress: Progress): Progress {
  return {
    ...withTier(progress, CPU_PARTS.length + 1),
    wordBits: CHIPS[CHIPS.length - 1].bits,
    money: 100_000,
    clockLevel: CLOCK.factors.length - 1,
    cooling: COOLING.length - 1,
    cacheLevels: MEMORY_PARTS.length,
    cacheUpgrades: CACHE_UPGRADES.map((upgrade) => upgrade.id),
    overclocking: true,
    deepPipeline: 'on',
    chipMaxDial: THERMAL.maxDial,
  };
}

// ---- the board ----

/** `low` to `high`: t = 0 gives low, t = 1 gives high. */
const lerp = (low: number, high: number, t: number) => low + (high - low) * t;

/** What an hour of job time pays with your CPU (PAY): more as the CPU gets faster, more slowly than its speed. */
export function payPerHour(progress: Progress): number {
  const mips = 1 / typicalSecondsPerInstruction(progress) / 1e6;
  return PAY.perHourAtOneMips * mips ** PAY.exponent;
}

/**
 * A random job of a grade, sized to your CPU: due 2-8 hours after it's
 * taken, and taking the grade's share of that on your hardware played
 * perfectly (on its own program, so a program heavy on memory is a smaller
 * job). Its pay is per hour of that time, with the grade's bonus. It stays
 * on offer a day or two from `progress.day`.
 */
export function newContract(grade: GradeId, id: number, random: Random, progress: Progress, busyClients: ReadonlySet<string> = new Set()): Contract {
  const spec = GRADES.find((g) => g.id === grade) ?? GRADES[0];
  // Each contract gets its own randomly generated program (sim/generator.ts), named after its seed, for a client
  // who isn't already on the board (if one turns up within a few tries). Most are picked to show off a part your
  // CPU uses (sim/showcase.ts); the rest are on data as wide as your chip allows.
  const showcase = showcaseJob(progress, random, busyClients);
  let generated = showcase?.program;
  if (!generated) {
    const bits = dataWidth(progress, random).bits;
    generated = generateProgram(Math.floor(random() * 1_000_000), undefined, bits);
    for (let tries = 0; tries < 10 && busyClients.has(generated.client ?? ''); tries++) {
      generated = generateProgram(Math.floor(random() * 1_000_000), undefined, bits);
    }
  }
  const width = DATA_WIDTHS.find((each) => each.bits === (generated.dataBits ?? 8)) ?? DATA_WIDTHS[0];
  // Due on the half hour.
  const deadline = Math.round(lerp(WORKDAY.deadlineHours[0], WORKDAY.deadlineHours[1], random()) * 2) * 1800;
  const seconds = deadline * lerp(spec.share[0], spec.share[1], random());
  const secondsPerInstruction = cpiFor(generated.name, progress) / (ratedMhz(progress) * 1e6);
  // Three figures, so rounding never moves a job out of its grade.
  const instructions = Number((seconds / secondsPerInstruction).toPrecision(3));
  const pay = Math.max(5, Math.round((payPerHour(progress) * (seconds / 3600) * spec.payBonus * width.pay) / 5) * 5);
  const days = WORKDAY.offerDays[0] + Math.floor(random() * (WORKDAY.offerDays[1] - WORKDAY.offerDays[0] + 1));
  return { id, grade, program: generated.name, instructions, deadline, pay, expires: progress.day + days - 1, ...(showcase ? { shows: showcase.part.id } : {}) };
}

/**
 * How wide a new contract's data is: one of the widths your chip can take
 * (DATA_WIDTHS), the newest most often. An 8-bit chip only gets bytes, and
 * draws nothing for it.
 */
export function dataWidth(progress: Progress, random: Random): (typeof DATA_WIDTHS)[number] {
  const open = DATA_WIDTHS.filter((width) => width.bits <= progress.wordBits);
  if (open.length === 1) return open[0];
  let pick = random() * open.reduce((sum, width) => sum + width.weight, 0);
  return open.find((width) => (pick -= width.weight) < 0) ?? open[open.length - 1];
}

/** Tops the board up to CONTRACTS_PER_GRADE in every grade, sized to your CPU now (not while the tutorial job is on it). */
export function fillBoard(progress: Progress, random: Random): Progress {
  // The tutorial job stands alone until it's done.
  if (progress.board.some(isTutorial)) return progress;
  const board = [...progress.board];
  let { nextId } = progress;
  for (const grade of GRADES) {
    while (board.filter((c) => c.grade === grade.id).length < CONTRACTS_PER_GRADE) {
      const clients = new Set(board.map((c) => programByName(c.program).client ?? ''));
      board.push(newContract(grade.id, nextId++, random, progress, clients));
    }
  }
  return { ...progress, board, nextId };
}

/** The tutorial job (a new game's first): the whole program, played once. */
export function tutorialContract(id: number): Contract {
  const spec = programByName(TUTORIAL_PROGRAM);
  const instructions = trace(cpuFor(spec)).length;
  // It never expires: it waits for the new player.
  return { id, grade: 'easy', program: TUTORIAL_PROGRAM, instructions, ...TUTORIAL_JOB, expires: Number.MAX_SAFE_INTEGER };
}

/** The first job, which the board offers on its own until it's done. */
export function isTutorial(contract: Contract): boolean {
  return contract.program === TUTORIAL_PROGRAM;
}

/** A new game: its board holds only the tutorial job, for TICK's first lesson; the usual jobs come once it's done. */
export function newCampaign(): Progress {
  return { ...NEW_GAME, board: [tutorialContract(1)], nextId: 2 };
}

/** A contract was played: it pays (half if `late`), and a new one takes its place (the board never runs out). */
export function completeContract(progress: Progress, id: number, random: Random, late = false): Progress {
  const contract = progress.board.find((c) => c.id === id);
  if (!contract) return progress;
  const paid = { ...progress, money: progress.money + payFor(contract, late), board: progress.board.filter((c) => c.id !== id) };
  return fillBoard(paid, random);
}

// ---- the shop ----

export type ShopItem = {
  readonly key: string;
  readonly group: 'CPU' | 'CLOCK' | 'MEMORY' | 'COOLING';
  /** The briefing that plays (and must be read) right after buying it. */
  readonly lessonId?: string;
  readonly name: string;
  readonly price: number;
  /** 'buy' if it can be bought now (money permitting). */
  readonly state: 'buy' | 'owned' | 'later' | 'max';
  /** Owned and switchable (the deep pipeline): on or off; Enter switches it (toggleDeep). */
  readonly switchedOn?: boolean;
  readonly about: string;
  readonly apply: (progress: Progress) => Progress;
};

function repairSteps(progress: Progress): number {
  return Math.round((THERMAL.maxDial - progress.chipMaxDial) / THERMAL.damagePerOverheat);
}

/** Everything in the shop, with what buying it does. */
export function shopItems(progress: Progress): ShopItem[] {
  // The CPU group in the order history went: each chip comes after the tier it follows, so a
  // part that needs a wider chip is listed below it. A part waits for the one before it and for its chip.
  const parts = CPU_PARTS.map((part, i) => ({
    order: part.tier,
    item: {
      key: part.id,
      group: 'CPU',
      name: part.name,
      price: part.price,
      state: progress.parts.includes(part.id) ? 'owned' : i === progress.parts.length && progress.wordBits >= part.bits ? 'buy' : 'later',
      lessonId: tierByNumber(part.tier).lessonId,
      about: part.about,
      apply: (p: Progress) => ({ ...p, parts: [...p.parts, part.id] }),
    } satisfies ShopItem,
  }));
  const nextChip = CHIPS.find((chip) => chip.bits > progress.wordBits);
  const chips = CHIPS.slice(1).map((chip) => ({
    order: chip.afterTier + 0.5,
    item: {
      key: `chip${chip.bits}`,
      group: 'CPU',
      name: chip.name,
      price: chip.price,
      state: progress.wordBits >= chip.bits ? 'owned' : chip === nextChip && tierOf(progress).number >= chip.afterTier ? 'buy' : 'later',
      about: chip.about,
      apply: (p: Progress) => ({ ...p, wordBits: chip.bits }),
    } satisfies ShopItem,
  }));
  const items: ShopItem[] = [...parts, ...chips, { order: DEEP_PIPELINE.afterTier + 0.5, item: deepItem(progress) }]
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
  items.push(clockItem(progress));
  items.push({
    key: 'overclock',
    group: 'CLOCK',
    name: 'OVERCLOCKING: UNLOCKS [H]',
    price: OVERCLOCKING_PRICE,
    state: progress.overclocking ? 'owned' : 'buy',
    lessonId: 'overclock',
    about: 'Lets H push the clock past its rating during a song, up to 150%: faster, but the chip heats up. G (slower) is always free.',
    apply: (p) => ({ ...p, overclocking: true }),
  });
  // Each cache level after the one before it: the L1 once RAM is too slow for the clock, each one below it on a chip
  // wide enough. The L1's upgrades come straight after it.
  MEMORY_PARTS.forEach((part, i) => {
    const owned = progress.cacheLevels > i;
    const ready = i === progress.cacheLevels && pastMemoryWall(progress) && progress.wordBits >= part.bits;
    items.push({
      key: part.id,
      group: 'MEMORY',
      name: part.name,
      price: part.price,
      state: owned ? 'owned' : ready ? 'buy' : 'later',
      lessonId: part.lessonId,
      about: owned || ready ? part.about : part.later,
      apply: (p) => ({ ...p, cacheLevels: i + 1 }),
    });
    if (i === 0) for (const upgrade of CACHE_UPGRADES) items.push(cacheUpgradeItem(progress, upgrade));
  });
  COOLING.forEach((cooler, i) => {
    if (i === 0) return;
    items.push({
      key: `cooling${i}`,
      group: 'COOLING',
      name: cooler.name,
      price: cooler.price,
      state: progress.cooling >= i ? 'owned' : i === progress.cooling + 1 ? 'buy' : 'later',
      about: cooler.about,
      apply: (p) => ({ ...p, cooling: i }),
    });
  });
  const steps = repairSteps(progress);
  items.push({
    key: 'repair',
    // Repairs undo heat damage, so they sit with the coolers (and the list fits above the about line).
    group: 'COOLING',
    name: steps > 0 ? `REPAIR CHIP: MAX ${Math.round(progress.chipMaxDial * 100)}% -> ${Math.round(THERMAL.maxDial * 100)}%` : 'REPAIR CHIP',
    price: steps * REPAIR_PRICE_PER_STEP,
    state: steps > 0 ? 'buy' : 'max',
    about: steps > 0 ? 'Overheating wore your chip: it can\'t overclock as far. A repair restores it.' : 'Your chip is in perfect shape.',
    apply: (p) => ({ ...p, chipMaxDial: THERMAL.maxDial }),
  });
  return items;
}

/**
 * An upgrade to the L1: on sale once the L1 is in, in any order. Its line
 * says what the cache becomes.
 */
function cacheUpgradeItem(progress: Progress, upgrade: (typeof CACHE_UPGRADES)[number]): ShopItem {
  const owned = progress.cacheUpgrades.includes(upgrade.id);
  const after = cacheShape([...progress.cacheUpgrades, upgrade.id]);
  return {
    key: upgrade.id,
    group: 'MEMORY',
    name: upgrade.name,
    price: upgrade.price,
    state: owned ? 'owned' : hasCache(progress) ? 'buy' : 'later',
    lessonId: upgrade.lessonId,
    about: hasCache(progress) && !owned ? `${upgrade.about} Your L1 becomes ${cacheWords(after)}.` : hasCache(progress) ? upgrade.about : `An upgrade to the L1 cache. ${upgrade.about}`,
    apply: (p) => ({ ...p, cacheUpgrades: [...p.cacheUpgrades, upgrade.id] }),
  };
}

/**
 * The deep pipeline: on sale once branch guessing and its chip are in; once
 * bought, Enter switches it on and off. Its line weighs it up on a typical
 * job with your hardware: faster clock, dearer wrong guesses.
 */
function deepItem(progress: Progress): ShopItem {
  const ready = tierOf(progress).number >= DEEP_PIPELINE.afterTier && progress.wordBits >= DEEP_PIPELINE.bits;
  const owned = progress.deepPipeline !== 'none';
  const [off, on] = [{ ...progress, deepPipeline: 'off' as const }, { ...progress, deepPipeline: 'on' as const }].map(typicalSecondsPerInstruction);
  const tradeoff =
    `${DEEP_PIPELINE.clockFactor}x the clock, but a wrong guess costs ${DEEP_PIPELINE.wrongGuessCycles} cycles, not 1. ` +
    `A typical job with your hardware: ${formatDuration(off)} per instruction off, ${formatDuration(on)} on.`;
  return {
    key: 'deep',
    group: 'CPU',
    name: DEEP_PIPELINE.name,
    price: DEEP_PIPELINE.price,
    state: owned ? 'owned' : ready ? 'buy' : 'later',
    switchedOn: owned ? progress.deepPipeline === 'on' : undefined,
    lessonId: 'deep',
    about: !ready
      ? 'Ten shorter stages instead of five, for a faster clock. Needs branch guessing and the 32-bit chip.'
      : owned
        ? `[ENTER] SWITCHES IT ${progress.deepPipeline === 'on' ? 'OFF' : 'ON'}. ${tradeoff}`
        : `Ten shorter stages instead of five. ${tradeoff} Switch it on or off any time.`,
    apply: (p) => ({ ...p, deepPipeline: 'on' }),
  };
}

/** The next clock step, up to the chip's top step. */
function clockItem(progress: Progress): ShopItem {
  const level = progress.clockLevel;
  const top = chipOf(progress).maxClock;
  const next = level < top ? level + 1 : undefined;
  const mhzAt = (l: number) => ratedMhzFor({ ...progress, clockLevel: l }, isPipelined(progress));
  const base = { key: 'clock', group: 'CLOCK', apply: (p: Progress) => ({ ...p, clockLevel: Math.min(top, p.clockLevel + 1) }) } as const;
  if (next !== undefined) {
    return {
      ...base,
      name: `FASTER CLOCK: ${formatMhz(mhzAt(next))}`,
      price: CLOCK.prices[level],
      state: 'buy',
      // The first clock that outruns RAM comes with the memory wall's briefing.
      lessonId: !pastMemoryWall(progress) && pastMemoryWall({ ...progress, clockLevel: next }) ? 'memwall' : undefined,
      about: clockAbout(progress, mhzAt(level), mhzAt(next)),
    };
  }
  const last = level >= CLOCK.factors.length - 1;
  return {
    ...base,
    name: last ? 'CLOCK: FASTEST THERE IS' : 'CLOCK: TOP SPEED FOR THIS CHIP',
    price: 0,
    state: 'max',
    about: last
      ? 'Clocks stopped climbing about here: going faster takes more power than a chip can get rid of as heat (the power wall). More speed has to come from doing more each cycle.'
      : "This chip's transistors can't switch any faster. The next chip, with smaller transistors, goes higher.",
  };
}

/**
 * What a clock upgrade does: the beat, and a typical job's time per
 * instruction. Past the memory wall the job barely speeds up, because the
 * time spent waiting for RAM doesn't shrink with the clock.
 */
function clockAbout(progress: Progress, before: number, after: number): string {
  const upgraded = { ...progress, clockLevel: progress.clockLevel + 1 };
  const [now, then] = [typicalSecondsPerInstruction(progress), typicalSecondsPerInstruction(upgraded)];
  const saved = Math.round((1 - then / now) * 100);
  const ram = [ramCycles(before, cacheOf(progress), lowerCachesOf(progress)), ramCycles(after, cacheOf(progress), lowerCachesOf(progress))];
  const wall = ram[1] > 1 ? ` A trip to RAM still takes 60 ns: ${ram[0]} -> ${ram[1]} cycles.` : '';
  return (
    `Rated clock ${formatMhz(before)} -> ${formatMhz(after)}, beat ${Math.round(tempoForClock(before))} -> ${Math.round(tempoForClock(after))} BPM. ` +
    `A typical job: ${formatDuration(now)} -> ${formatDuration(then)} per instruction (${saved}% less).${wall}`
  );
}

/** Buys `key` if it's for sale and affordable; otherwise returns null. */
export function buy(progress: Progress, key: string): Progress | null {
  const item = shopItems(progress).find((i) => i.key === key);
  if (!item || item.state !== 'buy' || progress.money < item.price) return null;
  return item.apply({ ...progress, money: progress.money - item.price, bought: [...progress.bought.filter((each) => each !== key), key] });
}
