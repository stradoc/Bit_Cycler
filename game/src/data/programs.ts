export type ProgramSpec = {
  readonly name: string;
  readonly source: string;
  /** Initial memory contents, starting at address 0. */
  readonly memory: readonly number[];
  /** What each register is used for (shown when a register is clicked in a replay). */
  readonly roles?: Readonly<Record<number, string>>;
  /** What the interesting parts of memory hold (shown when memory is clicked). */
  readonly memoryNote?: string;
};

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
    roles: {
      1: 'the address of the next number to add',
      2: 'the end address (4): the loop stops when x1 reaches it',
      3: 'the running sum',
      4: 'the number just loaded from memory',
    },
    memoryNote: 'Addresses 0-3 hold the numbers to add (3, 5, 7, 2). The sum is stored at address 8.',
  },
];
