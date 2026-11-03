import type { KeyRegister, ProgramSpec } from '../data/programs.ts';
import { cpuFor, trace, wrapTo, writeItem, type WordBits } from './cpu.ts';
import { memoryOps } from './isa.ts';

// Random programs for contracts. Each comes from a seed, so a contract only
// stores its name ("CHECKSUM #4821") and the program can be rebuilt anywhere.
// A family of small kernels (sum, checksum, count, copy, find, ...) with
// random sizes, data, register choices (x1 and x2 are always the loop's NEXT
// and END) and instruction order: the order changes where hazards fall, so
// the same kind of job can play differently. A program's data can be 8, 16,
// 32 or 64 bits wide (its Layout): the loop is the same, with loads and stores
// that move a whole item and a pointer that steps by its size. Inputs and
// outputs stay within 32 items (addresses 0-31 for bytes, 0-255 for 64-bit numbers).

/** The answer the program should leave in memory (tests check it): the item at a byte address, as a register as wide as the data holds it. */
export type Answer = { readonly address: number; readonly value: number };
export type GeneratedProgram = ProgramSpec & { readonly answer: readonly Answer[] };

/** A small, fast, seeded random number generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = {
  int(low: number, high: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  /**
   * Distinct registers for the program's variables: always x1 then x2 first
   * (the loop's NEXT and END in every program, so players know where to look),
   * then random ones from x3-x7.
   */
  registers(count: number): number[];
};

function randomTools(next: () => number): Random {
  const int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1));
  return {
    int,
    pick: (items) => items[int(0, items.length - 1)],
    chance: (p) => next() < p,
    registers: (count) => {
      const pool = [1, 2, 3, 4, 5, 6, 7];
      // All seven are shuffled, so a seed's other random choices (data, layout, client) stay put.
      for (let i = pool.length - 1; i > 0; i--) {
        const j = int(0, i);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return [1, 2, ...pool.filter((reg) => reg > 2)].slice(0, count);
    },
  };
}

/** What a kernel builds: the source, memory, and words describing it. */
type Kernel = Omit<GeneratedProgram, 'name'> & { readonly kind: string };

/** How much bigger the numbers are in wider data, so they need the width: a 64-bit job's numbers don't fit in 32 bits. */
const DATA_SCALE: Readonly<Record<WordBits, number>> = { 8: 1, 16: 100, 32: 100_000, 64: 1_000_000_000 };

/**
 * How a program's data is laid out: items `bytes` wide (1, 2, 4 or 8), the
 * load and store that move one, and the words for one. Every address in a
 * program is an item's place times its size, so the loop keeps its shape at
 * any width. A byte program comes out exactly as it always did.
 */
type Layout = {
  readonly bits: WordBits;
  readonly bytes: number;
  readonly load: string;
  readonly store: string;
  /** "byte", or "number" for wider data. */
  readonly noun: string;
  /** The byte address of item `i`. */
  at(i: number): number;
  /** Addresses of `count` items from item `first`, as a range ("0-13"). */
  span(first: number, count: number): string;
  /** After the first mention of the data: how many items, how big (nothing for bytes). */
  readonly sized: (count: number) => string;
  /** `n` random values from `low` to `high`, in the data's own range. */
  values(r: Random, n: number, low: number, high: number): number[];
  /** A result as a register this wide (and the memory it's stored in) holds it. */
  wrap(value: number): number;
};

function layoutFor(bits: WordBits): Layout {
  const bytes = bits / 8;
  const { load, store } = memoryOps(bytes);
  const scale = DATA_SCALE[bits];
  return {
    bits,
    bytes,
    load,
    store,
    noun: bits === 8 ? 'byte' : 'number',
    at: (i) => i * bytes,
    span: (first, count) => `${first * bytes}-${(first + count) * bytes - 1}`,
    sized: (count) => (bits === 8 ? '' : ` (${count} ${bits}-bit numbers, ${bytes} bytes each)`),
    values: (r, n, low, high) => Array.from({ length: n }, () => r.int(low * scale, high * scale)),
    wrap: (value) => wrapTo(bits, value),
  };
}

/** An instruction's mnemonic padded to the listing's column ("lb   x4, ..."). */
const op = (name: string) => name.padEnd(4);

const x = (r: number) => `x${r}`;
/** The loop's two key registers: where it is (counting up from `from`) and the value that ends it. */
const loopKeys = (L: Layout, p: number, end: number, stop: number, next = `NEXT ${L.noun.toUpperCase()}'S ADDRESS`, from = 0): KeyRegister[] => [
  { reg: p, tag: 'NEXT', about: `${next}, FROM ${from}` },
  { reg: end, tag: 'END', about: `STOP WHEN ${x(p)} REACHES ${stop}` },
];
const bytes = (r: Random, n: number, low: number, high: number) => Array.from({ length: n }, () => r.int(low, high));

