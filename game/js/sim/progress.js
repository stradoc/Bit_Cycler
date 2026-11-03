// The player's progress: money, the CPU chip (its word size) and parts, clock,
// memory and cooling upgrades, chip wear, and the contract board. Pure functions over a plain object, so the
// rules are testable; game/src/save.ts stores it.
import { BASE_MHZ, CACHE_UPGRADES, CHIPS, DATA_WIDTHS, CLOCK, CONTRACTS_PER_GRADE, COOLING, CPU_PARTS, DEEP_PIPELINE, LATE_PAY_FACTOR, MEMORY_PARTS, OVERCLOCKING_PRICE, REPAIR_PRICE_PER_STEP, GRADES, PAY, TIGHT_SHARE, TUTORIAL_JOB, WORKDAY, } from '../data/economy.js';
import { programByName, TUTORIAL_PROGRAM } from '../data/programs.js';
import { generateProgram } from './generator.js';
import { showcaseJob } from './showcase.js';
import { formatDuration, formatMhz } from '../format.js';
import { tierByNumber } from '../data/tiers.js';
import { cpuFor, trace } from './cpu.js';
import { cacheShape, cacheWords, ramCycles } from './memory.js';
import { perfectRun } from './pipeline.js';
import { THERMAL } from './thermal.js';
import { tempoForClock } from '../rhythm/tempo.js';
export const NEW_GAME = {
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
export function hasSeen(progress, id) {
    return progress.seenLessons.includes(id);
}
/** Lessons or tours marked seen (each once). */
export function withSeen(progress, ...ids) {
    return { ...progress, seenLessons: [...new Set([...progress.seenLessons, ...ids])] };
}
/** A practice tip marked given (each once). */
export function withTipSeen(progress, id) {
    return progress.seenTips.includes(id) ? progress : { ...progress, seenTips: [...progress.seenTips, id] };
}
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
    return `${bitsName(progress.wordBits)}, TIER ${tier.number} ${tier.name}${deepActive(progress) ? ', DEEP PIPELINE' : ''}`;
}
/**
 * The deep pipeline is in use: bought, switched on, and on a CPU that runs
 * it (branch guessing and its chip; a developer-screen tier or chip below
 * that leaves it bought but idle).
 */
