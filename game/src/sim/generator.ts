import type { KeyRegister, ProgramSpec } from '../data/programs.ts';
import { assemble } from './assembler.ts';
import { Cpu, trace } from './cpu.ts';

// Random programs for contracts. Each comes from a seed, so a contract only
// stores its name ("CHECKSUM #4821") and the program can be rebuilt anywhere.
// A family of small kernels (sum, checksum, count, copy, find, ...) with
// random sizes, data, register choices (x1 and x2 are always the loop's NEXT
// and END) and instruction order: the order changes where hazards fall, so
// the same kind of job can play differently.
// Inputs and outputs stay in addresses 0-31, the memory the panel shows.

/** The answer the program should leave in memory (tests check it). */
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

const x = (r: number) => `x${r}`;
/** The loop's two key registers: where it is (counting up from `from`) and the value that ends it. */
const loopKeys = (p: number, end: number, stop: number, next = "NEXT BYTE'S ADDRESS", from = 0): KeyRegister[] => [
  { reg: p, tag: 'NEXT', about: `${next}, FROM ${from}` },
  { reg: end, tag: 'END', about: `STOP WHEN ${x(p)} REACHES ${stop}` },
];
const bytes = (r: Random, n: number, low: number, high: number) => Array.from({ length: n }, () => r.int(low, high));
const wrap = (v: number) => ((v % 256) + 256) % 256;

/** Adds up n bytes (or XORs them: a checksum). Sometimes the pointer step comes before the add. */
function reduce(r: Random, op: 'add' | 'xor'): Kernel {
  const n = r.int(8, 14);
  const [p, end, acc, v] = r.registers(4);
  const out = r.int(8 + Math.max(0, n - 8), 15);
  const data = bytes(r, n, 1, 15);
  const early = r.chance(0.5); // the pointer step between the load and its use: no load-use stall
  const body = early
    ? [`lb   ${x(v)}, 0(${x(p)})`, `addi ${x(p)}, ${x(p)}, 1`, `${op.padEnd(4)} ${x(acc)}, ${x(acc)}, ${x(v)}`]
    : [`lb   ${x(v)}, 0(${x(p)})`, `${op.padEnd(4)} ${x(acc)}, ${x(acc)}, ${x(v)}`, `addi ${x(p)}, ${x(p)}, 1`];
  const total = data.reduce((a, b) => (op === 'add' ? wrap(a + b) : a ^ b), 0);
  return {
    kind: op === 'add' ? 'SUM' : 'CHECKSUM',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${n}`,
      `      addi ${x(acc)}, x0, 0`,
      `loop: ${body[0]}`,
      ...body.slice(1).map((line) => `      ${line}`),
      `      bne  ${x(p)}, ${x(end)}, loop`,
      `      sb   ${x(acc)}, ${out}(x0)`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: op === 'add' ? 'SUM' : 'CHECKSUM',
    unit: 'BYTES',
    roles: {
      [p]: 'the address of the next byte',
      [end]: `the end address (${n}): the loop stops when the address reaches it`,
      [acc]: op === 'add' ? 'the running sum' : 'the running checksum (each byte XORed in)',
      [v]: 'the byte just loaded',
    },
    keys: loopKeys(p, end, n),
    memoryNote: `Addresses 0-${n - 1} hold the data. The ${op === 'add' ? 'sum' : 'checksum'} (${total}) goes to address ${out}.`,
    answer: [{ address: out, value: total }],
  };
}

/** Counts the bytes equal to a value: a forward branch skips the count when it doesn't match. */
function count(r: Random): Kernel {
  const n = r.int(8, 14);
  const [p, end, c, k, v] = r.registers(5);
  const target = r.int(0, 3);
  const data = bytes(r, n, 0, 3);
  const out = r.int(8 + Math.max(0, n - 8), 15);
  const matches = data.filter((d) => d === target).length;
  return {
    kind: 'COUNT',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${n}`,
      `      addi ${x(c)}, x0, 0`,
      `      addi ${x(k)}, x0, ${target}`,
      `loop: lb   ${x(v)}, 0(${x(p)})`,
      `      bne  ${x(v)}, ${x(k)}, skip`,
      `      addi ${x(c)}, ${x(c)}, 1`,
      `skip: addi ${x(p)}, ${x(p)}, 1`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
      `      sb   ${x(c)}, ${out}(x0)`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: `COUNT ${target}s IN`,
    unit: 'BYTES',
    roles: {
      [p]: 'the address of the next byte',
      [end]: `the end address (${n})`,
      [c]: `how many ${target}s so far`,
      [k]: `the value being counted (${target})`,
      [v]: 'the byte just loaded',
    },
    keys: loopKeys(p, end, n),
    memoryNote: `Addresses 0-${n - 1} hold the data. The count of ${target}s (${matches}) goes to address ${out}.`,
    answer: [{ address: out, value: matches }],
  };
}