/** Adds up n bytes (or XORs them: a checksum). Sometimes the pointer step comes before the add. */
function reduce(r: Random, L: Layout, kind: 'add' | 'xor'): Kernel {
  const n = r.int(8, 14);
  const [p, end, acc, v] = r.registers(4);
  const out = r.int(8 + Math.max(0, n - 8), 15);
  const data = L.values(r, n, 1, 15);
  const early = r.chance(0.5); // the pointer step between the load and its use: no load-use stall
  const body = early
    ? [`${op(L.load)} ${x(v)}, 0(${x(p)})`, `addi ${x(p)}, ${x(p)}, ${L.bytes}`, `${op(kind)} ${x(acc)}, ${x(acc)}, ${x(v)}`]
    : [`${op(L.load)} ${x(v)}, 0(${x(p)})`, `${op(kind)} ${x(acc)}, ${x(acc)}, ${x(v)}`, `addi ${x(p)}, ${x(p)}, ${L.bytes}`];
  const total = data.reduce((a, b) => (kind === 'add' ? L.wrap(a + b) : a ^ b), 0);
  return {
    kind: kind === 'add' ? 'SUM' : 'CHECKSUM',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `      addi ${x(acc)}, x0, 0`,
      `loop: ${body[0]}`,
      ...body.slice(1).map((line) => `      ${line}`),
      `      bne  ${x(p)}, ${x(end)}, loop`,
      `      ${op(L.store)} ${x(acc)}, ${L.at(out)}(x0)`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: kind === 'add' ? 'SUM' : 'CHECKSUM',
    unit: 'BYTES',
    roles: {
      [p]: `the address of the next ${L.noun}`,
      [end]: `the end address (${L.at(n)}): the loop stops when the address reaches it`,
      [acc]: kind === 'add' ? 'the running sum' : `the running checksum (each ${L.noun} XORed in)`,
      [v]: `the ${L.noun} just loaded`,
    },
    keys: loopKeys(L, p, end, L.at(n)),
    memoryNote: `Addresses ${L.span(0, n)} hold the data${L.sized(n)}. The ${kind === 'add' ? 'sum' : 'checksum'} (${total}) goes to address ${L.at(out)}.`,
    answer: [{ address: out, value: total }],
  };
}

/** Counts the bytes equal to a value: a forward branch skips the count when it doesn't match. */
function count(r: Random, L: Layout): Kernel {
  const n = r.int(8, 14);
  const [p, end, c, k, v] = r.registers(5);
  const target = r.int(0, 3);
  // Small values at any width: they're compared with a number written in the program (addi).
  const data = bytes(r, n, 0, 3);
  const out = r.int(8 + Math.max(0, n - 8), 15);
  const matches = data.filter((d) => d === target).length;
  return {
    kind: 'COUNT',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `      addi ${x(c)}, x0, 0`,
      `      addi ${x(k)}, x0, ${target}`,
      `loop: ${op(L.load)} ${x(v)}, 0(${x(p)})`,
      `      bne  ${x(v)}, ${x(k)}, skip`,
      `      addi ${x(c)}, ${x(c)}, 1`,
      `skip: addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
      `      ${op(L.store)} ${x(c)}, ${L.at(out)}(x0)`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: `COUNT ${target}s IN`,
    unit: 'BYTES',
    roles: {
      [p]: `the address of the next ${L.noun}`,
      [end]: `the end address (${L.at(n)})`,
      [c]: `how many ${target}s so far`,
      [k]: `the value being counted (${target})`,
      [v]: `the ${L.noun} just loaded`,
    },
    keys: loopKeys(L, p, end, L.at(n)),
    memoryNote: `Addresses ${L.span(0, n)} hold the data${L.sized(n)}. The count of ${target}s (${matches}) goes to address ${L.at(out)}.`,
    answer: [{ address: out, value: matches }],
  };
}

/** Copies n bytes from 0.. to 8.. (or doubles them in place). */
function copy(r: Random, L: Layout, double: boolean): Kernel {
  const n = double ? r.int(8, 15) : r.int(5, 8);
  const [p, end, v] = r.registers(3);
  const data = L.values(r, n, 1, double ? 60 : 99);
  const to = double ? 0 : 8;
  return {
    kind: double ? 'DOUBLE' : 'COPY',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `loop: ${op(L.load)} ${x(v)}, 0(${x(p)})`,
      ...(double ? [`      add  ${x(v)}, ${x(v)}, ${x(v)}`] : []),
      `      ${op(L.store)} ${x(v)}, ${L.at(to)}(${x(p)})`,
      `      addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: double ? 'DOUBLE' : 'COPY',
    unit: 'BYTES',
    roles: { [p]: `the address of the next ${L.noun}`, [end]: `the end address (${L.at(n)})`, [v]: double ? `the ${L.noun} being doubled` : `the ${L.noun} being copied` },
    keys: loopKeys(L, p, end, L.at(n)),
    memoryNote: double
      ? `Addresses ${L.span(0, n)} hold the data${L.sized(n)}; each ${L.noun} is doubled where it is.`
      : `Addresses ${L.span(0, n)}${L.sized(n)} are copied to addresses ${L.span(8, n)}.`,
    answer: data.map((d, i) => ({ address: to + i, value: double ? L.wrap(d * 2) : d })),
  };
}

/**
 * Adds a second array into a first (0..), pair by pair. The second starts at
 * 8, or half the time at 16: a cache-full away (for bytes), so each pair's
 * two bytes need the same cache line and keep pushing each other out
 * (conflict misses).
 */
