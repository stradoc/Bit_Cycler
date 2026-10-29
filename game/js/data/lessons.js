export const TIER1_LESSON = {
    id: 'tier1',
    title: 'LESSON 1: HOW A CPU RUNS A PROGRAM',
    scene: 'pipeline',
    options: { singleCycle: true },
    pages: [
        {
            title: 'A CPU FOLLOWS INSTRUCTIONS',
            diagram: 'cpu',
            lines: [
                'A program is a list of tiny instructions.',
                'The CPU runs them one at a time, in order,',
                'unless an instruction tells it to jump.',
            ],
            analogy: 'Like a cook following a recipe, one step at a time.',
        },
        {
            title: 'THE CLOCK',
            diagram: 'clock',
            lines: [
                'A clock ticks to keep every part in step.',
                'Each tick is one CYCLE. Early CPUs ticked about',
                'a million times a second (1 MHz). Today: billions.',
            ],
            analogy: 'In this game, every BEAT of the music is one clock cycle.',
        },
        {
            title: 'THREE KINDS OF WORK',
            diagram: 'units',
            lines: [
                'Each instruction goes to the part of the CPU',
                'built for its job. These parts are called',
                'FUNCTIONAL UNITS.',
            ],
            analogy: 'Like a kitchen: one station chops, one cooks, one plates.',
        },
        {
            title: 'REGISTERS AND MEMORY',
            diagram: 'storage',
            lines: [
                'Registers (x0-x7) are tiny but instant.',
                'Memory is big but slower to reach.',
                'x0 is special: it is always 0.',
            ],
            analogy: 'Registers are your hands. Memory is the shelf behind you.',
        },
        {
            title: 'HOW IT PLAYS',
            diagram: 'highway',
            lines: [
                'Instructions fall toward the line.',
                'When one reaches it, press its unit ON THE BEAT:',
                'D = ALU      F = MEM      J = BRANCH',
            ],
            analogy: 'Wrong key or off the beat? The CPU STALLS and wastes a cycle.',
        },
        {
            title: 'YOUR SCORE',
            diagram: 'score',
            lines: [
                'CPI = average Cycles Per Instruction.',
                'A perfect run has CPI 1.00.',
                'Every stall adds a cycle and raises CPI.',
            ],
            analogy: 'Fewer wasted cycles = a faster program.',
        },
    ],
};
export const TIER2_LESSON = {
    id: 'tier2',
    title: 'LESSON 2: PIPELINING',
    scene: 'pipeline',
    pages: [
        {
            title: 'PIPELINING',
            diagram: 'laundry',
            lines: ['Tier 1 ran one instruction at a time.', 'A pipeline overlaps them, like laundry.'],
            analogy: 'Wash load 2 while load 1 dries.',
        },
        {
            title: 'FIVE STAGES',
            diagram: 'stages',
            lines: ['Each instruction moves one stage per beat.', 'Short stages let the clock run 4x faster.'],
            analogy: 'Five instructions in flight at once.',
        },
        {
            title: 'WAIT FOR YOUR DATA',
            diagram: 'stall',
            lines: ['If it needs a register the one ahead', "hasn't written yet, it must STALL (wait)."],
            analogy: 'Like waiting for an ingredient to finish cooking.',
        },
        {
            title: 'HOW IT PLAYS',
            diagram: 'pipeplay',
            lines: ['Routed notes slide down through EX, MEM, WB.', 'A LINK to a note below means: press SPACE.'],
            analogy: 'Route too early: FLUSH. Stall for nothing: a wasted cycle.',
        },
        {
            title: 'YOUR SCORE',
            diagram: 'speedup',
            lines: ['Stalls raise CPI, but cycles are 4x shorter,', 'so the pipeline still finishes first.'],
            analogy: 'The music builds as your pipeline fills.',
        },
    ],
};
export const TIER3_LESSON = {
    id: 'tier3',
    title: 'LESSON 3: FORWARDING',
    scene: 'pipeline',
    options: { forwarding: true },
    pages: [
        {
            title: 'HAND IT OVER',
            diagram: 'forward',
            lines: ['A result exists at the end of EXECUTE,', 'two stages before it is written back.'],
            analogy: 'Forwarding wires pass it straight to the next instruction.',
        },
        {
            title: 'LOADS STILL WAIT',
            diagram: 'loaduse',
            lines: ["A load's value comes out of MEMORY,", 'one stage too late: it still needs 1 stall.'],
            analogy: 'The load-use hazard: the one forwarding cannot fix.',
        },
        {
            title: 'HOW IT PLAYS',
            diagram: 'forwardplay',
            lines: ['Most links are gone: route straight away.', 'Watch forwarded values jump up the wire.'],
            analogy: 'A link now usually means a load: stall once.',
        },
        {
            title: 'YOUR SCORE',
            diagram: 'speedup3',
            lines: ['Fewer stalls means a lower CPI', 'at the same 4 MHz clock.'],
            analogy: 'Results compare you with tier 2 and tier 1.',
        },
    ],
};
export const TIER4_LESSON = {
    id: 'tier4',
    title: 'LESSON 4: BRANCH PREDICTION',
    scene: 'pipeline',
    options: { forwarding: true, guessing: true },
    pages: [
        {
            title: 'WHAT A BRANCH DOES',
            diagram: 'branchread',
            lines: ['bne x1, x2, loop means "Branch if Not Equal":', 'if x1 and x2 are different, jump back to loop:', '(TAKEN). If they are equal, carry on (NOT TAKEN).'],
            analogy: 'Like "keep stirring until the timer reaches zero".',
        },
        {
            title: 'HOW A LOOP ENDS',
            diagram: 'loopend',
            lines: ['Each pass adds 1 to x1. x2 holds where to stop (4).', 'While x1 is below 4, the branch jumps back.', 'When x1 reaches 4, it is the last pass: NOT TAKEN.'],
            analogy: 'A loop always repeats, except the very last time.',
        },
        {
            title: 'A FORK IN THE ROAD',
            diagram: 'fork',
            lines: ['The branch is decided in DECODE, but the next', 'instruction is fetched in that same beat,', 'before the CPU knows the answer.'],
            analogy: 'So the CPU has to guess which way the road goes.',
        },
        {
            title: 'GUESS RIGHT, GUESS WRONG',
            diagram: 'guess',
            lines: ['Right guess: the next instruction is already there.', 'Wrong guess: the one fetched is thrown away', '(flushed), and the right one starts a beat late.'],
            analogy: 'Until now the CPU always guessed NOT TAKEN.',
        },
        {
            title: 'HOW TO GUESS',
            diagram: 'howguess',
            lines: ['Usually: TAKEN. Loops repeat far more than they end.', 'Last pass: x1 is one below x2 in REGISTERS (its +1', 'is still on the way, marked <-EX or <-MEM): NOT TAKEN.'],
            analogy: 'The glow shows what it did last time; the registers show what it will do.',
        },
        {
            title: 'HOW IT PLAYS',
            diagram: 'guessplay',
            lines: ['Route a branch with J (guess NOT TAKEN)', 'or K (guess TAKEN).', 'The bright key is the hint; the dim one goes against it.'],
            analogy: 'Loops jump back every time except the last.',
        },
        {
            title: 'YOUR SCORE',
            diagram: 'speedup4',
            lines: ['Each right guess on a taken branch', 'saves the cycle a flush would cost.'],
            analogy: 'Results show how many guesses you got right.',
        },
    ],
};
export const TIER5_LESSON = {
    id: 'tier5',
    title: 'LESSON 5: A 1-BIT PREDICTOR',
    scene: 'pipeline',
    options: { forwarding: true, guessing: true, predictor: '1-bit', program: 'SUM GRID' },
    pages: [
        {
            title: 'THE CPU GUESSES FOR YOU',
            diagram: 'table1',
            lines: ['Real CPUs guess on their own. A predictor is a small', 'table with one bit per branch: what it did last time.', 'Fetch follows that guess.'],
            analogy: 'It does what you did on tier 4, without being asked.',
        },
        {
            title: 'A LOOP INSIDE A LOOP',
            diagram: 'grid',
            lines: ['SUM GRID adds 4 rows of 3 numbers. The inner loop', '(col) adds one row; x2 is the end of that row. The outer', 'loop (row) moves to the next row; x6 is the end of the grid.'],
            analogy: 'Like reading a page: across each line, then down to the next.',
        },
        {
            title: 'WHERE IT MISSES',
            diagram: 'misses1',
            lines: ['The col branch goes TAKEN, TAKEN, NOT TAKEN on every row.', 'A 1-bit predictor misses twice per row: at the end,', 'and again on the next row, because it remembers NOT.'],
            analogy: 'It only knows the last answer, not the pattern.',
        },
        {
            title: 'FOLLOW OR OVERRIDE',
            diagram: 'override',
            lines: ["The predictor's guess glows bright: press it to follow.", 'The dim key overrides it. A right override saves', 'a cycle; a wrong one flushes, like any wrong guess.'],
            analogy: 'Override only when you can see something it can\'t.',
        },
        {
            title: 'WHEN TO OVERRIDE',
            diagram: 'when1',
            lines: ['Work out the answer from the registers, as above.', 'If the glow disagrees, press the dim key to override.', 'x1 is where you are; x2 is the end of this row.'],
            analogy: 'The predictor only knows the past; you can read the registers.',
        },
    ],
};
export const TIER6_LESSON = {
    id: 'tier6',
    title: 'LESSON 6: A 2-BIT PREDICTOR',
    scene: 'pipeline',
    options: { forwarding: true, guessing: true, predictor: '2-bit', program: 'SUM GRID' },
    pages: [
        {
            title: 'IT TAKES TWO MISSES',
            diagram: 'counter2',
            lines: ['A 2-bit predictor keeps a counter from 0 to 3.', 'Taken: count up. Not taken: count down.', 'At 2 or 3 it guesses TAKEN; at 0 or 1, NOT TAKEN.'],
            analogy: 'One surprise only makes it unsure; two in a row change its mind.',
        },
        {
            title: 'WHY THAT HELPS LOOPS',
            diagram: 'misses2',
            lines: ['At the end of a row it misses, but that only drops it', 'from 3 to 2: still TAKEN. So the next row starts', 'with the right guess: one miss per row, not two.'],
            analogy: 'Same grid: 7 misses instead of 10.',
        },
        {
            title: 'SURE OR UNSURE',
            diagram: 'weak2',
            lines: ['A bright glow: the predictor is sure (0 or 3).', 'A dim glow: it is unsure (1 or 2).', 'In the listing, N n t T shows the counter: capitals are sure.'],
            analogy: 'Unsure or not, it is still only guessing from the past.',
        },
        {
            title: 'WHEN TO OVERRIDE',
            diagram: 'when2',
            lines: ['It still misses the end of every row: when x1 is one', 'below x2 (its +1 still on the way), override with J.', 'Same rules as before; it just needs fewer overrides.'],
            analogy: 'Beat it every row and you miss nothing.',
        },
        {
            title: 'YOUR SCORE',
            diagram: 'score2',
            lines: ['Results compare you with the predictor on its own.', 'Every right override is a cycle it would have lost.'],
            analogy: 'Real CPUs use bigger predictors, but they start here.',
        },
    ],
};
/** Shown before the first real song on a pipelined tier (where G / H overclock); then that tier starts. */
export const OVERCLOCK_LESSON = {
    id: 'overclock',
    title: 'OVERCLOCKING',
    scene: 'pipeline',
    pages: [
        {
            title: 'FASTER CLOCK, FASTER BEAT',
            diagram: 'overclock',
            lines: ['In a song, H overclocks the chip (+10%) and G slows it.', 'One beat is one clock cycle, so the song speeds up', 'and the program finishes sooner.'],
            analogy: 'Too fast to think? G underclocks (down to 50%): slower, but more CPU time.',
        },
        {
            title: 'THE POWER WALL',
            diagram: 'power',
            lines: ['A faster clock needs a higher voltage, and power', 'grows with voltage squared: +50% clock costs over', '2x the power. All that power turns into heat.'],
            analogy: 'This wall is why desktop clocks stopped climbing in the mid-2000s.',
        },
        {
            title: 'THERMAL THROTTLING',
            diagram: 'throttle',
            lines: ['At 95°C the chip throttles: back to its rated clock', '(the song slows down) until it cools to 80°C.', 'Stalls and bubbles use less power, so they run cooler.'],
            analogy: 'Smoke and flames warn you first: press G before it gets there.',
        },
        {
            title: 'HEAT WEARS THE CHIP',
            diagram: 'damage',
            lines: ['Every overheat damages the chip: its top clock drops 10%', '(150% -> 140%) and it overheats at a lower temperature,', 'so its new top clock is just as risky. Repair fixes both.'],
            analogy: 'Exaggerated: real chips wear slowly and throttle long before they burn.',
        },
    ],
};
export const LESSONS = {
    [TIER1_LESSON.id]: TIER1_LESSON,
    [TIER2_LESSON.id]: TIER2_LESSON,
    [TIER3_LESSON.id]: TIER3_LESSON,
    [TIER4_LESSON.id]: TIER4_LESSON,
    [TIER5_LESSON.id]: TIER5_LESSON,
    [TIER6_LESSON.id]: TIER6_LESSON,
    [OVERCLOCK_LESSON.id]: OVERCLOCK_LESSON,
};
//# sourceMappingURL=lessons.js.map