/** Copies n bytes from 0.. to 8.. (or doubles them in place). */
function copy(r: Random, double: boolean): Kernel {
  const n = double ? r.int(8, 15) : r.int(5, 8);
  const [p, end, v] = r.registers(3);
  const data = bytes(r, n, 1, double ? 60 : 99);
  const to = double ? 0 : 8;
  return {
    kind: double ? 'DOUBLE' : 'COPY',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${n}`,
      `loop: lb   ${x(v)}, 0(${x(p)})`,
      ...(double ? [`      add  ${x(v)}, ${x(v)}, ${x(v)}`] : []),
      `      sb   ${x(v)}, ${to}(${x(p)})`,
      `      addi ${x(p)}, ${x(p)}, 1`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: double ? 'DOUBLE' : 'COPY',
    unit: 'BYTES',
    roles: { [p]: 'the address of the next byte', [end]: `the end address (${n})`, [v]: double ? 'the byte being doubled' : 'the byte being copied' },
    keys: loopKeys(p, end, n),
    memoryNote: double
      ? `Addresses 0-${n - 1} hold the data; each byte is doubled where it is.`
      : `Addresses 0-${n - 1} are copied to addresses 8-${7 + n}.`,
    answer: data.map((d, i) => ({ address: to + i, value: double ? wrap(d * 2) : d })),
  };
}

/**
 * Adds a second array into a first (0..), pair by pair. The second starts at
 * 8, or half the time at 16: a cache-full away, so each pair's two bytes need
 * the same cache line and keep pushing each other out (conflict misses).
 */
function addArrays(r: Random): Kernel {
  const n = r.int(5, 8);
  const [p, end, a, b] = r.registers(4);
  const first = bytes(r, n, 1, 50);
  const second = bytes(r, n, 1, 50);
  const at = r.chance(0.5) ? 16 : 8;
  const memory = [...first, ...Array(at - n).fill(0), ...second];
  return {
    kind: 'ADD ARRAYS',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${n}`,
      `loop: lb   ${x(a)}, 0(${x(p)})`,
      `      lb   ${x(b)}, ${at}(${x(p)})`,
      `      add  ${x(a)}, ${x(a)}, ${x(b)}`,
      `      sb   ${x(a)}, 0(${x(p)})`,
      `      addi ${x(p)}, ${x(p)}, 1`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory,
    elements: n,
    verb: 'ADD PAIRS OF',
    unit: 'BYTES',
    roles: { [p]: 'which pair (0, 1, 2 ...)', [end]: `how many pairs (${n})`, [a]: 'a byte from the first array, then the sum', [b]: 'a byte from the second array' },
    keys: loopKeys(p, end, n, 'WHICH PAIR IS NEXT'),
    memoryNote:
      `Addresses 0-${n - 1} and ${at}-${at + n - 1} hold two arrays; each sum replaces the byte in the first.` +
      (at === 16 ? ' They are 16 bytes apart, so each pair needs the same cache line.' : ''),
    answer: first.map((d, i) => ({ address: i, value: wrap(d + second[i]) })),
  };
}

