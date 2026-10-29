// The player's progress: money, CPU parts, clock and cooling upgrades, chip
// wear, and the contract board. Pure functions over a plain object, so the
// rules are testable; game/src/save.ts stores it.

import {
  BASE_MHZ,
  CLOCK,
  CONTRACT_PROGRAMS,
  CONTRACTS_PER_SECTION,
  COOLING,
  CPU_PARTS,
  OVERCLOCKING_PRICE,
  REPAIR_PRICE_PER_STEP,
  SECTIONS,
  TIME_LIMIT_SECONDS,
  type PartId,
  type SectionId,
} from '../data/economy.ts';
import { programByName } from '../data/programs.ts';
import { formatMhz } from '../format.ts';
import { tierByNumber, type Tier } from '../data/tiers.ts';
import { assemble } from './assembler.ts';
import { Cpu, trace } from './cpu.ts';
import { perfectRun } from './pipeline.ts';
import { THERMAL, type ThermalConfig } from './thermal.ts';

/** A job on the board. The song plays the first part of it; the rest runs at the same pace. */
export type Contract = {
  readonly id: number;
  readonly section: SectionId;
  readonly program: string;
  /** Instructions the whole job executes. */
  readonly instructions: number;
  readonly pay: number;
};

export type Progress = {
  readonly money: number;
  /** CPU parts owned, in the order bought (each is the next tier). */
  readonly parts: readonly PartId[];
  /** Index into CLOCK.factors. */
  readonly clockLevel: number;
  /** Index into COOLING. */
  readonly cooling: number;
  /** Bought the overclocking unlock: H can push the clock past its rating. */
  readonly overclocking: boolean;
  /** Maximum clock dial: overheating lowers it until repaired. */
  readonly chipMaxDial: number;
  readonly board: readonly Contract[];
  readonly nextId: number;
};

export const NEW_GAME: Progress = {
  money: 0,
  parts: [],
  clockLevel: 0,
  cooling: 0,
  overclocking: false,
  chipMaxDial: THERMAL.maxDial,
  board: [],
  nextId: 1,
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

/** The heat model with your cooler fitted. */
export function thermalConfig(progress: Progress): ThermalConfig {
  return { ...THERMAL, ratedRise: COOLING[progress.cooling].ratedRise };
}

const cpiCache = new Map<string, number>();

/**
 * Cycles per instruction your CPU's hardware gets on a program, played
 * perfectly (the board's estimates). Branches follow the hardware: on a real
 * job of billions of instructions, nobody guesses them by hand.
 */
export function cpiFor(programName: string, progress: Progress): number {
  const tier = tierOf(progress);
  const key = `${programName}:${tier.number}`;
  const cached = cpiCache.get(key);
  if (cached !== undefined) return cached;
  const spec = programByName(programName);
  const cpu = new Cpu(assemble(spec.source, 8), 8, spec.memory);
  let cpi = 1;
  if (isPipelined(progress)) {
    const run = perfectRun(cpu, { forwarding: tier.options?.forwarding ?? false, predictor: tier.options?.predictor });
    cpi = run.cycle / run.instructions;
  }
  cpiCache.set(key, cpi);
  return cpi;
}

/** Seconds your CPU takes for a whole contract: instructions x CPI x clock period. */
export function contractSeconds(contract: Contract, progress: Progress): number {
  return (contract.instructions * cpiFor(contract.program, progress)) / (ratedMhz(progress) * 1e6);
}

/** Too slow to take: your CPU wouldn't finish within the time limit. */
export function isLocked(contract: Contract, progress: Progress): boolean {
  return contractSeconds(contract, progress) > TIME_LIMIT_SECONDS;
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

// ---- the board ----

/** A random job for a section: size log-uniform in its range, pay rising with size. */
export function newContract(section: SectionId, id: number, random: Random): Contract {
  const spec = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const t = random();
  const [low, high] = spec.instructions;
  const instructions = Number((low * (high / low) ** t).toPrecision(2));
  const pay = Math.round((spec.pay[0] + (spec.pay[1] - spec.pay[0]) * t) / 5) * 5;
  const program = CONTRACT_PROGRAMS[Math.floor(random() * CONTRACT_PROGRAMS.length)];
  return { id, section, program, instructions, pay };
}

/** Tops the board up to CONTRACTS_PER_SECTION in every section. */
export function fillBoard(progress: Progress, random: Random): Progress {
  const board = [...progress.board];
  let { nextId } = progress;
  for (const section of SECTIONS) {
    while (board.filter((c) => c.section === section.id).length < CONTRACTS_PER_SECTION) {
      board.push(newContract(section.id, nextId++, random));
    }
  }
  return { ...progress, board, nextId };
}

/** A contract was played: it pays, and a new one takes its place (the board never runs out). */
export function completeContract(progress: Progress, id: number, random: Random): Progress {
  const contract = progress.board.find((c) => c.id === id);
  if (!contract) return progress;
  const paid = { ...progress, money: progress.money + contract.pay, board: progress.board.filter((c) => c.id !== id) };
  return fillBoard(paid, random);
}

// ---- the shop ----

export type ShopItem = {
  readonly key: string;
  readonly group: 'CPU' | 'CLOCK' | 'COOLING' | 'REPAIR';
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
    about:
      next === undefined
        ? 'Your clock is fully upgraded.'
        : `Rated clock ${formatMhz(mhzAt(level))} -> ${formatMhz(mhzAt(next))}: a shorter clock period, so every contract takes less time. The song's tempo stays the same.`,
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

/** Buys `key` if it's for sale and affordable; otherwise returns null. */
export function buy(progress: Progress, key: string): Progress | null {
  const item = shopItems(progress).find((i) => i.key === key);
  if (!item || item.state !== 'buy' || progress.money < item.price) return null;
  return item.apply({ ...progress, money: progress.money - item.price });
}