function addArrays(r: Random, L: Layout): Kernel {
  const n = r.int(5, 8);
  const [p, end, a, b] = r.registers(4);
  const first = L.values(r, n, 1, 50);
  const second = L.values(r, n, 1, 50);
  const at = r.chance(0.5) ? 16 : 8;
  const memory = [...first, ...Array(at - n).fill(0), ...second];
  return {
    kind: 'ADD ARRAYS',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `loop: ${op(L.load)} ${x(a)}, 0(${x(p)})`,
      `      ${op(L.load)} ${x(b)}, ${L.at(at)}(${x(p)})`,
      `      add  ${x(a)}, ${x(a)}, ${x(b)}`,
      `      ${op(L.store)} ${x(a)}, 0(${x(p)})`,
      `      addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory,
    elements: n,
    verb: 'ADD PAIRS OF',
    unit: 'BYTES',
    roles: {
      [p]: L.bits === 8 ? 'which pair (0, 1, 2 ...)' : `where the next pair is (0, ${L.bytes}, ${2 * L.bytes} ...)`,
      [end]: L.bits === 8 ? `how many pairs (${n})` : `where the pairs end (${L.at(n)}: ${n} pairs)`,
      [a]: `a ${L.noun} from the first array, then the sum`,
      [b]: `a ${L.noun} from the second array`,
    },
    keys: loopKeys(L, p, end, L.at(n), 'WHICH PAIR IS NEXT'),
    memoryNote:
      `Addresses ${L.span(0, n)} and ${L.span(at, n)} hold two arrays${L.sized(n)}; each sum replaces the ${L.noun} in the first.` +
      (at === 16 && L.bits === 8 ? ' They are 16 bytes apart, so each pair needs the same cache line.' : ''),
    answer: first.map((d, i) => ({ address: i, value: L.wrap(d + second[i]) })),
  };
}

/** Finds where a value first appears: the loop can end early (beq out). */
function find(r: Random, L: Layout): Kernel {
  const n = r.int(8, 14);
  const [p, end, t, v] = r.registers(4);
  // Small values at any width: the one searched for is written in the program (addi).
  const data = bytes(r, n, 1, 9);
  // The first match is at least 5 items in, so the search has some work to do.
  const first = r.int(5, n - 1);
  const target = data[first];
  for (let i = 0; i < first; i++) if (data[i] === target) data[i] = (target % 9) + 1;
  const out = r.int(8 + Math.max(0, n - 8), 15);
  return {
    kind: 'FIND',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `      addi ${x(t)}, x0, ${target}`,
      `loop: ${op(L.load)} ${x(v)}, 0(${x(p)})`,
      `      beq  ${x(v)}, ${x(t)}, found`,
      `      addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
      `found: ${L.store.padEnd(3)} ${x(p)}, ${L.at(out)}(x0)`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: `FIND A ${target} IN`,
    unit: 'BYTES',
    roles: { [p]: 'the address being checked', [end]: `the end address (${L.at(n)})`, [t]: `the value searched for (${target})`, [v]: `the ${L.noun} just loaded` },
    keys: loopKeys(L, p, end, L.at(n)),
    memoryNote: `Addresses ${L.span(0, n)} hold the data${L.sized(n)}. Where the first ${target} is (address ${L.at(first)}) goes to address ${L.at(out)}.`,
    answer: [{ address: out, value: L.at(first) }],
  };
}

/** Fills n bytes with a value: stores only. */
function fill(r: Random, L: Layout): Kernel {
  const n = r.int(8, 16);
  const [p, end, v] = r.registers(3);
  // A number written in the program (addi), so small at any width.
  const value = r.int(1, 99);
  const start = r.int(0, 16 - n);
  return {
    kind: 'FILL',
    source: [
      `      addi ${x(p)}, x0, ${L.at(start)}`,
      `      addi ${x(end)}, x0, ${L.at(start + n)}`,
      `      addi ${x(v)}, x0, ${value}`,
      `loop: ${op(L.store)} ${x(v)}, 0(${x(p)})`,
      `      addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: [],
    elements: n,
    verb: `FILL WITH ${value}:`,
    unit: 'BYTES',
    roles: { [p]: 'the address being filled', [end]: `the address to stop at (${L.at(start + n)})`, [v]: `the value written (${value})` },
    keys: loopKeys(L, p, end, L.at(start + n), 'NEXT ADDRESS TO FILL', L.at(start)),
    memoryNote: `Addresses ${L.span(start, n)}${L.sized(n)} are filled with ${value}.`,
    answer: Array.from({ length: n }, (_, i) => ({ address: start + i, value })),
  };
}

/** Sums a rows x cols grid with a loop inside a loop. */
function grid(r: Random, L: Layout): Kernel {
  // Up to 15 cells, so the sum still fits at item 15.
  const [rows, cols] = r.pick([[3, 3], [3, 4], [4, 3], [3, 5], [5, 3]] as const);
  const cells = rows * cols;
  const [p, rowEnd, acc, v, gridEnd] = r.registers(5);
  const data = L.values(r, cells, 1, 9);
  const out = r.int(Math.max(12, cells), 15);
  const total = L.wrap(data.reduce((a, b) => a + b, 0));
  return {
    kind: 'GRID SUM',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(acc)}, x0, 0`,
      `      addi ${x(gridEnd)}, x0, ${L.at(cells)}`,
      `row:  addi ${x(rowEnd)}, ${x(p)}, ${L.at(cols)}`,
      `col:  ${op(L.load)} ${x(v)}, 0(${x(p)})`,
      `      add  ${x(acc)}, ${x(acc)}, ${x(v)}`,
      `      addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(rowEnd)}, col`,
      `      bne  ${x(p)}, ${x(gridEnd)}, row`,
      `      ${op(L.store)} ${x(acc)}, ${L.at(out)}(x0)`,
    ].join('\n'),
    memory: data,
    elements: cells,
    verb: `SUM ${rows}x${cols} GRIDS:`,
    unit: 'BYTES',
    roles: {
      [p]: 'the address of the next number',
      [rowEnd]: 'the end of the current row',
      [acc]: 'the running sum',
      [v]: 'the number just loaded',
      [gridEnd]: `the end of the grid (${L.at(cells)})`,
    },
    keys: [
      { reg: p, tag: 'NEXT', about: `NEXT ${L.noun.toUpperCase()}'S ADDRESS, FROM 0` },
      { reg: rowEnd, tag: 'END', about: `END OF THIS ROW (${x(p)} + ${L.at(cols)})` },
      { reg: gridEnd, tag: 'GRID', about: `END OF THE GRID: STOP AT ${L.at(cells)}` },
    ],
    memoryNote: `Addresses ${L.span(0, cells)} hold ${rows} rows of ${cols}${L.sized(cells)}. The sum (${total}) goes to address ${L.at(out)}.`,
    answer: [{ address: out, value: total }],
  };
}