/** Finds where a value first appears: the loop can end early (beq out). */
function find(r: Random): Kernel {
  const n = r.int(8, 14);
  const [p, end, t, v] = r.registers(4);
  const data = bytes(r, n, 1, 9);
  // The first match is at least 5 bytes in, so the search has some work to do.
  const first = r.int(5, n - 1);
  const target = data[first];
  for (let i = 0; i < first; i++) if (data[i] === target) data[i] = (target % 9) + 1;
  const out = r.int(8 + Math.max(0, n - 8), 15);
  return {
    kind: 'FIND',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${n}`,
      `      addi ${x(t)}, x0, ${target}`,
      `loop: lb   ${x(v)}, 0(${x(p)})`,
      `      beq  ${x(v)}, ${x(t)}, found`,
      `      addi ${x(p)}, ${x(p)}, 1`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
      `found: sb  ${x(p)}, ${out}(x0)`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: `FIND A ${target} IN`,
    unit: 'BYTES',
    roles: { [p]: 'the address being checked', [end]: `the end address (${n})`, [t]: `the value searched for (${target})`, [v]: 'the byte just loaded' },
    keys: loopKeys(p, end, n),
    memoryNote: `Addresses 0-${n - 1} hold the data. Where the first ${target} is (address ${first}) goes to address ${out}.`,
    answer: [{ address: out, value: first }],
  };
}

/** Fills n bytes with a value: stores only. */
function fill(r: Random): Kernel {
  const n = r.int(8, 16);
  const [p, end, v] = r.registers(3);
  const value = r.int(1, 99);
  const start = r.int(0, 16 - n);
  return {
    kind: 'FILL',
    source: [
      `      addi ${x(p)}, x0, ${start}`,
      `      addi ${x(end)}, x0, ${start + n}`,
      `      addi ${x(v)}, x0, ${value}`,
      `loop: sb   ${x(v)}, 0(${x(p)})`,
      `      addi ${x(p)}, ${x(p)}, 1`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: [],
    elements: n,
    verb: `FILL WITH ${value}:`,
    unit: 'BYTES',
    roles: { [p]: 'the address being filled', [end]: `the address to stop at (${start + n})`, [v]: `the value written (${value})` },
    keys: loopKeys(p, end, start + n, 'NEXT ADDRESS TO FILL', start),
    memoryNote: `Addresses ${start}-${start + n - 1} are filled with ${value}.`,
    answer: Array.from({ length: n }, (_, i) => ({ address: start + i, value })),
  };
}

/** Sums a rows x cols grid with a loop inside a loop. */
function grid(r: Random): Kernel {
  // Up to 15 cells, so the sum still fits at address 15.
  const [rows, cols] = r.pick([[3, 3], [3, 4], [4, 3], [3, 5], [5, 3]] as const);
  const cells = rows * cols;
  const [p, rowEnd, acc, v, gridEnd] = r.registers(5);
  const data = bytes(r, cells, 1, 9);
  const out = r.int(Math.max(12, cells), 15);
  const total = wrap(data.reduce((a, b) => a + b, 0));
  return {
    kind: 'GRID SUM',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(acc)}, x0, 0`,
      `      addi ${x(gridEnd)}, x0, ${cells}`,
      `row:  addi ${x(rowEnd)}, ${x(p)}, ${cols}`,
      `col:  lb   ${x(v)}, 0(${x(p)})`,
      `      add  ${x(acc)}, ${x(acc)}, ${x(v)}`,
      `      addi ${x(p)}, ${x(p)}, 1`,
      `      bne  ${x(p)}, ${x(rowEnd)}, col`,
      `      bne  ${x(p)}, ${x(gridEnd)}, row`,
      `      sb   ${x(acc)}, ${out}(x0)`,
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
      [gridEnd]: `the end of the grid (${cells})`,
    },
    keys: [
      { reg: p, tag: 'NEXT', about: "NEXT BYTE'S ADDRESS, FROM 0" },
      { reg: rowEnd, tag: 'END', about: `END OF THIS ROW (${x(p)} + ${cols})` },
      { reg: gridEnd, tag: 'GRID', about: `END OF THE GRID: STOP AT ${cells}` },
    ],
    memoryNote: `Addresses 0-${cells - 1} hold ${rows} rows of ${cols}. The sum (${total}) goes to address ${out}.`,
    answer: [{ address: out, value: total }],
  };
}


