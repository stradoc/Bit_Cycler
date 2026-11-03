import { writeItem, type WordBits } from '../sim/cpu.ts';
import { bitsOf, generateProgram, kindOf, seedOf } from '../sim/generator.ts';

export type ProgramSpec = {
  readonly name: string;
  readonly source: string;
  /** Initial memory contents, starting at address 0. */
  readonly memory: readonly number[];
  /** How many items the song's run works through (contracts scale this up: "sum 2 billion bytes"). */
  readonly elements: number;
  /** What a contract does with them, e.g. "SUM" ... "BYTES". */
  readonly verb: string;
  readonly unit: string;
  /** What each register is used for (shown when a register is clicked in a replay). */
  readonly roles?: Readonly<Record<number, string>>;
  /** What the interesting parts of memory hold (shown when memory is clicked). */
  readonly memoryNote?: string;
  /** Who a contract is for (generated programs: a made-up company), shown on the board and in the song. */
  readonly client?: string;
  /** The loop's key registers (next address, end), tagged in the panel and introduced in the count-in. */
  readonly keys?: readonly KeyRegister[];
  /** How wide its data items are, and so its registers (8 unless given): a contract's data width (sim/generator.ts). */
  readonly dataBits?: WordBits;
};

/** A register the player should keep an eye on: a short tag (up to 4 letters) and one line on what it does. */
export type KeyRegister = { readonly reg: number; readonly tag: string; readonly about: string };

/** Numbers `bits` wide laid out in memory as their bytes, lowest first (as the CPU reads them). */
function asBytes(bits: WordBits, values: readonly number[]): number[] {
  const memory = new Uint8Array(values.length * (bits / 8));
  values.forEach((value, i) => writeItem(memory, i * (bits / 8), bits / 8, value));
  return Array.from(memory);
}

