import { generateProgram, kindOf, seedOf } from '../sim/generator.js';
export const PROGRAMS = [
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
const generated = new Map();
/** A fixed program by name, or a contract's generated one ("CHECKSUM #4821"), rebuilt from its seed. */
export function programByName(name) {
    const fixed = PROGRAMS.find((program) => program.name === name);
    if (fixed)
        return fixed;
    const seed = seedOf(name);
    if (seed === undefined)
        return PROGRAMS[0];
    let spec = generated.get(name);
    if (!spec) {
        try {
            spec = generateProgram(seed, kindOf(name));
        }
        catch {
            spec = PROGRAMS[0]; // never expected (tests check thousands of seeds), but a song must never hang
        }
        generated.set(name, spec);
    }
    return spec;
}
//# sourceMappingURL=programs.js.map