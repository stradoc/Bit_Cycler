// The intro: the computer boots and starts the game. Like a real power-on
// self test it reports the hardware it finds, which here is the player's
// save: the CPU, its clock and how long one cycle lasts, what a trip to RAM
// costs in cycles (the memory wall), the cache, the cooler and any wear. So
// the boot changes as the CPU is upgraded. Each era boots the way its
// machines did; the wording is generic, not any real product's.
import { COOLING } from './economy.js';
import { programByName } from './programs.js';
import { formatDuration, formatMhz, formatMoney } from '../format.js';
import { MEMORY_TIMING, ramCycles, SHOWN_BYTES } from '../sim/memory.js';
import { ratedMhz, tierOf } from '../sim/progress.js';
import { THERMAL } from '../sim/thermal.js';
/** The CPU's word size: always 8-bit until the word size upgrade exists. */
const WORD_BITS = 8;
/**
 * The boot for the era at `eraIndex` (0-3: the 8-bit to 64-bit look),
 * reporting `progress` (null: no save yet) from the save slot `slot`.
 */
export function bootScript(progress, slot, eraIndex) {
    const facts = progress && hardware(progress);
    const job = progress ? `${slot.name}: ${formatMoney(progress.money)}, ${progress.board.length} CONTRACTS WAITING` : 'NO SAVE YET: START A NEW CAMPAIGN';
    const print = (text, pause, sound) => ({ kind: 'print', text, pause, sound });
    // The self test passing: one short beep.
    const memory = { kind: 'count', text: 'MEMORY TEST: ', to: SHOWN_BYTES, done: ' BYTES OK', sound: 'beep' };
    // The programs come off a floppy on the 8-bit computer, a hard drive later, a silent SSD on the modern one.
    const drive = eraIndex === 0 ? 'floppy' : eraIndex < 3 ? 'disk' : undefined;
    const loading = { kind: 'scroll', lines: programListing(progress), sound: drive };
    if (eraIndex >= 3) {
        // A modern boot log in a terminal window, then a shell.
        const ok = (text) => ({ kind: 'print', text, tag: 'OK', pause: 90 });
        const lines = facts
            ? [
                ok(`Detected CPU: ${facts.cpu}`),
                ok(`Clock: ${facts.clock}`),
                ok(`Memory: ${SHOWN_BYTES} BYTES, ${facts.ram}`),
                ok(`L1 cache: ${facts.cache}`),
                ok(`Cooling: ${facts.cooler}`),
                ...(facts.wear ? [{ kind: 'print', text: `Chip worn: ${facts.wear}`, tag: 'WARN', pause: 90 }] : []),
            ]
            : [ok('Detected CPU: not configured')];
        return [
            ...lines,
            ok('Reached target: contracts'),
            print(''),
            { kind: 'type', prompt: 'player@bit-cycler:~$ ', text: `./bit-cycler --slot ${slot.id}` },
            print(job, 200),
            loading,
            print('Starting Bit Cycler...', 300),
        ];
    }
    const banner = ['BIT CYCLER BIOS 1.0', 'BIT CYCLER BIOS 2.0', 'BIT CYCLER BIOS 4.0'][eraIndex] ?? 'BIT CYCLER BIOS';
    const report = facts
        ? [
            print(`CPU:    ${facts.cpu}`),
            print(`CLOCK:  ${facts.clock}`),
            memory,
            print(`RAM:    ${facts.ram}`),
            print(`CACHE:  ${facts.cache}`),
            print(`COOLER: ${facts.cooler}`),
            ...(facts.wear ? [print(`WARNING: CHIP WORN, ${facts.wear}`, 300)] : []),
        ]
        : [memory, print('CPU:    NOT CONFIGURED')];
    const head = [print(banner, 200), print(''), ...report, print('')];
    if (eraIndex === 0) {
        // An early micro: a one-letter drive prompt.
        return [
            ...head,
            { kind: 'type', prompt: 'A>', text: `LOAD SAVE${slot.id.toUpperCase()}`, sound: 'floppy' },
            print(job, 150),
            loading,
            print(''),
            { kind: 'type', prompt: 'A>', text: 'RUN CYCLER' },
        ];
    }
    // DOS, then the program takes over the screen; the 32-bit era's starts its desktop first.
    return [
        ...head,
        print('STARTING DOS...', 400, 'disk'),
        print(''),
        { kind: 'type', prompt: 'C:\\>', text: 'CD \\CYCLER' },
        { kind: 'type', prompt: 'C:\\CYCLER>', text: `CYCLER /SLOT:${slot.id.toUpperCase()}`, sound: 'disk' },
        print(job, 150),
        loading,
        ...(eraIndex === 2 ? [print('STARTING THE DESKTOP...', 300)] : []),
        { kind: 'clear' },
    ];
}
/** The longest the loading scroll runs: about two screens. */
const MAX_LISTING = 48;
/**
 * Every contract's program, as the boot loads it (a new game's first lesson
 * program when there's no save): the job's name, then its code without comments.
 */
export function programListing(progress) {
    const names = progress && progress.board.length > 0 ? progress.board.map((contract) => contract.program) : ['SUM ARRAY'];
    const lines = [];
    for (const name of names) {
        const spec = programByName(name);
        lines.push(`LOADING ${spec.client ? `${spec.client}: ` : ''}${spec.name}`);
        for (const line of spec.source.split('\n')) {
            const code = line.replace(/#.*/, '').trimEnd();
            if (code.trim())
                lines.push(`  ${code}`);
        }
    }
    return lines.slice(0, MAX_LISTING);
}
/** What the boot reports about the player's computer. */
function hardware(progress) {
    const tier = tierOf(progress);
    const mhz = ratedMhz(progress);
    const cache = progress.cacheLevels > 0;
    const cycles = ramCycles(mhz, cache);
    const ramNs = MEMORY_TIMING.ramNs + (cache ? MEMORY_TIMING.l1Ns : 0);
    return {
        cpu: `${WORD_BITS}-BIT, TIER ${tier.number} ${tier.name}`,
        clock: `${formatMhz(mhz)}, A CYCLE EVERY ${formatDuration(1 / (mhz * 1e6))}`,
        ram: `A TRIP TAKES ${ramNs} ns = ${cycles} CYCLE${cycles === 1 ? '' : 'S'}`,
        cache: cache ? '16 BYTES, DIRECT-MAPPED' : 'NONE',
        cooler: COOLING[progress.cooling].name,
        wear: progress.chipMaxDial < THERMAL.maxDial ? `MAX CLOCK ${Math.round(progress.chipMaxDial * 100)}%` : undefined,
    };
}
//# sourceMappingURL=boot.js.map