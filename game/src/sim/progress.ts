// The player's progress: money, CPU parts, clock, memory and cooling
// upgrades, chip wear, and the contract board. Pure functions over a plain object, so the
// rules are testable; game/src/save.ts stores it.

import {
  BASE_MHZ,
  CLOCK,
  CONTRACTS_PER_SECTION,
  COOLING,
  CPU_PARTS,
  LATE_PAY_FACTOR,
  MEMORY_PARTS,
  OVERCLOCKING_PRICE,
  REPAIR_PRICE_PER_STEP,
  SECTIONS,
  TIGHT_SHARE,
  type PartId,
  type SectionId,
} from '../data/economy.ts';
import { programByName } from '../data/programs.ts';
import { generateProgram } from './generator.ts';
import { formatDuration, formatMhz } from '../format.ts';
import { tierByNumber, type Tier } from '../data/tiers.ts';
import { assemble } from './assembler.ts';
import { Cpu, trace } from './cpu.ts';
import { ramCycles } from './memory.ts';
import { perfectRun } from './pipeline.ts';
import { THERMAL, type ThermalConfig } from './thermal.ts';
import { tempoForClock } from '../rhythm/tempo.ts';

/** A job on the board. The song plays the first part of it; the rest runs at the same pace. */
export type Contract = {
  readonly id: number;
  readonly section: SectionId;
  readonly program: string;
  /** Instructions the whole job executes. */
  readonly instructions: number;
  /** How soon it's needed, in seconds of game time from when it's taken. */
  readonly deadline: number;
  readonly pay: number;
};

export type Progress = {
  readonly money: number;
  /** CPU parts owned, in the order bought (each is the next tier). */
  readonly parts: readonly PartId[];
  /** Index into CLOCK.factors. */
  readonly clockLevel: number;
  /** Cache levels owned (MEMORY_PARTS): 0 = none, 1 = L1. */
  readonly cacheLevels: number;
  /** Index into COOLING. */
  readonly cooling: number;
  /** Bought the overclocking unlock: H can push the clock past its rating. */
  readonly overclocking: boolean;
  /** Maximum clock dial: overheating lowers it until repaired. */
  readonly chipMaxDial: number;
  readonly board: readonly Contract[];
  readonly nextId: number;
  /** Lesson ids whose briefing this player has finished: a new campaign starts with none. */
  readonly seenLessons: readonly string[];
};

export const NEW_GAME: Progress = {
  money: 0,
  parts: [],
  clockLevel: 0,
  cacheLevels: 0,
  cooling: 0,
  overclocking: false,
  chipMaxDial: THERMAL.maxDial,
  board: [],
  nextId: 1,
  seenLessons: [],
};

/** A random number in [0, 1); injectable so tests are repeatable. */
export type Random = () => number;

// ---- the CPU you own ----

export function tierOf(progress: Progress): Tier {
  return tierByNumber(1 + progress.parts.length);
}

export function isPipelined(progress: Progress): boolean {
  return progress.parts.length > 0;
}

/** Rated clock in MHz: the base clock (single-cycle or pipelined) times the clock upgrades. */
export function ratedMhz(progress: Progress): number {
  return ratedMhzFor(progress, isPipelined(progress));
}

/** The rated clock a pipelined or single-cycle CPU would have with these clock upgrades. */
export function ratedMhzFor(progress: Progress, pipelined: boolean): number {
  return (pipelined ? BASE_MHZ.pipelined : BASE_MHZ.singleCycle) * CLOCK.factors[progress.clockLevel];
}