/** Reverses n bytes where they are: one address walks up from the start, another down from the end, and each pair is swapped. */
function reverse(r: Random, L: Layout): Kernel {
  const n = 2 * r.int(4, 7);
  const [p, end, q, a, b] = r.registers(5);
  const data = L.values(r, n, 1, 99);
  return {
    kind: 'REVERSE',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n / 2)}`,
      `      addi ${x(q)}, x0, ${L.at(n - 1)}`,
      `loop: ${op(L.load)} ${x(a)}, 0(${x(p)})`,
      `      ${op(L.load)} ${x(b)}, 0(${x(q)})`,
      `      ${op(L.store)} ${x(b)}, 0(${x(p)})`,
      `      ${op(L.store)} ${x(a)}, 0(${x(q)})`,
      `      addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      addi ${x(q)}, ${x(q)}, ${-L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: 'REVERSE',
    unit: 'BYTES',
    roles: {
      [p]: 'the address at the front, counting up',
      [end]: `the middle (${L.at(n / 2)}): the loop stops when the front reaches it`,
      [q]: 'the address at the back, counting down',
      [a]: `the ${L.noun} from the front`,
      [b]: `the ${L.noun} from the back`,
    },
    keys: [...loopKeys(L, p, end, L.at(n / 2), 'FRONT ADDRESS'), { reg: q, tag: 'BACK', about: `BACK ADDRESS, FROM ${L.at(n - 1)} DOWN` }],
    memoryNote: `Addresses ${L.span(0, n)} hold the data${L.sized(n)}; the first and last swap, then the second and second-last, up to the middle.`,
    answer: [...data].reverse().map((value, address) => ({ address, value })),
  };
}

/** Keeps a running total and stores it after every byte (a bank statement's balance column). */
function runningTotal(r: Random, L: Layout): Kernel {
  const n = r.int(6, 12);
  const [p, end, acc, v] = r.registers(4);
  const data = L.values(r, n, 1, 20);
  // Half the time the address moves on before the store, which then reaches one item less far.
  const early = r.chance(0.5);
  const body = early
    ? [`add  ${x(acc)}, ${x(acc)}, ${x(v)}`, `addi ${x(p)}, ${x(p)}, ${L.bytes}`, `${op(L.store)} ${x(acc)}, ${L.at(15)}(${x(p)})`]
    : [`add  ${x(acc)}, ${x(acc)}, ${x(v)}`, `${op(L.store)} ${x(acc)}, ${L.at(16)}(${x(p)})`, `addi ${x(p)}, ${x(p)}, ${L.bytes}`];
  const totals = data.map((_, i) => L.wrap(data.slice(0, i + 1).reduce((a, b) => a + b, 0)));
  return {
    kind: 'RUNNING TOTAL',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `      addi ${x(acc)}, x0, 0`,
      `loop: ${op(L.load)} ${x(v)}, 0(${x(p)})`,
      ...body.map((line) => `      ${line}`),
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: 'RUNNING TOTALS OF',
    unit: 'BYTES',
    roles: { [p]: `the address of the next ${L.noun}`, [end]: `the end address (${L.at(n)})`, [acc]: 'the total so far', [v]: `the ${L.noun} just loaded` },
    keys: loopKeys(L, p, end, L.at(n)),
    memoryNote: `Addresses ${L.span(0, n)} hold the data${L.sized(n)}. The total after each ${L.noun} goes to addresses ${L.span(16, n)}.`,
    answer: totals.map((value, i) => ({ address: 16 + i, value })),
  };
}

