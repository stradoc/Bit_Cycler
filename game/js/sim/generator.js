import { assemble } from './assembler.js';
import { Cpu, trace } from './cpu.js';
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
const x = (r) => `x${r}`;
/** The loop's two key registers: where it is (counting up from `from`) and the value that ends it. */
const loopKeys = (p, end, stop, next = "NEXT BYTE'S ADDRESS", from = 0) => [
    { reg: p, tag: 'NEXT', about: `${next}, FROM ${from}` },
    { reg: end, tag: 'END', about: `STOP WHEN ${x(p)} REACHES ${stop}` },
];
const bytes = (r, n, low, high) => Array.from({ length: n }, () => r.int(low, high));
const wrap = (v) => ((v % 256) + 256) % 256;
/** Adds up n bytes (or XORs them: a checksum). Sometimes the pointer step comes before the add. */
function reduce(r, op) {
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
function count(r) {
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
function copy(r, double) {
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
function addArrays(r) {
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
        memoryNote: `Addresses 0-${n - 1} and ${at}-${at + n - 1} hold two arrays; each sum replaces the byte in the first.` +
            (at === 16 ? ' They are 16 bytes apart, so each pair needs the same cache line.' : ''),
        answer: first.map((d, i) => ({ address: i, value: wrap(d + second[i]) })),
    };
}
/** Finds where a value first appears: the loop can end early (beq out). */
function find(r) {
    const n = r.int(8, 14);
    const [p, end, t, v] = r.registers(4);
    const data = bytes(r, n, 1, 9);
    // The first match is at least 5 bytes in, so the search has some work to do.
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
function fill(r) {
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
function grid(r) {
    // Up to 15 cells, so the sum still fits at address 15.
    const [rows, cols] = r.pick([[3, 3], [3, 4], [4, 3], [3, 5], [5, 3]]);
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
const KERNELS = [
    (r) => reduce(r, 'add'),
    (r) => reduce(r, 'xor'),
    count,
    (r) => copy(r, false),
    (r) => copy(r, true),
    addArrays,
    find,
    fill,
    grid,
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
};
export function generateProgram(seed) {
    const r = randomTools(seeded(seed));
    const { kind, ...kernel } = r.pick(KERNELS)(r);
    const client = r.pick(CLIENTS[kind]);
    const verb = typeof client.verb === 'function' ? client.verb(kernel.verb) : (client.verb ?? kernel.verb);
    const program = { ...kernel, verb, unit: client.unit, client: client.name, name: `${kind} #${seed}` };
    // A program that didn't finish would hang a song: trace() throws if it runs too long (the tests make sure it never does).
    trace(new Cpu(assemble(program.source, 8), 8, program.memory), 400);
    return program;
}
/** The seed in a generated program's name ("CHECKSUM #4821" -> 4821), if it is one. */
export function seedOf(name) {
    const match = /#(\d+)$/.exec(name);
    return match ? Number(match[1]) : undefined;
}
//# sourceMappingURL=generator.js.map