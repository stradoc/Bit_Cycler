// Short explanations shown when part of the screen is clicked during a replay.
// One idea each, in plain words; keep bodies under ~180 characters so they fit the box.
export const GLOSSARY = {
    IF: {
        title: 'FETCH (IF)',
        body: 'The CPU reads the next instruction from memory. The program counter (PC) says which one comes next.',
    },
    ID: {
        title: 'DECODE (ID)',
        body: 'The instruction is decoded and its registers are read. Hazards are caught here: if a value it needs is not ready, it stalls in DECODE.',
    },
    EX: {
        title: 'EXECUTE (EX)',
        body: 'The ALU does the work: adds, subtracts, compares, or works out the memory address for a load or store.',
    },
    MEM: {
        title: 'MEMORY (MEM)',
        body: 'Loads read a byte from memory and stores write one. Other instructions just pass through this stage.',
    },
    WB: {
        title: 'WRITE BACK (WB)',
        body: 'The result is written into its register. Only now does the register file hold the new value.',
    },
    ALU: {
        title: 'ALU',
        body: 'The Arithmetic Logic Unit does math and logic: add, sub, addi, and, or, xor.',
    },
    MEMORY_UNIT: {
        title: 'MEMORY UNIT',
        body: 'Moves bytes between registers and memory: lb loads a byte into a register, sb stores one back.',
    },
    BRANCH: {
        title: 'BRANCH UNIT',
        body: 'Compares two registers and decides where the program goes next: beq jumps if they are equal, bne if they are not.',
    },
    STALL: {
        title: 'STALL',
        body: 'A stall holds the instruction in DECODE for one cycle and sends an empty bubble down the pipeline, giving a missing value time to arrive.',
    },
    REGISTERS: {
        title: 'REGISTERS',
        body: 'Tiny, instant storage inside the CPU. Instructions read and write them directly.',
    },
    MEMORY: {
        title: 'MEMORY',
        body: 'Main memory (RAM): 256 bytes here; addresses 0-31 shown, 8 per row in hex (two 4-byte blocks). Much bigger than the registers, but a trip takes about 60 ns, however fast the clock.',
    },
    RAM: {
        title: 'THE MEMORY WALL',
        body: 'A trip to RAM takes about 60 ns (the textbook gives 50-70 ns for DRAM), however fast the clock. A faster clock just means more cycles waiting: 1 at 16 MHz, 240 at 4 GHz.',
    },
    CACHE: {
        title: 'L1 CACHE',
        body: 'A tiny, fast memory beside the CPU: 4 lines, each holding one 4-byte block. A load whose block is there is a HIT (no wait); a MISS brings the whole block in from RAM.',
    },
    LOOKUP: {
        title: 'CACHE LOOKUP',
        body: 'An address splits into tttt ii oo: ii picks the line, tttt (the tag) says which block is in it, oo is the byte. Valid line + same tag = HIT. Stores go out through a write buffer.',
    },
    BUS: {
        title: 'WRITE-BACK BUS',
        body: 'Wires carrying results out of the pipeline: register results from WRITE BACK, stored bytes from MEMORY. The panel only changes when a value arrives.',
    },
    PROGRAM: {
        title: 'PROGRAM',
        body: "The instructions in order. '>' marks the one in DECODE, and the tags show which stage each line is in.",
    },
    THROUGHPUT: {
        title: 'THROUGHPUT',
        body: 'Instructions finished per cycle over the last 8 cycles. 1.00 means the pipeline is full and one instruction finishes every cycle. A superscalar CPU can reach 2.00: two a cycle.',
    },
    STATS: {
        title: 'CYCLES AND CPI',
        body: 'CPI = cycles per instruction so far. Filling the pipeline, stalls and flushes all push it above 1.00.',
    },
    FORWARDING: {
        title: 'FORWARDING',
        body: 'With forwarding, a result leaving EXECUTE or MEMORY is handed straight to the next instruction instead of waiting for WRITE BACK.',
    },
    PREDICTION: {
        title: 'BRANCH PREDICTION',
        body: 'The next instruction is fetched while a branch is still being decided, so the CPU guesses: right costs nothing, wrong flushes one instruction.',
    },
    HISTORY: {
        title: 'BRANCH HISTORY',
        body: 'What this branch did each time: T = taken (jumped back), N = not taken. Real CPUs remember this; guessing whatever it did last time is a 1-bit predictor.',
    },
    PREDICTOR_1BIT: {
        title: '1-BIT PREDICTOR',
        body: 'One bit per branch: what it did last time. Fetch follows that guess, so a loop is guessed right until it ends.',
    },
    PREDICTOR_2BIT: {
        title: '2-BIT PREDICTOR',
        body: 'A counter per branch, 0-3: taken counts up, not taken down; 2-3 guess taken. One surprise only weakens it (N n t T).',
    },
    CLOCK: {
        title: 'CLOCK SPEED',
        body: 'Cycles per second; one beat is one cycle. Overclocking runs the chip faster than it is rated for: the song speeds up and the program finishes sooner.',
    },
    HEAT: {
        title: 'TEMPERATURE',
        body: 'Power grows with voltage squared times the clock, and a faster clock needs more voltage. At 95°C it overheats and stops its clock (real chips do this in bursts of microseconds): nothing runs until it cools to 80°C, and that time still counts. The heat wears it: its top clock drops 10% and it overheats sooner (88°C at 140%; worn out, 65°C, so even 100% overheats) until repaired. The gauge marks where it overheats now.',
    },
    SINGLE_CYCLE: {
        title: 'SINGLE-CYCLE CPU',
        body: 'Each instruction does all five steps (fetch, decode, execute, memory, write back) in one long clock cycle, then the next one starts. Nothing waits, but the cycle must be long enough for the slowest instruction.',
    },
};
//# sourceMappingURL=glossary.js.map