/** Reverses n bytes where they are: one address walks up from the start, another down from the end, and each pair is swapped. */
function reverse(r: Random): Kernel {
  const n = 2 * r.int(4, 7);
  const [p, end, q, a, b] = r.registers(5);
  const data = bytes(r, n, 1, 99);
  return {
    kind: 'REVERSE',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${n / 2}`,
      `      addi ${x(q)}, x0, ${n - 1}`,
      `loop: lb   ${x(a)}, 0(${x(p)})`,
      `      lb   ${x(b)}, 0(${x(q)})`,
      `      sb   ${x(b)}, 0(${x(p)})`,
      `      sb   ${x(a)}, 0(${x(q)})`,
      `      addi ${x(p)}, ${x(p)}, 1`,
      `      addi ${x(q)}, ${x(q)}, -1`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: 'REVERSE',
    unit: 'BYTES',
    roles: {
      [p]: 'the address at the front, counting up',
      [end]: `the middle (${n / 2}): the loop stops when the front reaches it`,
      [q]: 'the address at the back, counting down',
      [a]: 'the byte from the front',
      [b]: 'the byte from the back',
    },
    keys: [...loopKeys(p, end, n / 2, 'FRONT ADDRESS'), { reg: q, tag: 'BACK', about: `BACK ADDRESS, FROM ${n - 1} DOWN` }],
    memoryNote: `Addresses 0-${n - 1} hold the data; the first and last swap, then the second and second-last, up to the middle.`,
    answer: [...data].reverse().map((value, address) => ({ address, value })),
  };
}

/** Keeps a running total and stores it after every byte (a bank statement's balance column). */
function runningTotal(r: Random): Kernel {
  const n = r.int(6, 12);
  const [p, end, acc, v] = r.registers(4);
  const data = bytes(r, n, 1, 20);
  // Half the time the address moves on before the store, which then reaches one byte less far.
  const early = r.chance(0.5);
  const body = early
    ? [`add  ${x(acc)}, ${x(acc)}, ${x(v)}`, `addi ${x(p)}, ${x(p)}, 1`, `sb   ${x(acc)}, 15(${x(p)})`]
    : [`add  ${x(acc)}, ${x(acc)}, ${x(v)}`, `sb   ${x(acc)}, 16(${x(p)})`, `addi ${x(p)}, ${x(p)}, 1`];
  const totals = data.map((_, i) => wrap(data.slice(0, i + 1).reduce((a, b) => a + b, 0)));
  return {
    kind: 'RUNNING TOTAL',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${n}`,
      `      addi ${x(acc)}, x0, 0`,
      `loop: lb   ${x(v)}, 0(${x(p)})`,
      ...body.map((line) => `      ${line}`),
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: 'RUNNING TOTALS OF',
    unit: 'BYTES',
    roles: { [p]: 'the address of the next byte', [end]: `the end address (${n})`, [acc]: 'the total so far', [v]: 'the byte just loaded' },
    keys: loopKeys(p, end, n),
    memoryNote: `Addresses 0-${n - 1} hold the data. The total after each byte goes to addresses 16-${15 + n}.`,
    answer: totals.map((value, i) => ({ address: 16 + i, value })),
  };
}

