// The intro: the computer boots and starts the game. Like a real power-on
// self test it reports the hardware it finds, which here is the player's
// save: the CPU, its clock and how long one cycle lasts, what a trip to RAM
// costs in cycles (the memory wall), the cache, the cooler and any wear. So
// the boot changes as the CPU is upgraded. Each era boots the way its
// computer did (ui/eras.ts: its BIOS, drive and shell); the wording is
// generic, not any real product's.

import { COOLING } from './economy.ts';
import { programByName } from './programs.ts';
import { formatDuration, formatMhz, formatMoney } from '../format.ts';
import { MEMORY_TIMING, ramCycles, SHOWN_BYTES } from '../sim/memory.ts';
import { ratedMhz, tierOf, type Progress } from '../sim/progress.ts';
import { THERMAL } from '../sim/thermal.ts';
import type { Era } from '../ui/eras.ts';

/**
 * A sound the computer makes at a step (a cue in audio/cues.ts): the POST
 * beep when the self test passes, a floppy or hard drive reading.
 */
export type BootSound = 'beep' | 'floppy' | 'disk';

export type BootStep =
  /** A line the computer prints, after a short wait (with its sound). `tag` is a modern boot log's status. */
  | { readonly kind: 'print'; readonly text: string; readonly tag?: 'OK' | 'WARN'; readonly pause?: number; readonly sound?: BootSound }
  /** The memory test: `text` counting up to `to`, then `done` (and its sound). */
  | { readonly kind: 'count'; readonly text: string; readonly to: number; readonly done: string; readonly sound?: BootSound }
  /** A command typed after its prompt, a key at a time; its sound plays once Enter is pressed. */
  | { readonly kind: 'type'; readonly prompt: string; readonly text: string; readonly sound?: BootSound }
  /** Lines that pour out too fast to read, scrolling the screen: the jobs' programs loading (with the drive reading). */
  | { readonly kind: 'scroll'; readonly lines: readonly string[]; readonly sound?: BootSound }
  /** The screen clears, as a program takes it over. */
  | { readonly kind: 'clear' };

/** The CPU's word size: always 8-bit until the word size upgrade exists. */
const WORD_BITS = 8;

/**
 * The boot on the era's computer, reporting `progress` (null: no save yet)
 * from the save slot `slot`.
 */
export function bootScript(progress: Progress | null, slot: { readonly id: string; readonly name: string }, era: Era): BootStep[] {
  const { computer } = era;
  const facts = progress && hardware(progress);
  const job = progress ? `${slot.name}: ${formatMoney(progress.money)}, ${progress.board.length} CONTRACTS WAITING` : 'NO SAVE YET: START A NEW CAMPAIGN';
  const print = (text: string, pause?: number, sound?: BootSound): BootStep => ({ kind: 'print', text, pause, sound });
  // The self test passing: one short beep from the PC speaker.
  const memory: BootStep = { kind: 'count', text: 'MEMORY TEST: ', to: SHOWN_BYTES, done: ' BYTES OK', sound: era.sound.beep ? 'beep' : undefined };
  // The programs come off a floppy or a hard drive; an SSD is silent.
  const drive: BootSound | undefined = computer.drive === 'ssd' ? undefined : computer.drive;
  const loading: BootStep = { kind: 'scroll', lines: programListing(progress), sound: drive };

  if (computer.shell) {
    // A modern boot log in a terminal window, then a shell.
    const ok = (text: string): BootStep => ({ kind: 'print', text, tag: 'OK', pause: 90 });
    const lines: BootStep[] = facts
      ? [
          ok(`Detected CPU: ${facts.cpu}`),
          ok(`Clock: ${facts.clock}`),
          ok(`Memory: ${SHOWN_BYTES} BYTES, ${facts.ram}`),
          ok(`L1 cache: ${facts.cache}`),
          ok(`Cooling: ${facts.cooler}`),
          ...(facts.wear ? [{ kind: 'print', text: `Chip worn: ${facts.wear}`, tag: 'WARN', pause: 90 } as const] : []),
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

  const report: BootStep[] = facts
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
  const head = [print(computer.bios, 200), print(''), ...report, print('')];

  if (computer.drive === 'floppy') {
    // An early micro booting from a floppy: a one-letter drive prompt.
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
    ...(era.kind === 'desktop' ? [print('STARTING THE DESKTOP...', 300)] : []),
    { kind: 'clear' },
  ];
}

/** The longest the loading scroll runs: about two screens. */
const MAX_LISTING = 48;

/**
 * Every contract's program, as the boot loads it (a new game's first lesson
 * program when there's no save): the job's name, then its code without comments.
 */
export function programListing(progress: Progress | null): string[] {
  const names = progress && progress.board.length > 0 ? progress.board.map((contract) => contract.program) : ['SUM ARRAY'];
  const lines: string[] = [];
  for (const name of names) {
    const spec = programByName(name);
    lines.push(`LOADING ${spec.client ? `${spec.client}: ` : ''}${spec.name}`);
    for (const line of spec.source.split('\n')) {
      const code = line.replace(/#.*/, '').trimEnd();
      if (code.trim()) lines.push(`  ${code}`);
    }
  }
  return lines.slice(0, MAX_LISTING);
}

/** What the boot reports about the player's computer. */
function hardware(progress: Progress): { cpu: string; clock: string; ram: string; cache: string; cooler: string; wear?: string } {
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
