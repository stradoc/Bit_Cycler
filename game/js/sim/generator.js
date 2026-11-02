import { cpuFor, trace, wrapTo, writeItem } from './cpu.js';
import { memoryOps } from './isa.js';
/** A small, fast, seeded random number generator (mulberry32). */
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function randomTools(next) {
    const int = (low, high) => low + Math.floor(next() * (high - low + 1));
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
/** How much bigger the numbers are in wider data, so they need the width: a 64-bit job's numbers don't fit in 32 bits. */
const DATA_SCALE = { 8: 1, 16: 100, 32: 100_000, 64: 1_000_000_000 };
function layoutFor(bits) {
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
const op = (name) => name.padEnd(4);
const x = (r) => `x${r}`;
/** The loop's two key registers: where it is (counting up from `from`) and the value that ends it. */
const loopKeys = (L, p, end, stop, next = `NEXT ${L.noun.toUpperCase()}'S ADDRESS`, from = 0) => [
    { reg: p, tag: 'NEXT', about: `${next}, FROM ${from}` },
    { reg: end, tag: 'END', about: `STOP WHEN ${x(p)} REACHES ${stop}` },
];
const bytes = (r, n, low, high) => Array.from({ length: n }, () => r.int(low, high));
/** Adds up n bytes (or XORs them: a checksum). Sometimes the pointer step comes before the add. */
function reduce(r, L, kind) {
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
function count(r, L) {
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
function copy(r, L, double) {
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
function addArrays(r, L) {
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
        memoryNote: `Addresses ${L.span(0, n)} and ${L.span(at, n)} hold two arrays${L.sized(n)}; each sum replaces the ${L.noun} in the first.` +
            (at === 16 && L.bits === 8 ? ' They are 16 bytes apart, so each pair needs the same cache line.' : ''),
        answer: first.map((d, i) => ({ address: i, value: L.wrap(d + second[i]) })),
    };
}
/** Finds where a value first appears: the loop can end early (beq out). */
function find(r, L) {
    const n = r.int(8, 14);
    const [p, end, t, v] = r.registers(4);
    // Small values at any width: the one searched for is written in the program (addi).
    const data = bytes(r, n, 1, 9);
    // The first match is at least 5 items in, so the search has some work to do.
    const first = r.int(5, n - 1);
    const target = data[first];
    for (let i = 0; i < first; i++)
        if (data[i] === target)
            data[i] = (target % 9) + 1;
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
function fill(r, L) {
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
function grid(r, L) {
    // Up to 15 cells, so the sum still fits at item 15.
    const [rows, cols] = r.pick([[3, 3], [3, 4], [4, 3], [3, 5], [5, 3]]);
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
function reverse(r, L) {
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
function runningTotal(r, L) {
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
function changes(r, L) {
    const n = r.int(7, 13);
    const [p, end, prev, v, d] = r.registers(5);
    // Readings that drift: each one a little above or below the last (in the data's own range).
    const scale = DATA_SCALE[L.bits];
    const data = [r.int(20, 40) * scale];
    for (let i = 1; i < n; i++)
        data.push(Math.max(scale, Math.min(99 * scale, data[i - 1] + r.int(-6, 9) * scale)));
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
function replace(r, L) {
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
 * Every kind of program, by the name its programs carry. A contract stores
 * only its program's name ("SUM #4821"), and the program is rebuilt from it,
 * so a kind's place here can change but its name can't: the rebuild finds the
 * kind by name (a list that grows would otherwise turn old jobs into new kinds).
 */
const KERNELS = [
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
];
const CLIENTS = {
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
 * The program for `seed`, with data `bits` wide: named "<KIND> #<seed>" for
 * bytes, "<BITS>-BIT <KIND> #<seed>" for wider data (a contract stores only the
 * name, and the program is rebuilt from it). Always assembles and finishes
 * (checked). `kind` rebuilds a stored program as the kind it was made as.
 */
export function generateProgram(seed, kind, bits = 8) {
    const r = randomTools(seeded(seed));
    const L = layoutFor(bits);
    // One draw picks the kind, whichever kind is used, so the rest of the seed's choices stay the same as when the program was first made.
    const drawn = r.pick(KERNELS);
    const { kind: built, memory: items, answer, ...kernel } = (KERNELS.find((k) => k.kind === kind) ?? drawn).build(r, L);
    const client = r.pick(CLIENTS[built]);
    const verb = typeof client.verb === 'function' ? client.verb(kernel.verb) : (client.verb ?? kernel.verb);
    // Wider data: its width in the job's words ("32-BIT DEPOSITS"), and each item laid out in memory as bytes.
    const unit = bits === 8 ? client.unit : `${bits}-BIT ${client.unit.replace(/ BYTES$/, ' WORDS')}`;
    const memory = new Uint8Array(items.length * L.bytes);
    items.forEach((value, i) => writeItem(memory, L.at(i), L.bytes, value));
    const name = `${bits === 8 ? '' : `${bits}-BIT `}${built} #${seed}`;
    const program = {
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
export function kindOf(name) {
    return name.replace(/^\d+-BIT /, '').replace(/ #\d+$/, '');
}
/** The seed in a generated program's name ("CHECKSUM #4821" -> 4821), if it is one. */
export function seedOf(name) {
    const match = /#(\d+)$/.exec(name);
    return match ? Number(match[1]) : undefined;
}
/** How wide a generated program's data is, from its name ("32-BIT SUM #4821" -> 32; no width: bytes). */
export function bitsOf(name) {
    const bits = Number(/^(\d+)-BIT /.exec(name)?.[1] ?? 8);
    return bits === 16 || bits === 32 || bits === 64 ? bits : 8;
}
//# sourceMappingURL=generator.js.map