/** The change from each byte to the next (readings that rise and fall): a subtraction that needs the byte before. */
function changes(r: Random, L: Layout): Kernel {
  const n = r.int(7, 13);
  const [p, end, prev, v, d] = r.registers(5);
  // Readings that drift: each one a little above or below the last (in the data's own range).
  const scale = DATA_SCALE[L.bits];
  const data = [r.int(20, 40) * scale];
  for (let i = 1; i < n; i++) data.push(Math.max(scale, Math.min(99 * scale, data[i - 1] + r.int(-6, 9) * scale)));
  // How a fall shows: a byte or a halfword wraps round; wider registers hold negative numbers.
  const fall = L.bits === 8 ? ['1 less than 0 is 255', '256 minus it'] : L.bits === 16 ? ['1 less than 0 is 65535', '65536 minus it'] : undefined;
  return {
    kind: 'CHANGES',
    source: [
      `      addi ${x(p)}, x0, ${L.at(1)}`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `      ${op(L.load)} ${x(prev)}, 0(x0)`,
      `loop: ${op(L.load)} ${x(v)}, 0(${x(p)})`,
      `      sub  ${x(d)}, ${x(v)}, ${x(prev)}`,
      `      ${op(L.store)} ${x(d)}, ${L.at(15)}(${x(p)})`,
      `      addi ${x(prev)}, ${x(v)}, 0`,
      `      addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: data,
    elements: n - 1,
    verb: 'CHANGES BETWEEN',
    unit: 'BYTES',
    roles: {
      [p]: `the address of the next ${L.noun}`,
      [end]: `the end address (${L.at(n)})`,
      [prev]: `the ${L.noun} before it`,
      [v]: `the ${L.noun} just loaded`,
      [d]: fall ? `how much it changed (a fall wraps around: ${fall[0]})` : 'how much it changed (a fall is a negative number)',
    },
    keys: loopKeys(L, p, end, L.at(n), `NEXT ${L.noun.toUpperCase()}'S ADDRESS`, L.at(1)),
    memoryNote: `Addresses ${L.span(0, n)} hold readings${L.sized(n)}. Each change from one to the next goes to addresses ${L.span(16, n - 1)} (${fall ? `a fall shows as ${fall[1]}` : 'a fall is a negative number'}).`,
    answer: data.slice(1).map((value, i) => ({ address: 16 + i, value: L.wrap(value - data[i]) })),
  };
}

/** Replaces every byte equal to one value with another: a branch skips the store when it doesn't match. */
function replace(r: Random, L: Layout): Kernel {
  const n = r.int(8, 14);
  const [p, end, from, to, v] = r.registers(5);
  // Small values at any width: both are written in the program (addi).
  const target = r.int(0, 3);
  const value = r.int(5, 9);
  const data = bytes(r, n, 0, 3);
  return {
    kind: 'REPLACE',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `      addi ${x(from)}, x0, ${target}`,
      `      addi ${x(to)}, x0, ${value}`,
      `loop: ${op(L.load)} ${x(v)}, 0(${x(p)})`,
      `      bne  ${x(v)}, ${x(from)}, skip`,
      `      ${op(L.store)} ${x(to)}, 0(${x(p)})`,
      `skip: addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: `REPLACE ${target}s WITH ${value}s IN`,
    unit: 'BYTES',
    roles: {
      [p]: `the address of the next ${L.noun}`,
      [end]: `the end address (${L.at(n)})`,
      [from]: `the value to replace (${target})`,
      [to]: `what replaces it (${value})`,
      [v]: `the ${L.noun} just loaded`,
    },
    keys: loopKeys(L, p, end, L.at(n)),
    memoryNote: `Addresses ${L.span(0, n)} hold the data${L.sized(n)}; every ${target} becomes ${value} where it is.`,
    answer: data.map((d, address) => ({ address, value: d === target ? value : d })),
  };
}

/**
 * For each item, the total of all the others: one pass adds them up, a
 * second reads them all again and replaces each with the total less itself.
 * The only kind that reads its data twice, so a cache too small for it loses
 * the first items before the second pass (TOO SMALL misses). Bytes fit the
 * first L1 (8-12 of them, so the second pass hits); wider data takes 20-32
 * bytes, more than its 16.
 */
function others(r: Random, L: Layout): Kernel {
  // Two passes take 9 instructions an item, so at most 12 (the song's length); 16-bit data: 20-24 bytes.
  const n = L.bits === 8 ? r.int(8, 12) : r.int(Math.ceil(20 / L.bytes), Math.min(12, Math.floor(32 / L.bytes)));
  const [p, end, total, v] = r.registers(4);
  const data = L.values(r, n, 1, 15);
  const sum = data.reduce((a, b) => L.wrap(a + b), 0);
  const early = r.chance(0.5); // the pointer step between the load and its use: no load-use stall
  const first = early
    ? [`${op(L.load)} ${x(v)}, 0(${x(p)})`, `addi ${x(p)}, ${x(p)}, ${L.bytes}`, `add  ${x(total)}, ${x(total)}, ${x(v)}`]
    : [`${op(L.load)} ${x(v)}, 0(${x(p)})`, `add  ${x(total)}, ${x(total)}, ${x(v)}`, `addi ${x(p)}, ${x(p)}, ${L.bytes}`];
  return {
    kind: 'OTHERS',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `      addi ${x(total)}, x0, 0`,
      `sum:  ${first[0]}`,
      ...first.slice(1).map((line) => `      ${line}`),
      `      bne  ${x(p)}, ${x(end)}, sum`,
      `      addi ${x(p)}, x0, 0`,
      `rest: ${op(L.load)} ${x(v)}, 0(${x(p)})`,
      `      sub  ${x(v)}, ${x(total)}, ${x(v)}`,
      `      ${op(L.store)} ${x(v)}, 0(${x(p)})`,
      `      addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, rest`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: 'TOTAL THE OTHERS FOR',
    unit: 'BYTES',
    roles: {
      [p]: `the address of the next ${L.noun} (it goes through them twice)`,
      [end]: `the end address (${L.at(n)}): each pass stops when the address reaches it`,
      [total]: `the total of all ${n}`,
      [v]: `the ${L.noun} just loaded, then the total of the others`,
    },
    keys: loopKeys(L, p, end, L.at(n), `${L.noun.toUpperCase()}'S ADDRESS, TWICE`),
    memoryNote: `Addresses ${L.span(0, n)} hold the data${L.sized(n)}, read twice. Their total is ${sum}; each is replaced by the total of the others.`,
    answer: data.map((d, i) => ({ address: i, value: L.wrap(sum - d) })),
  };
}

/**
 * A sum (or checksum) unrolled for a CPU that starts two instructions at
 * once: two items each pass, into two running totals added together at the
 * end, so the second load and the pointer step, then the second total and the
 * branch, can start in pairs (the compiler's trick for multiple issue:
 * Patterson & Hennessy 4.10, loop unrolling).
 */
function unrolledReduce(r: Random, L: Layout, kind: 'add' | 'xor'): Kernel {
  const n = 2 * r.int(4, 7);
  const [p, end, a1, a2, v1, v2] = r.registers(6);
  const out = r.int(8 + Math.max(0, n - 8), 15);
  const data = L.values(r, n, 1, 15);
  const total = data.reduce((a, b) => (kind === 'add' ? L.wrap(a + b) : a ^ b), 0);
  return {
    kind: kind === 'add' ? 'UNROLLED SUM' : 'UNROLLED CHECKSUM',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `      addi ${x(a1)}, x0, 0`,
      `      addi ${x(a2)}, x0, 0`,
      `loop: ${op(L.load)} ${x(v1)}, 0(${x(p)})`,
      `      ${op(L.load)} ${x(v2)}, ${L.bytes}(${x(p)})`,
      `      addi ${x(p)}, ${x(p)}, ${2 * L.bytes}`,
      `      ${op(kind)} ${x(a1)}, ${x(a1)}, ${x(v1)}`,
      `      ${op(kind)} ${x(a2)}, ${x(a2)}, ${x(v2)}`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
      `      ${op(kind)} ${x(a1)}, ${x(a1)}, ${x(a2)}`,
      `      ${op(L.store)} ${x(a1)}, ${L.at(out)}(x0)`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: kind === 'add' ? 'SUM' : 'CHECKSUM',
    unit: 'BYTES',
    roles: {
      [p]: `the address of the next two ${L.noun}s`,
      [end]: `the end address (${L.at(n)}): the loop stops when the address reaches it`,
      [a1]: kind === 'add' ? `the running sum of the first ${L.noun} of each two` : `the checksum of the first ${L.noun} of each two`,
      [a2]: kind === 'add' ? `the running sum of the second ${L.noun} of each two` : `the checksum of the second ${L.noun} of each two`,
      [v1]: `the first ${L.noun} just loaded`,
      [v2]: `the second ${L.noun} just loaded`,
    },
    keys: loopKeys(L, p, end, L.at(n), `NEXT TWO ${L.noun.toUpperCase()}S' ADDRESS`),
    memoryNote: `Addresses ${L.span(0, n)} hold the data${L.sized(n)}, two at a time into two totals. The ${kind === 'add' ? 'sum' : 'checksum'} (${total}) goes to address ${L.at(out)}.`,
    answer: [{ address: out, value: total }],
  };
}

/**
 * Copies the data to 16.., then reads the originals again to total them, so
 * the copy can be checked: like OTHERS, a job that reads its data twice
 * (TOO SMALL misses on a cache that can't hold it). The same sizes as OTHERS:
 * bytes fit the first L1, wider data takes 20-32 bytes.
 */
function checkedCopy(r: Random, L: Layout): Kernel {
  const n = L.bits === 8 ? r.int(8, 12) : r.int(Math.ceil(20 / L.bytes), Math.min(12, Math.floor(32 / L.bytes)));
  const [p, end, total, v] = r.registers(4);
  const data = L.values(r, n, 1, 60);
  const sum = data.reduce((a, b) => L.wrap(a + b), 0);
  return {
    kind: 'CHECKED COPY',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${L.at(n)}`,
      `      addi ${x(total)}, x0, 0`,
      `copy: ${op(L.load)} ${x(v)}, 0(${x(p)})`,
      `      ${op(L.store)} ${x(v)}, ${L.at(16)}(${x(p)})`,
      `      addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, copy`,
      `      addi ${x(p)}, x0, 0`,
      `check: ${op(L.load)} ${x(v)}, 0(${x(p)})`,
      `      add  ${x(total)}, ${x(total)}, ${x(v)}`,
      `      addi ${x(p)}, ${x(p)}, ${L.bytes}`,
      `      bne  ${x(p)}, ${x(end)}, check`,
      `      ${op(L.store)} ${x(total)}, ${L.at(15)}(x0)`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: 'COPY AND CHECK',
    unit: 'BYTES',
    roles: {
      [p]: `the address of the next ${L.noun} (it goes through them twice)`,
      [end]: `the end address (${L.at(n)}): each pass stops when the address reaches it`,
      [total]: `the total of the originals, to check the copy against`,
      [v]: `the ${L.noun} just loaded`,
    },
    keys: loopKeys(L, p, end, L.at(n), `${L.noun.toUpperCase()}'S ADDRESS, TWICE`),
    memoryNote: `Addresses ${L.span(0, n)} hold the data${L.sized(n)}, copied to ${L.span(16, n)}, then read again: their total (${sum}) goes to address ${L.at(15)}.`,
    answer: [...data.map((value, i) => ({ address: 16 + i, value })), { address: 15, value: sum }],
  };
}

/**
 * Every kind of program, by the name its programs carry. A contract stores
 * only its program's name ("SUM #4821"), and the program is rebuilt from it,
 * so a kind's place here can change but its name can't: the rebuild finds the
 * kind by name (a list that grows would otherwise turn old jobs into new kinds).
 * `showcase` kinds are dealt only to show off a part you own (sim/showcase.ts),
 * never at random, so the random draw (and every seed's program) stays as it was.
 */
const KERNELS: readonly { readonly kind: string; readonly build: (r: Random, L: Layout) => Kernel; readonly showcase?: true }[] = [
  { kind: 'SUM', build: (r, L) => reduce(r, L, 'add') },
  { kind: 'CHECKSUM', build: (r, L) => reduce(r, L, 'xor') },
  { kind: 'COUNT', build: count },
  { kind: 'COPY', build: (r, L) => copy(r, L, false) },
  { kind: 'DOUBLE', build: (r, L) => copy(r, L, true) },
  { kind: 'ADD ARRAYS', build: addArrays },
  { kind: 'FIND', build: find },
  { kind: 'FILL', build: fill },
  { kind: 'GRID SUM', build: grid },
  { kind: 'REVERSE', build: reverse },
  { kind: 'RUNNING TOTAL', build: runningTotal },
  { kind: 'CHANGES', build: changes },
  { kind: 'REPLACE', build: replace },
  { kind: 'OTHERS', build: others },
  { kind: 'UNROLLED SUM', build: (r, L) => unrolledReduce(r, L, 'add'), showcase: true },
  { kind: 'UNROLLED CHECKSUM', build: (r, L) => unrolledReduce(r, L, 'xor'), showcase: true },
  { kind: 'CHECKED COPY', build: checkedCopy, showcase: true },
];

/** The kinds dealt at random (every kind but the showcase ones), in the order the seeds' draw has always used. */
const DRAWN = KERNELS.filter((kernel) => !kernel.showcase);

/**
 * Who a contract is for, and the job in their words. The companies are made up.
 * `verb` replaces the kernel's own wording (a function keeps its numbers: "COUNT 2s IN").
 */
type Client = { readonly name: string; readonly unit: string; readonly verb?: string | ((verb: string) => string) };

const CLIENTS: Readonly<Record<string, readonly Client[]>> = {
  SUM: [
    { name: 'FAIRVIEW SAVINGS', verb: 'TOTAL', unit: 'DEPOSITS' },
    { name: 'PEBBLE ROAD MARKET', verb: 'ADD UP', unit: 'SALES' },
    { name: 'HIGH PLAINS WEATHER', verb: 'SUM', unit: 'RAIN READINGS' },
  ],
  CHECKSUM: [
    { name: 'DEEP VAULT BACKUP', verb: 'CHECKSUM', unit: 'ARCHIVED BYTES' },
    { name: 'LANTERN MAIL', verb: 'VERIFY', unit: 'EMAIL BYTES' },
    { name: 'COPPER WIRE TELECOM', verb: 'CHECK', unit: 'PACKET BYTES' },
  ],
  COUNT: [
    { name: 'GREENLEAF CLINIC', unit: 'TEST RESULTS' },
    { name: 'TOWN HALL POLLING', unit: 'BALLOTS' },
    { name: 'RIVERBEND SCHOOLS', unit: 'ANSWERS' },
  ],
  COPY: [
    { name: 'SKYLINE STUDIOS', verb: 'COPY', unit: 'VIDEO BYTES' },
    { name: 'CEDAR HILL LIBRARY', verb: 'BACK UP', unit: 'BOOK SCANS' },
  ],
  DOUBLE: [
    { name: 'BRIGHTWAVE AUDIO', verb: 'DOUBLE', unit: 'AUDIO SAMPLES' },
    { name: 'STARGAZER LABS', verb: 'BRIGHTEN (x2)', unit: 'PIXELS' },
  ],
  'ADD ARRAYS': [
    { name: 'TWIN RIVERS FARMS', verb: 'ADD PAIRS OF', unit: 'TALLIES' },
    { name: 'MERIDIAN MIXING', verb: 'MIX PAIRS OF', unit: 'SAMPLES' },
  ],
  FIND: [
    { name: 'LOST & FOUND NET', unit: 'RECORDS' },
    { name: 'QUARRY GEOLOGY', unit: 'CORE SAMPLES' },
  ],
  FILL: [
    { name: 'CLEAN SLATE DRIVES', unit: 'DISK BYTES' },
    { name: 'SIGNPOST PRINTING', unit: 'PAGE BYTES' },
  ],
  'GRID SUM': [
    { name: 'CROPWATCH SURVEY', verb: (v) => v.replace('GRIDS', 'FIELDS'), unit: 'CELLS' },
    { name: 'MAPLE CITY TRANSIT', verb: (v) => v.replace('GRIDS', 'MAPS'), unit: 'CELLS' },
  ],
  REVERSE: [
    { name: 'MIRROR LAKE PHOTO', verb: 'MIRROR', unit: 'PIXELS' },
    { name: 'BACKSPIN RECORDS', verb: 'PLAY BACKWARDS:', unit: 'AUDIO SAMPLES' },
  ],
  'RUNNING TOTAL': [
    { name: 'NORTHGATE CREDIT', verb: 'RUNNING BALANCES FOR', unit: 'PAYMENTS' },
    { name: 'STRIDE FITNESS', verb: 'RUNNING TOTALS OF', unit: 'STEP COUNTS' },
  ],
  CHANGES: [
    { name: 'TREMOR WATCH', verb: 'CHANGES BETWEEN', unit: 'QUAKE READINGS' },
    { name: 'TIDEWATER PORT', verb: 'RISE AND FALL OF', unit: 'TIDE LEVELS' },
  ],
  REPLACE: [
    { name: 'BLACKLINE LEGAL', unit: 'DOCUMENT BYTES' },
    { name: 'PIXEL MEDICS', unit: 'SCREEN PIXELS' },
  ],
  OTHERS: [
    { name: 'TRUE NORTH RETAIL', verb: 'ALL-BUT-ONE TOTALS OF', unit: 'STORE SALES' },
    { name: 'HILLCREST LEAGUE', verb: 'REST-OF-TEAM TOTALS OF', unit: 'PLAYER SCORES' },
  ],
  'CHECKED COPY': [
    { name: 'IRONCLAD ARCHIVES', verb: 'COPY AND CHECK', unit: 'RECORDS' },
    { name: 'SAFE HARBOR BANK', verb: 'COPY AND VERIFY', unit: 'LEDGER ENTRIES' },
  ],
};

/** An unrolled job is the same job for the same clients, compiled for a CPU that starts two at once. */
const CLIENTS_OF: Readonly<Record<string, string>> = { 'UNROLLED SUM': 'SUM', 'UNROLLED CHECKSUM': 'CHECKSUM' };

/**
 * The program for `seed`, with data `bits` wide: named "<KIND> #<seed>" for
 * bytes, "<BITS>-BIT <KIND> #<seed>" for wider data (a contract stores only the
 * name, and the program is rebuilt from it). Always assembles and finishes
 * (checked). `kind` rebuilds a stored program as the kind it was made as.
 */
export function generateProgram(seed: number, kind?: string, bits: WordBits = 8): GeneratedProgram {
  const r = randomTools(seeded(seed));
  const L = layoutFor(bits);
  // One draw picks the kind, whichever kind is used, so the rest of the seed's choices stay the same as when the program was first made.
  const drawn = r.pick(DRAWN);
  const { kind: built, memory: items, answer, ...kernel } = (KERNELS.find((k) => k.kind === kind) ?? drawn).build(r, L);
  const client = r.pick(CLIENTS[CLIENTS_OF[built] ?? built]);
  const verb = typeof client.verb === 'function' ? client.verb(kernel.verb) : (client.verb ?? kernel.verb);
  // Wider data: its width in the job's words ("32-BIT DEPOSITS"), and each item laid out in memory as bytes.
  const unit = bits === 8 ? client.unit : `${bits}-BIT ${client.unit.replace(/ BYTES$/, ' WORDS')}`;
  const memory = new Uint8Array(items.length * L.bytes);
  items.forEach((value, i) => writeItem(memory, L.at(i), L.bytes, value));
  const name = `${bits === 8 ? '' : `${bits}-BIT `}${built} #${seed}`;
  const program: GeneratedProgram = {
    ...kernel,
    memory: Array.from(memory),
    answer: answer.map(({ address, value }) => ({ address: L.at(address), value })),
    verb,
    unit,
    client: client.name,
    name,
    ...(bits === 8 ? {} : { dataBits: bits }),
  };
  // A program that didn't finish would hang a song: trace() throws if it runs too long (the tests make sure it never does).
  trace(cpuFor(program), 400);
  return program;
}

/** The kind in a generated program's name ("32-BIT GRID SUM #4821" -> "GRID SUM"). */
export function kindOf(name: string): string {
  return name.replace(/^\d+-BIT /, '').replace(/ #\d+$/, '');
}

/** The seed in a generated program's name ("CHECKSUM #4821" -> 4821), if it is one. */
export function seedOf(name: string): number | undefined {
  const match = /#(\d+)$/.exec(name);
  return match ? Number(match[1]) : undefined;
}

/** How wide a generated program's data is, from its name ("32-BIT SUM #4821" -> 32; no width: bytes). */
export function bitsOf(name: string): WordBits {
  const bits = Number(/^(\d+)-BIT /.exec(name)?.[1] ?? 8);
  return bits === 16 || bits === 32 || bits === 64 ? bits : 8;
}