/** The change from each byte to the next (readings that rise and fall): a subtraction that needs the byte before. */
function changes(r: Random): Kernel {
  const n = r.int(7, 13);
  const [p, end, prev, v, d] = r.registers(5);
  // Readings that drift: each one a little above or below the last.
  const data = [r.int(20, 40)];
  for (let i = 1; i < n; i++) data.push(Math.max(1, Math.min(99, data[i - 1] + r.int(-6, 9))));
  return {
    kind: 'CHANGES',
    source: [
      `      addi ${x(p)}, x0, 1`,
      `      addi ${x(end)}, x0, ${n}`,
      `      lb   ${x(prev)}, 0(x0)`,
      `loop: lb   ${x(v)}, 0(${x(p)})`,
      `      sub  ${x(d)}, ${x(v)}, ${x(prev)}`,
      `      sb   ${x(d)}, 15(${x(p)})`,
      `      addi ${x(prev)}, ${x(v)}, 0`,
      `      addi ${x(p)}, ${x(p)}, 1`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: data,
    elements: n - 1,
    verb: 'CHANGES BETWEEN',
    unit: 'BYTES',
    roles: {
      [p]: 'the address of the next byte',
      [end]: `the end address (${n})`,
      [prev]: 'the byte before it',
      [v]: 'the byte just loaded',
      [d]: 'how much it changed (a fall wraps around: 1 less than 0 is 255)',
    },
    keys: loopKeys(p, end, n, "NEXT BYTE'S ADDRESS", 1),
    memoryNote: `Addresses 0-${n - 1} hold readings. Each change from one to the next goes to addresses 16-${14 + n} (a fall shows as 256 minus it).`,
    answer: data.slice(1).map((value, i) => ({ address: 16 + i, value: wrap(value - data[i]) })),
  };
}

/** Replaces every byte equal to one value with another: a branch skips the store when it doesn't match. */
function replace(r: Random): Kernel {
  const n = r.int(8, 14);
  const [p, end, from, to, v] = r.registers(5);
  const target = r.int(0, 3);
  const value = r.int(5, 9);
  const data = bytes(r, n, 0, 3);
  return {
    kind: 'REPLACE',
    source: [
      `      addi ${x(p)}, x0, 0`,
      `      addi ${x(end)}, x0, ${n}`,
      `      addi ${x(from)}, x0, ${target}`,
      `      addi ${x(to)}, x0, ${value}`,
      `loop: lb   ${x(v)}, 0(${x(p)})`,
      `      bne  ${x(v)}, ${x(from)}, skip`,
      `      sb   ${x(to)}, 0(${x(p)})`,
      `skip: addi ${x(p)}, ${x(p)}, 1`,
      `      bne  ${x(p)}, ${x(end)}, loop`,
    ].join('\n'),
    memory: data,
    elements: n,
    verb: `REPLACE ${target}s WITH ${value}s IN`,
    unit: 'BYTES',
    roles: {
      [p]: 'the address of the next byte',
      [end]: `the end address (${n})`,
      [from]: `the value to replace (${target})`,
      [to]: `what replaces it (${value})`,
      [v]: 'the byte just loaded',
    },
    keys: loopKeys(p, end, n),
    memoryNote: `Addresses 0-${n - 1} hold the data; every ${target} becomes ${value} where it is.`,
    answer: data.map((d, address) => ({ address, value: d === target ? value : d })),
  };
}

/**
 * Every kind of program, by the name its programs carry. A contract stores
 * only its program's name ("SUM #4821"), and the program is rebuilt from it,
 * so a kind's place here can change but its name can't: the rebuild finds the
 * kind by name (a list that grows would otherwise turn old jobs into new kinds).
 */
const KERNELS: readonly { readonly kind: string; readonly build: (r: Random) => Kernel }[] = [
  { kind: 'SUM', build: (r) => reduce(r, 'add') },
  { kind: 'CHECKSUM', build: (r) => reduce(r, 'xor') },
  { kind: 'COUNT', build: count },
  { kind: 'COPY', build: (r) => copy(r, false) },
  { kind: 'DOUBLE', build: (r) => copy(r, true) },
  { kind: 'ADD ARRAYS', build: addArrays },
  { kind: 'FIND', build: find },
  { kind: 'FILL', build: fill },
  { kind: 'GRID SUM', build: grid },
  { kind: 'REVERSE', build: reverse },
  { kind: 'RUNNING TOTAL', build: runningTotal },
  { kind: 'CHANGES', build: changes },
  { kind: 'REPLACE', build: replace },
];

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
};

/**
 * The program for `seed`, named "<KIND> #<seed>". Always assembles and finishes (checked).
 * `kind` rebuilds a stored program (from its name) as the kind it was made as.
 */
export function generateProgram(seed: number, kind?: string): GeneratedProgram {
  const r = randomTools(seeded(seed));
  // One draw picks the kind, whichever kind is used, so the rest of the seed's choices stay the same as when the program was first made.
  const drawn = r.pick(KERNELS);
  const { kind: built, ...kernel } = (KERNELS.find((k) => k.kind === kind) ?? drawn).build(r);
  const client = r.pick(CLIENTS[built]);
  const verb = typeof client.verb === 'function' ? client.verb(kernel.verb) : (client.verb ?? kernel.verb);
  const program = { ...kernel, verb, unit: client.unit, client: client.name, name: `${built} #${seed}` };
  // A program that didn't finish would hang a song: trace() throws if it runs too long (the tests make sure it never does).
  trace(new Cpu(assemble(program.source, 8), 8, program.memory), 400);
  return program;
}

/** The kind in a generated program's name ("GRID SUM #4821" -> "GRID SUM"). */
export function kindOf(name: string): string {
  return name.replace(/ #\d+$/, '');
}

/** The seed in a generated program's name ("CHECKSUM #4821" -> 4821), if it is one. */
export function seedOf(name: string): number | undefined {
  const match = /#(\d+)$/.exec(name);
  return match ? Number(match[1]) : undefined;
}