/** Owns the L1 cache. */
export function hasCache(progress: Progress): boolean {
  return progress.cacheLevels > 0;
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

const cpiCache = new Map<string, number>();

/**
 * Cycles per instruction your CPU's hardware gets on a program, played
 * perfectly (the board's estimates), at your rated clock: past the memory
 * wall, waiting for RAM raises it. Branches follow the hardware: on a real job
 * of billions of instructions, nobody guesses them by hand.
 */
export function cpiFor(programName: string, progress: Progress): number {
  const tier = tierOf(progress);
  const key = `${programName}:${tier.number}:${progress.clockLevel}:${progress.cacheLevels}`;
  const cached = cpiCache.get(key);
  if (cached !== undefined) return cached;
  const spec = programByName(programName);
  const cpu = new Cpu(assemble(spec.source, 8), 8, spec.memory);
  const run = perfectRun(cpu, {
    singleCycle: !isPipelined(progress),
    forwarding: tier.options?.forwarding ?? false,
    predictor: tier.options?.predictor,
    cache: hasCache(progress),
    mhz: ratedMhz(progress),
  });
  const cpi = run.cycles / run.instructions;
  cpiCache.set(key, cpi);
  return cpi;
}

/** Seconds per instruction on a typical job (SUM ARRAY) with this hardware: CPI x clock period. */
function typicalSecondsPerInstruction(progress: Progress): number {
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
  const executed = trace(new Cpu(assemble(spec.source, 8), 8, spec.memory)).length;
  return contract.instructions / (executed / spec.elements);
}

/** A copy of `progress` with exactly the CPU parts for `tier` (1-6), for testing (cheat.tier). */
export function withTier(progress: Progress, tier: number): Progress {
  const count = Math.max(0, Math.min(CPU_PARTS.length, Math.round(tier) - 1));
  return { ...progress, parts: CPU_PARTS.slice(0, count).map((part) => part.id) };
}

/** A copy of `progress` with every part, the top clock, the best cooler, a new chip and $100,000, for testing. */
export function withEverything(progress: Progress): Progress {
  return {
    ...withTier(progress, CPU_PARTS.length + 1),
    money: 100_000,
    clockLevel: CLOCK.factors.length - 1,
    cooling: COOLING.length - 1,
    cacheLevels: MEMORY_PARTS.length,
    overclocking: true,
    chipMaxDial: THERMAL.maxDial,
  };
}

// ---- the board ----

/** `low` to `high` on a log scale: t = 0 gives low, t = 1 gives high. */
const logLerp = (low: number, high: number, t: number) => low * (high / low) ** t;

/**
 * A random job for a section: size and deadline log-uniform in their ranges.
 * Pay rises with the size and with the urgency (a shorter deadline).
 */
export function newContract(section: SectionId, id: number, random: Random, busyClients: ReadonlySet<string> = new Set()): Contract {
  const spec = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const size = random();
  const urgency = random();
  const instructions = Number(logLerp(spec.instructions[0], spec.instructions[1], size).toPrecision(2));
  const deadline = Number(logLerp(spec.deadline[1], spec.deadline[0], urgency).toPrecision(2));
  const worth = 0.6 * size + 0.4 * urgency;
  const pay = Math.round((spec.pay[0] + (spec.pay[1] - spec.pay[0]) * worth) / 5) * 5;
  // Each contract gets its own randomly generated program (sim/generator.ts), named after its seed,
  // for a client who isn't already on the board (if one turns up within a few tries).
  let generated = generateProgram(Math.floor(random() * 1_000_000));
  for (let tries = 0; tries < 10 && busyClients.has(generated.client ?? ''); tries++) {
    generated = generateProgram(Math.floor(random() * 1_000_000));
  }
  return { id, section, program: generated.name, instructions, deadline, pay };
}

/** Tops the board up to CONTRACTS_PER_SECTION in every section. */
export function fillBoard(progress: Progress, random: Random): Progress {
  const board = [...progress.board];
  let { nextId } = progress;
  for (const section of SECTIONS) {
    while (board.filter((c) => c.section === section.id).length < CONTRACTS_PER_SECTION) {
      const clients = new Set(board.map((c) => programByName(c.program).client ?? ''));
      board.push(newContract(section.id, nextId++, random, clients));
    }
  }
  return { ...progress, board, nextId };
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
  readonly group: 'CPU' | 'CLOCK' | 'MEMORY' | 'COOLING' | 'REPAIR';
  /** The briefing that plays (and must be read) right after buying it. */
  readonly lessonId?: string;
  readonly name: string;
  readonly price: number;
  /** 'buy' if it can be bought now (money permitting). */
  readonly state: 'buy' | 'owned' | 'later' | 'max';
  readonly about: string;
  readonly apply: (progress: Progress) => Progress;
};

function repairSteps(progress: Progress): number {
  return Math.round((THERMAL.maxDial - progress.chipMaxDial) / THERMAL.damagePerOverheat);
}

/** Everything in the shop, with what buying it does. */
export function shopItems(progress: Progress): ShopItem[] {
  const items: ShopItem[] = CPU_PARTS.map((part, i) => ({
    key: part.id,
    group: 'CPU',
    name: part.name,
    price: part.price,
    state: progress.parts.includes(part.id) ? 'owned' : i === progress.parts.length ? 'buy' : 'later',
    lessonId: tierByNumber(part.tier).lessonId,
    about: part.about,
    apply: (p) => ({ ...p, parts: [...p.parts, part.id] }),
  }));
  const level = progress.clockLevel;
  const next = level + 1 < CLOCK.factors.length ? level + 1 : undefined;
  const mhzAt = (l: number) => (isPipelined(progress) ? BASE_MHZ.pipelined : BASE_MHZ.singleCycle) * CLOCK.factors[l];
  items.push({
    key: 'clock',
    group: 'CLOCK',
    name: next === undefined ? 'CLOCK: FASTEST THERE IS' : `FASTER CLOCK: ${formatMhz(mhzAt(next))}`,
    price: next === undefined ? 0 : CLOCK.prices[level],
    state: next === undefined ? 'max' : 'buy',
    // The first clock that outruns RAM comes with the memory wall's briefing.
    lessonId: next !== undefined && !pastMemoryWall(progress) && pastMemoryWall({ ...progress, clockLevel: next }) ? 'memwall' : undefined,
    about: next === undefined ? 'Your clock is fully upgraded.' : clockAbout(progress, mhzAt(level), mhzAt(next)),
    apply: (p) => ({ ...p, clockLevel: Math.min(CLOCK.factors.length - 1, p.clockLevel + 1) }),
  });
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
  MEMORY_PARTS.forEach((part, i) => {
    const owned = progress.cacheLevels > i;
    const ready = i === progress.cacheLevels && pastMemoryWall(progress);
    items.push({
      key: part.id,
      group: 'MEMORY',
      name: part.name,
      price: part.price,
      state: owned ? 'owned' : ready ? 'buy' : 'later',
      lessonId: 'cache',
      about: owned || ready ? part.about : 'RAM keeps up with your clock for now: a trip fits in one cycle. Once a faster clock makes loads wait for RAM, this goes on sale.',
      apply: (p) => ({ ...p, cacheLevels: i + 1 }),
    });
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
    group: 'REPAIR',
    name: steps > 0 ? `REPAIR CHIP: MAX ${Math.round(progress.chipMaxDial * 100)}% -> ${Math.round(THERMAL.maxDial * 100)}%` : 'REPAIR CHIP',
    price: steps * REPAIR_PRICE_PER_STEP,
    state: steps > 0 ? 'buy' : 'max',
    about: steps > 0 ? 'Overheating wore your chip: it can\'t overclock as far. A repair restores it.' : 'Your chip is in perfect shape.',
    apply: (p) => ({ ...p, chipMaxDial: THERMAL.maxDial }),
  });
  return items;
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
  const ram = [ramCycles(before, hasCache(progress)), ramCycles(after, hasCache(progress))];
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
  return item.apply({ ...progress, money: progress.money - item.price });
}