export function deepActive(progress) {
    return progress.deepPipeline === 'on' && tierOf(progress).number >= DEEP_PIPELINE.afterTier && progress.wordBits >= DEEP_PIPELINE.bits;
}
/** The deep pipeline switched the other way (bought: on and off; not bought: unchanged). */
export function toggleDeep(progress) {
    if (progress.deepPipeline === 'none')
        return progress;
    return { ...progress, deepPipeline: progress.deepPipeline === 'on' ? 'off' : 'on' };
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
/**
 * The rated clock a pipelined or single-cycle CPU would have with these
 * clock upgrades, and the deep pipeline if it's in use. The deep pipeline's
 * faster clock stops at the power wall (the top clock step), as real ones
 * did: there it keeps its dearer wrong guesses and gains nothing.
 */
export function ratedMhzFor(progress, pipelined, deep = pipelined && deepActive(progress)) {
    const clock = (pipelined ? BASE_MHZ.pipelined : BASE_MHZ.singleCycle) * CLOCK.factors[progress.clockLevel];
    return deep ? Math.min(clock * DEEP_PIPELINE.clockFactor, BASE_MHZ.pipelined * CLOCK.factors[CLOCK.factors.length - 1]) : clock;
}
/** Owns the L1 cache. */
export function hasCache(progress) {
    return progress.cacheLevels > 0;
}
/** The L1 cache you own, with its upgrades, or undefined without one. */
export function cacheOf(progress) {
    return hasCache(progress) ? cacheShape(progress.cacheUpgrades) : undefined;
}
/** How many of the caches below the L1 you own (sim/memory.ts LOWER_CACHES): 0, 1 (the L2) or 2 (the L2 and L3). */
export function lowerCachesOf(progress) {
    return Math.max(0, progress.cacheLevels - 1);
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
/**
 * The hardware your CPU has, as the simulator runs it: the tier's parts, the
 * caches, the rated clock, the deep pipeline. Branches follow the hardware:
 * on a real job of billions of instructions, nobody guesses them by hand;
 * pairs start whenever they can, as a perfect player chords them.
 */
export function hardwareOptions(progress) {
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
const cpiCache = new Map();
/** Cycles per instruction a program takes on this hardware, played perfectly (remembered: the board asks often). */
export function cpiOn(programName, options) {
    const key = `${programName}:${JSON.stringify(options)}`;
    const cached = cpiCache.get(key);
    if (cached !== undefined)
        return cached;
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
export function cpiFor(programName, progress) {
    return cpiOn(programName, hardwareOptions(progress));
}
/** Seconds per instruction on a typical job (SUM ARRAY) with this hardware: CPI x clock period. */
export function typicalSecondsPerInstruction(progress) {
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
    const executed = trace(cpuFor(spec)).length;
    return contract.instructions / (executed / spec.elements);
}
/** A copy of `progress` with exactly the CPU parts for `tier` (1-7), on a chip that runs them, for testing (cheat.tier). */
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
        cacheUpgrades: CACHE_UPGRADES.map((upgrade) => upgrade.id),
        overclocking: true,
        deepPipeline: 'on',
        chipMaxDial: THERMAL.maxDial,
    };
}
// ---- the board ----
/** `low` to `high`: t = 0 gives low, t = 1 gives high. */
const lerp = (low, high, t) => low + (high - low) * t;
/** What an hour of job time pays with your CPU (PAY): more as the CPU gets faster, more slowly than its speed. */
export function payPerHour(progress) {
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
export function newContract(grade, id, random, progress, busyClients = new Set()) {
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
export function dataWidth(progress, random) {
    const open = DATA_WIDTHS.filter((width) => width.bits <= progress.wordBits);
    if (open.length === 1)
        return open[0];
    let pick = random() * open.reduce((sum, width) => sum + width.weight, 0);
    return open.find((width) => (pick -= width.weight) < 0) ?? open[open.length - 1];
}
/** Tops the board up to CONTRACTS_PER_GRADE in every grade, sized to your CPU now (not while the tutorial job is on it). */
export function fillBoard(progress, random) {
    // The tutorial job stands alone until it's done.
    if (progress.board.some(isTutorial))
        return progress;
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
export function tutorialContract(id) {
    const spec = programByName(TUTORIAL_PROGRAM);
    const instructions = trace(cpuFor(spec)).length;
    // It never expires: it waits for the new player.
    return { id, grade: 'easy', program: TUTORIAL_PROGRAM, instructions, ...TUTORIAL_JOB, expires: Number.MAX_SAFE_INTEGER };
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
    const items = [...parts, ...chips, { order: DEEP_PIPELINE.afterTier + 0.5, item: deepItem(progress) }]
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
        if (i === 0)
            for (const upgrade of CACHE_UPGRADES)
                items.push(cacheUpgradeItem(progress, upgrade));
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
/**
 * An upgrade to the L1: on sale once the L1 is in, in any order. Its line
 * says what the cache becomes.
 */
function cacheUpgradeItem(progress, upgrade) {
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
function deepItem(progress) {
    const ready = tierOf(progress).number >= DEEP_PIPELINE.afterTier && progress.wordBits >= DEEP_PIPELINE.bits;
    const owned = progress.deepPipeline !== 'none';
    const [off, on] = [{ ...progress, deepPipeline: 'off' }, { ...progress, deepPipeline: 'on' }].map(typicalSecondsPerInstruction);
    const tradeoff = `${DEEP_PIPELINE.clockFactor}x the clock, but a wrong guess costs ${DEEP_PIPELINE.wrongGuessCycles} cycles, not 1. ` +
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
function clockItem(progress) {
    const level = progress.clockLevel;
    const top = chipOf(progress).maxClock;
    const next = level < top ? level + 1 : undefined;
    const mhzAt = (l) => ratedMhzFor({ ...progress, clockLevel: l }, isPipelined(progress));
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
    const ram = [ramCycles(before, cacheOf(progress), lowerCachesOf(progress)), ramCycles(after, cacheOf(progress), lowerCachesOf(progress))];
    const wall = ram[1] > 1 ? ` A trip to RAM still takes 60 ns: ${ram[0]} -> ${ram[1]} cycles.` : '';
    return (`Rated clock ${formatMhz(before)} -> ${formatMhz(after)}, beat ${Math.round(tempoForClock(before))} -> ${Math.round(tempoForClock(after))} BPM. ` +
        `A typical job: ${formatDuration(now)} -> ${formatDuration(then)} per instruction (${saved}% less).${wall}`);
}
/** Buys `key` if it's for sale and affordable; otherwise returns null. */
export function buy(progress, key) {
    const item = shopItems(progress).find((i) => i.key === key);
    if (!item || item.state !== 'buy' || progress.money < item.price)
        return null;
    return item.apply({ ...progress, money: progress.money - item.price, bought: [...progress.bought.filter((each) => each !== key), key] });
}
//# sourceMappingURL=progress.js.map