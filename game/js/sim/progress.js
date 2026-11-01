// The player's progress: money, the CPU chip (its word size) and parts, clock,
// memory and cooling upgrades, chip wear, and the contract board. Pure functions over a plain object, so the
// rules are testable; game/src/save.ts stores it.
import { BASE_MHZ, CHIPS, CLOCK, CONTRACTS_PER_SECTION, COOLING, CPU_PARTS, LATE_PAY_FACTOR, MEMORY_PARTS, OVERCLOCKING_PRICE, REPAIR_PRICE_PER_STEP, SECTIONS, TIGHT_SHARE, TUTORIAL_JOB, } from '../data/economy.js';
import { programByName, TUTORIAL_PROGRAM } from '../data/programs.js';
import { generateProgram } from './generator.js';
import { formatDuration, formatMhz } from '../format.js';
import { tierByNumber } from '../data/tiers.js';
import { assemble } from './assembler.js';
import { Cpu, trace } from './cpu.js';
import { ramCycles } from './memory.js';
import { perfectRun } from './pipeline.js';
import { THERMAL } from './thermal.js';
import { tempoForClock } from '../rhythm/tempo.js';
export const NEW_GAME = {
    money: 0,
    wordBits: 8,
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
// ---- the CPU you own ----
export function tierOf(progress) {
    return tierByNumber(1 + progress.parts.length);
}
/** The chip `bits` wide, if there is one (a cheat, an edited save). */
export function chipByBits(bits) {
    return CHIPS.find((chip) => chip.bits === bits);
}
/** The chip you own. */
export function chipOf(progress) {
    return chipByBits(progress.wordBits) ?? CHIPS[0];
}
/** A word size the way every screen writes it: "16-BIT". */
export function bitsName(bits) {
    return `${bits}-BIT`;
}
/** Your CPU in words, as the screens and the boot show it: "16-BIT, TIER 2 PIPELINE". */
export function cpuName(progress) {
    const tier = tierOf(progress);
    return `${bitsName(progress.wordBits)}, TIER ${tier.number} ${tier.name}`;
}
/** Your CPU and its rated clock: "16-BIT, TIER 2 PIPELINE AT 16 MHz". */
export function cpuLine(progress) {
    return `${cpuName(progress)} AT ${formatMhz(ratedMhz(progress))}`;
}
/** The narrowest chip that runs these CPU parts and this clock step. */
export function chipNeeded(progress) {
    const parts = CPU_PARTS.filter((part) => progress.parts.includes(part.id));
    const bits = Math.max(8, ...parts.map((part) => part.bits));
    return (CHIPS.find((chip) => chip.bits >= bits && chip.maxClock >= progress.clockLevel) ?? CHIPS[CHIPS.length - 1]).bits;
}
/** `progress` on a chip wide enough for its parts and clock (an old save, a cheat). */
export function fitChip(progress) {
    const bits = chipNeeded(progress);
    return bits > progress.wordBits ? { ...progress, wordBits: bits } : progress;
}
/**
 * A copy of `progress` on the `bits` chip, for testing: the CPU parts it
 * can't run are taken off (from the last bought), and the clock comes down to its top step.
 */
export function withWordBits(progress, bits) {
    const chip = chipByBits(bits) ?? CHIPS[0];
    // Parts are bought in order and each needs a chip at least as wide as the last one's, so this keeps the first few.
    const parts = progress.parts.filter((id) => (CPU_PARTS.find((part) => part.id === id)?.bits ?? 8) <= chip.bits);
    return { ...progress, wordBits: chip.bits, parts, clockLevel: Math.min(progress.clockLevel, chip.maxClock) };
}
export function isPipelined(progress) {
    return progress.parts.length > 0;
}
/** Rated clock in MHz: the base clock (single-cycle or pipelined) times the clock upgrades. */
export function ratedMhz(progress) {
    return ratedMhzFor(progress, isPipelined(progress));
}
/** The rated clock a pipelined or single-cycle CPU would have with these clock upgrades. */
export function ratedMhzFor(progress, pipelined) {
    return (pipelined ? BASE_MHZ.pipelined : BASE_MHZ.singleCycle) * CLOCK.factors[progress.clockLevel];
}
/** Owns the L1 cache. */
export function hasCache(progress) {
    return progress.cacheLevels > 0;
}
/**
 * The memory wall has arrived: at your rated clock, a trip to RAM (without a
 * cache) takes more than one cycle, so loads and stores freeze the pipeline.
 */
export function pastMemoryWall(progress) {
    return ramCycles(ratedMhz(progress)) > 1;
}
/** The heat model with your cooler fitted. */
export function thermalConfig(progress) {
    return { ...THERMAL, ratedRise: COOLING[progress.cooling].ratedRise };
}
const cpiCache = new Map();
/**
 * Cycles per instruction your CPU's hardware gets on a program, played
 * perfectly (the board's estimates), at your rated clock: past the memory
 * wall, waiting for RAM raises it. Branches follow the hardware: on a real job
 * of billions of instructions, nobody guesses them by hand.
 */
export function cpiFor(programName, progress) {
    const tier = tierOf(progress);
    const key = `${programName}:${tier.number}:${progress.clockLevel}:${progress.cacheLevels}`;
    const cached = cpiCache.get(key);
    if (cached !== undefined)
        return cached;
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
function typicalSecondsPerInstruction(progress) {
    return cpiFor('SUM ARRAY', progress) / (ratedMhz(progress) * 1e6);
}
/** Seconds your CPU takes for a whole contract: instructions x CPI x clock period. */
export function contractSeconds(contract, progress) {
    return (contract.instructions * cpiFor(contract.program, progress)) / (ratedMhz(progress) * 1e6);
}
/** Too slow to take: your CPU couldn't meet the deadline even playing perfectly. */
export function isLocked(contract, progress) {
    return contractSeconds(contract, progress) > contract.deadline;
}
/** Your CPU can make it, but only just: a sloppy run (higher CPI) could be late. */
export function isTight(contract, progress) {
    const seconds = contractSeconds(contract, progress);
    return seconds <= contract.deadline && seconds > contract.deadline * TIGHT_SHARE;
}
/** What a contract pays: the full amount, or LATE_PAY_FACTOR of it if the job ran past its deadline. */
export function payFor(contract, late) {
    return late ? Math.round(contract.pay * LATE_PAY_FACTOR) : contract.pay;
}
/** How many items (e.g. bytes) the job works through, from its program's instructions per item. */
export function jobItems(contract) {
    const spec = programByName(contract.program);
    const executed = trace(new Cpu(assemble(spec.source, 8), 8, spec.memory)).length;
    return contract.instructions / (executed / spec.elements);
}
/** A copy of `progress` with exactly the CPU parts for `tier` (1-6), on a chip that runs them, for testing (cheat.tier). */
export function withTier(progress, tier) {
    const count = Math.max(0, Math.min(CPU_PARTS.length, Math.round(tier) - 1));
    return fitChip({ ...progress, parts: CPU_PARTS.slice(0, count).map((part) => part.id) });
}
/** A copy of `progress` with every part, the top clock, the best cooler, a new chip and $100,000, for testing. */
export function withEverything(progress) {
    return {
        ...withTier(progress, CPU_PARTS.length + 1),
        wordBits: CHIPS[CHIPS.length - 1].bits,
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
const logLerp = (low, high, t) => low * (high / low) ** t;
/**
 * A random job for a section: size and deadline log-uniform in their ranges.
 * Pay rises with the size and with the urgency (a shorter deadline).
 */
export function newContract(section, id, random, busyClients = new Set()) {
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
/** Tops the board up to CONTRACTS_PER_SECTION in every section (not while the tutorial job is on it). */
export function fillBoard(progress, random) {
    // The tutorial job stands alone until it's done.
    if (progress.board.some(isTutorial))
        return progress;
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
/** The tutorial job (a new game's first): the whole program, played once. */
export function tutorialContract(id) {
    const spec = programByName(TUTORIAL_PROGRAM);
    const instructions = trace(new Cpu(assemble(spec.source, 8), 8, spec.memory)).length;
    return { id, section: 'starter', program: TUTORIAL_PROGRAM, instructions, ...TUTORIAL_JOB };
}
/** The first job, which the board offers on its own until it's done. */
export function isTutorial(contract) {
    return contract.program === TUTORIAL_PROGRAM;
}
/** A new game: its board holds only the tutorial job, for TICK's first lesson; the usual jobs come once it's done. */
export function newCampaign() {
    return { ...NEW_GAME, board: [tutorialContract(1)], nextId: 2 };
}
/** A contract was played: it pays (half if `late`), and a new one takes its place (the board never runs out). */
export function completeContract(progress, id, random, late = false) {
    const contract = progress.board.find((c) => c.id === id);
    if (!contract)
        return progress;
    const paid = { ...progress, money: progress.money + payFor(contract, late), board: progress.board.filter((c) => c.id !== id) };
    return fillBoard(paid, random);
}
function repairSteps(progress) {
    return Math.round((THERMAL.maxDial - progress.chipMaxDial) / THERMAL.damagePerOverheat);
}
/** Everything in the shop, with what buying it does. */
export function shopItems(progress) {
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
            apply: (p) => ({ ...p, parts: [...p.parts, part.id] }),
        },
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
            apply: (p) => ({ ...p, wordBits: chip.bits }),
        },
    }));
    const items = [...parts, ...chips].sort((a, b) => a.order - b.order).map(({ item }) => item);
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
        if (i === 0)
            return;
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
/** The next clock step, up to the chip's top step. */
function clockItem(progress) {
    const level = progress.clockLevel;
    const top = chipOf(progress).maxClock;
    const next = level < top ? level + 1 : undefined;
    const mhzAt = (l) => (isPipelined(progress) ? BASE_MHZ.pipelined : BASE_MHZ.singleCycle) * CLOCK.factors[l];
    const base = { key: 'clock', group: 'CLOCK', apply: (p) => ({ ...p, clockLevel: Math.min(top, p.clockLevel + 1) }) };
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
function clockAbout(progress, before, after) {
    const upgraded = { ...progress, clockLevel: progress.clockLevel + 1 };
    const [now, then] = [typicalSecondsPerInstruction(progress), typicalSecondsPerInstruction(upgraded)];
    const saved = Math.round((1 - then / now) * 100);
    const ram = [ramCycles(before, hasCache(progress)), ramCycles(after, hasCache(progress))];
    const wall = ram[1] > 1 ? ` A trip to RAM still takes 60 ns: ${ram[0]} -> ${ram[1]} cycles.` : '';
    return (`Rated clock ${formatMhz(before)} -> ${formatMhz(after)}, beat ${Math.round(tempoForClock(before))} -> ${Math.round(tempoForClock(after))} BPM. ` +
        `A typical job: ${formatDuration(now)} -> ${formatDuration(then)} per instruction (${saved}% less).${wall}`);
}
/** Buys `key` if it's for sale and affordable; otherwise returns null. */
export function buy(progress, key) {
    const item = shopItems(progress).find((i) => i.key === key);
    if (!item || item.state !== 'buy' || progress.money < item.price)
        return null;
    return item.apply({ ...progress, money: progress.money - item.price });
}
//# sourceMappingURL=progress.js.map