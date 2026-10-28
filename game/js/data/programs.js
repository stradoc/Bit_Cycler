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
    },
];
//# sourceMappingURL=programs.js.map