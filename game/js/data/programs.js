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
        roles: {
            1: 'the address of the next number to add',
            2: 'the end address (4): the loop stops when x1 reaches it',
            3: 'the running sum',
            4: 'the number just loaded from memory',
        },
        memoryNote: 'Addresses 0-3 hold the numbers to add (3, 5, 7, 2). The sum is stored at address 8.',
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
        roles: {
            1: 'the address of the next number to add',
            2: 'the end of the current row: the inner loop stops when x1 reaches it',
            3: 'the running sum',
            4: 'the number just loaded from memory',
            6: 'the end of the grid (12): the outer loop stops when x1 reaches it',
        },
        memoryNote: 'Addresses 0-11 hold a grid of 4 rows x 3 numbers. The sum (57) is stored at address 12.',
    },
];
export function programByName(name) {
    return PROGRAMS.find((program) => program.name === name) ?? PROGRAMS[0];
}
//# sourceMappingURL=programs.js.map