export const PROGRAMS: readonly ProgramSpec[] = [
  {
    name: 'SUM ARRAY',
    // Adds the 4 bytes at addresses 0-3 and stores the total at address 8.
    source: `
      addi x1, x0, 0      # x1 = address of next byte
      addi x2, x0, 4      # x2 = end address
      addi x3, x0, 0      # x3 = running sum
loop: lb   x4, 0(x1)
      add  x3, x3, x4
      addi x1, x1, 1
      bne  x1, x2, loop
      sb   x3, 8(x0)
    `,
    memory: [3, 5, 7, 2],
    elements: 4,
    verb: 'SUM',
    unit: 'BYTES',
    roles: {
      1: 'the address of the next number to add',
      2: 'the end address (4): the loop stops when x1 reaches it',
      3: 'the running sum',
      4: 'the number just loaded from memory',
    },
    memoryNote: 'Addresses 0-3 hold the numbers to add (3, 5, 7, 2). The sum is stored at address 8.',
    keys: [
      { reg: 1, tag: 'NEXT', about: "NEXT BYTE'S ADDRESS, FROM 0" },
      { reg: 2, tag: 'END', about: 'STOP WHEN x1 REACHES 4' },
    ],
  },
  {
    name: 'SUM PAIRS',
    // SUM ARRAY with two lines swapped, for superscalar (tier 7): there, nothing in the loop can pair
    // (add needs the load, add and addi both need the ALU, bne needs addi). Moving addi up next to
    // the load lets lb+addi start together, then add+bne: two chords each time round, one stall
    // between them while add waits for the load. Instruction order decides what can pair.
    source: `
      addi x1, x0, 0      # x1 = address of next byte
      addi x2, x0, 6      # x2 = end address
      addi x3, x0, 0      # x3 = running sum
loop: lb   x4, 0(x1)
      addi x1, x1, 1
      add  x3, x3, x4
      bne  x1, x2, loop
      sb   x3, 8(x0)
    `,
    memory: [3, 5, 7, 2, 4, 6],
    elements: 6,
    verb: 'SUM',
    unit: 'BYTES',
    roles: {
      1: 'the address of the next number to add (moved on right after the load, so the two can pair)',
      2: 'the end address (6): the loop stops when x1 reaches it',
      3: 'the running sum',
      4: 'the number just loaded from memory',
    },
    memoryNote: 'Addresses 0-5 hold the numbers to add (3, 5, 7, 2, 4, 6). The sum is stored at address 8.',
    keys: [
      { reg: 1, tag: 'NEXT', about: "NEXT BYTE'S ADDRESS, FROM 0" },
      { reg: 2, tag: 'END', about: 'STOP WHEN x1 REACHES 6' },
    ],
  },
  {
    name: 'SUM GRID',
    // Adds a 4-row x 3-column grid of bytes (addresses 0-11) and stores the total at address 12.
    // A loop inside a loop: the inner branch goes taken, taken, not taken on every row.
    source: `
      addi x1, x0, 0      # x1 = address of next byte
      addi x3, x0, 0      # x3 = running sum
      addi x6, x0, 12     # x6 = end of the grid
row:  addi x2, x1, 3      # x2 = end of this row
col:  lb   x4, 0(x1)
      add  x3, x3, x4
      addi x1, x1, 1
      bne  x1, x2, col
      bne  x1, x6, row
      sb   x3, 12(x0)
    `,
    memory: [1, 2, 3, 4, 5, 6, 7, 8, 9, 2, 4, 6],
    elements: 12,
    verb: 'SUM A GRID:',
    unit: 'BYTES',
    roles: {
      1: 'the address of the next number to add',
      2: 'the end of the current row: the inner loop stops when x1 reaches it',
      3: 'the running sum',
      4: 'the number just loaded from memory',
      6: 'the end of the grid (12): the outer loop stops when x1 reaches it',
    },
    memoryNote: 'Addresses 0-11 hold a grid of 4 rows x 3 numbers. The sum (57) is stored at address 12.',
    keys: [
      { reg: 1, tag: 'NEXT', about: "NEXT BYTE'S ADDRESS, FROM 0" },
      { reg: 2, tag: 'END', about: 'END OF THIS ROW (x1 + 3)' },
      { reg: 6, tag: 'GRID', about: 'END OF THE GRID: STOP AT 12' },
    ],
  },
  // The L1's upgrades, each shown on a program made for the misses it fixes (data/lessons.ts).
  {
    name: 'SUM WORDS',
    // BIGGER BLOCKS: six 32-bit numbers, each its own 4-byte block, so every load is a FIRST USE miss.
    // In 8-byte blocks, each miss brings in the next number too: half the misses.
    source: `
      addi x1, x0, 0      # x1 = address of the next number
      addi x2, x0, 24     # x2 = end address: 6 numbers, 4 bytes each
      addi x3, x0, 0      # x3 = running sum
loop: lw   x4, 0(x1)
      add  x3, x3, x4
      addi x1, x1, 4
      bne  x1, x2, loop
      sw   x3, 32(x0)
    `,
    memory: asBytes(32, [125000, 98000, 143000, 76000, 110000, 88000]),
    elements: 6,
    verb: 'SUM',
    unit: '32-BIT WORDS',
    dataBits: 32,
    roles: {
      1: 'the address of the next number (4 bytes on each time)',
      2: 'the end address (24): the loop stops when x1 reaches it',
      3: 'the running sum',
      4: 'the number just loaded from memory',
    },
    memoryNote: 'Addresses 0-23 hold six 32-bit numbers, 4 bytes each. The sum (640000) is stored at address 32.',
    keys: [
      { reg: 1, tag: 'NEXT', about: "NEXT NUMBER'S ADDRESS, FROM 0" },
      { reg: 2, tag: 'END', about: 'STOP WHEN x1 REACHES 24' },
    ],
  },
  {
    name: 'ADD TWO LISTS',
    // 2-WAY: two lists of bytes 16 apart, a whole first L1 apart, so each pair's blocks need the same line and
    // push each other out: every load misses (CONFLICT). In 2-way sets both blocks fit.
    source: `
      addi x1, x0, 0      # x1 = which pair (its address in the first list)
      addi x2, x0, 6      # x2 = how many pairs
loop: lb   x3, 0(x1)      # from the first list
      lb   x4, 16(x1)     # from the second, 16 bytes on
      add  x3, x3, x4
      sb   x3, 0(x1)      # the sum replaces the first
      addi x1, x1, 1
      bne  x1, x2, loop
    `,
    memory: [4, 7, 2, 9, 5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 1, 8, 2, 4, 7],
    elements: 6,
    verb: 'ADD PAIRS OF',
    unit: 'BYTES',
    roles: {
      1: 'which pair: its address in the first list (the second is 16 bytes on)',
      2: 'how many pairs (6): the loop stops when x1 reaches it',
      3: 'a byte from the first list, then the sum',
      4: 'a byte from the second list',
    },
    memoryNote: 'Addresses 0-5 and 16-21 hold two lists. They are 16 bytes apart, so on the first L1 each pair needs the same line. Each sum replaces the byte in the first list.',
    keys: [
      { reg: 1, tag: 'NEXT', about: 'WHICH PAIR IS NEXT, FROM 0' },
      { reg: 2, tag: 'END', about: 'STOP WHEN x1 REACHES 6' },
    ],
  },
  {
    name: 'TWO PASSES',
    // MORE LINES: six 32-bit numbers (24 bytes) read twice: once for their total, again to work out each
    // one's "all the others" (the total less itself). The first L1 holds 16 bytes, so by the second pass the
    // first numbers are gone (TOO SMALL); with 8 lines all 24 bytes fit, and the second pass all hits.
    source: `
      addi x1, x0, 0      # x1 = address of the next number
      addi x2, x0, 24     # x2 = end address: 6 numbers, 4 bytes each
      addi x3, x0, 0      # x3 = the total
sum:  lw   x4, 0(x1)
      add  x3, x3, x4
      addi x1, x1, 4
      bne  x1, x2, sum
      addi x1, x0, 0      # back to the start for the second pass
rest: lw   x4, 0(x1)
      sub  x4, x3, x4     # x4 = the total of all the others
      sw   x4, 0(x1)
      addi x1, x1, 4
      bne  x1, x2, rest
    `,
    memory: asBytes(32, [41000, 27000, 35000, 52000, 18000, 30000]),
    elements: 6,
    verb: 'TOTAL THE OTHERS FOR',
    unit: '32-BIT WORDS',
    dataBits: 32,
    roles: {
      1: 'the address of the next number (it goes round twice)',
      2: 'the end address (24): each pass stops when x1 reaches it',
      3: 'the total of all six',
      4: 'the number just loaded, then the total of the others',
    },
    memoryNote: 'Addresses 0-23 hold six 32-bit numbers (24 bytes, more than the first L1 holds). Each is replaced by the total of the other five.',
    keys: [
      { reg: 1, tag: 'NEXT', about: "NEXT NUMBER'S ADDRESS, FROM 0, TWICE" },
      { reg: 2, tag: 'END', about: 'STOP EACH PASS AT 24' },
    ],
  },
  // The caches below the L1, each shown on a program whose data outgrows the one above (data/lessons.ts).
  // The L2's lesson reuses TWO PASSES: its 24 bytes overflow the first L1, but the L2 holds them all.
  {
    name: 'SUM BIG NUMBERS',
    // THE L3: sixteen 64-bit numbers (128 bytes). Each fills two of the first L1's 4-byte blocks, so every load
    // misses the L1. The L2's 16-byte blocks hold two numbers: without the L3, every other number comes from RAM
    // (8 trips). The L3's 64-byte blocks hold eight: 2 trips to RAM, and the rest found in the L3 or the L2.
    source: `
      addi x1, x0, 0      # x1 = address of the next number
      addi x2, x0, 128    # x2 = end address: 16 numbers, 8 bytes each
      addi x3, x0, 0      # x3 = running sum
loop: ld   x4, 0(x1)
      add  x3, x3, x4
      addi x1, x1, 8
      bne  x1, x2, loop
      sd   x3, 128(x0)
    `,
    memory: asBytes(64, [
      4200000000, 3100000000, 5600000000, 2700000000, 3900000000, 4800000000, 2500000000, 6100000000,
      3300000000, 4400000000, 2900000000, 5200000000, 3600000000, 4700000000, 2800000000, 5000000000,
    ]),
    elements: 16,
    verb: 'SUM',
    unit: '64-BIT NUMBERS',
    dataBits: 64,
    roles: {
      1: 'the address of the next number (8 bytes on each time)',
      2: 'the end address (128): the loop stops when x1 reaches it',
      3: 'the running sum',
      4: 'the number just loaded from memory',
    },
    memoryNote: 'Addresses 0-127 hold sixteen 64-bit numbers, 8 bytes each: more than the L1 and as much as the L2 hold. The sum (64800000000) is stored at address 128.',
    keys: [
      { reg: 1, tag: 'NEXT', about: "NEXT NUMBER'S ADDRESS, FROM 0" },
      { reg: 2, tag: 'END', about: 'STOP WHEN x1 REACHES 128' },
    ],
  },
  {
    name: 'BAKERY TILL',
    // A new game's first job (the tutorial): each core instruction (addi, lb, sub, sb, add, bne) comes up once,
    // early, with small numbers, so TICK can go through every one. For 2 sales: the change, and the day's takings.
    source: `
      addi x1, x0, 0      # x1 = which sale (its address)
      addi x2, x0, 2      # x2 = how many sales
      addi x5, x0, 0      # x5 = the day's takings
loop: lb   x3, 0(x1)      # x3 = the price
      lb   x4, 4(x1)      # x4 = what the customer paid
      sub  x6, x4, x3     # x6 = their change
      sb   x6, 8(x1)      # the change, for the till's drawer
      add  x5, x5, x3     # add the price to the takings
      addi x1, x1, 1
      bne  x1, x2, loop
      sb   x5, 12(x0)     # the day's takings
    `,
    memory: [3, 5, 0, 0, 5, 9],
    elements: 2,
    verb: 'RING UP',
    unit: 'SALES: CHANGE AND TAKINGS',
    roles: {
      1: 'which sale: its address in memory',
      2: 'how many sales (2): the loop stops when x1 reaches it',
      3: 'the price of this sale',
      4: 'what the customer paid',
      5: "the day's takings: a running total of the prices",
      6: "the customer's change: what they paid, minus the price",
    },
    memoryNote: 'Addresses 0-1 hold the prices (3, 5), 4-5 what each customer paid (5, 9). The change goes to 8-9, the takings (8) to 12.',
    client: 'CORNER BAKERY',
    keys: [
      { reg: 1, tag: 'NEXT', about: "NEXT SALE'S ADDRESS, FROM 0" },
      { reg: 2, tag: 'END', about: 'STOP WHEN x1 REACHES 2' },
    ],
  },
];

/** A new game's first job: the only one on the board until it's done. */
export const TUTORIAL_PROGRAM = 'BAKERY TILL';

const generated = new Map<string, ProgramSpec>();

/** A fixed program by name, or a contract's generated one ("CHECKSUM #4821"), rebuilt from its seed. */
export function programByName(name: string): ProgramSpec {
  const fixed = PROGRAMS.find((program) => program.name === name);
  if (fixed) return fixed;
  const seed = seedOf(name);
  if (seed === undefined) return PROGRAMS[0];
  let spec = generated.get(name);
  if (!spec) {
    try {
      spec = generateProgram(seed, kindOf(name), bitsOf(name));
    } catch {
      spec = PROGRAMS[0]; // never expected (tests check thousands of seeds), but a song must never hang
    }
    generated.set(name, spec);
  }
  return spec;
}
