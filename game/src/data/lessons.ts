import type { TierOptions } from './tiers.ts';

// Briefings shown before a concept is played. Each page teaches ONE idea:
// a picture, at most three short lines, and an everyday comparison.
// The last page of each lesson explains how the concept plays.

export type DiagramId =
  | 'cpu' | 'clock' | 'units' | 'storage' | 'highway' | 'score'
  | 'laundry' | 'stages' | 'stall' | 'pipeplay' | 'speedup'
  | 'forward' | 'loaduse' | 'forwardplay' | 'speedup3'
  | 'fork' | 'guess' | 'guessplay' | 'speedup4'
  | 'branchread' | 'loopend' | 'howguess'
  | 'table1' | 'grid' | 'misses1' | 'override' | 'when1'
  | 'counter2' | 'misses2' | 'weak2' | 'when2' | 'score2'
  | 'overclock' | 'power' | 'throttle' | 'damage'
  | 'ramtrip' | 'wallchart' | 'floor' | 'freezeplay'
  | 'desk' | 'lines' | 'address' | 'locality' | 'misskinds' | 'cacheplay' | 'cachescore';

export type LessonPage = {
  readonly title: string;
  readonly diagram: DiagramId;
  readonly lines: readonly string[];
  readonly analogy: string;
};

export type Lesson = {
  readonly id: string;
  readonly title: string;
  /** Scene that practices and plays this lesson's concept, and options for it. */
  readonly scene: 'pipeline';
  readonly options?: TierOptions;
  readonly pages: readonly LessonPage[];
};

export const TIER1_LESSON: Lesson = {
  id: 'tier1',
  title: 'LESSON 1: HOW A CPU RUNS A PROGRAM',
  scene: 'pipeline',
  options: { singleCycle: true },
  pages: [
    {
      title: 'WHAT A CPU DOES',
      diagram: 'cpu',
      lines: [
        "A CPU is the chip that does a computer's work.",
        'It follows a PROGRAM: a list of tiny steps,',
        'called INSTRUCTIONS, one after another.',
      ],
      analogy: 'Like a cook following a recipe, one step at a time.',
    },
    {
      title: 'THE CLOCK',
      diagram: 'clock',
      lines: [
        'A clock inside the CPU ticks very fast.',
        'Each tick is one CYCLE: one step of work. Early CPUs',
        'ticked a million times a second (1 MHz). Now: billions.',
      ],
      analogy: 'In this game, every BEAT of the music is one clock cycle.',
    },
    {
      title: 'THREE KINDS OF WORK',
      diagram: 'units',
      lines: [
        'Each instruction needs one part of the CPU:',
        'the ALU does math, MEM reaches memory,',
        'and BRANCH decides which instruction runs next.',
      ],
      analogy: 'Like a kitchen: one station chops, one cooks, one plates.',
    },
    {
      title: 'WHERE NUMBERS LIVE',
      diagram: 'storage',
      lines: [
        'REGISTERS: 8 slots inside the CPU, x0 to x7.',
        'Tiny, but instant. (x0 always holds 0.)',
        'MEMORY: far bigger, but slower to reach.',
      ],
      analogy: 'Registers are your hands. Memory is the shelf behind you.',
    },
    {
      title: 'HOW IT PLAYS',
      diagram: 'highway',
      lines: [
        'Instructions fall toward the line.',
        'When one reaches it, press its key ON THE BEAT:',
        'D = ALU      F = MEM      J = BRANCH',
      ],
      analogy: 'Wrong key, or late? The CPU waits a cycle: a STALL.',
    },
    {
      title: 'YOUR SCORE',
      diagram: 'score',
      lines: [
        'CPI = Cycles Per Instruction, on average.',
        'Perfect play gives CPI 1.00.',
        'Every wasted cycle pushes it up.',
      ],
      analogy: 'Fewer wasted cycles = the job finishes sooner.',
    },
  ],
};

export const TIER2_LESSON: Lesson = {
  id: 'tier2',
  title: 'LESSON 2: PIPELINING',
  scene: 'pipeline',
  pages: [
    {
      title: 'START THE NEXT ONE EARLY',
      diagram: 'laundry',
      lines: ['Until now, the CPU finished each instruction', 'before starting the next. A PIPELINE starts the', 'next one while the last is still going.'],
      analogy: 'Wash load 2 while load 1 is in the dryer.',
    },
    {
      title: 'FIVE STAGES',
      diagram: 'stages',
      lines: ['Each instruction now goes through 5 steps (STAGES),', 'one per beat. Small steps let the clock tick 4x faster,', 'and up to 5 instructions are in the CPU at once.'],
      analogy: 'Like a car wash: five cars, each at a different spot.',
    },
    {
      title: 'WAIT FOR YOUR DATA',
      diagram: 'stall',
      lines: ['Sometimes an instruction needs a number that the', "one just ahead of it hasn't worked out yet.", 'Then it must wait a beat: a STALL.'],
      analogy: "Like waiting for the cake to bake before you can ice it.",
    },
    {
      title: 'HOW IT PLAYS',
      diagram: 'pipeplay',
      lines: ['Played notes slide down through EX, MEM, WB.', "A LINK (a line to a note below) means it's waiting", 'on that one: press SPACE to stall.'],
      analogy: 'Too early: thrown out (FLUSHED). Stall for nothing: a wasted cycle.',
    },
    {
      title: 'YOUR SCORE',
      diagram: 'speedup',
      lines: ['Stalls push CPI up, but each cycle is 4x shorter,', 'so the pipeline still finishes far sooner.'],
      analogy: 'The music builds as your pipeline fills.',
    },
  ],
};

export const TIER3_LESSON: Lesson = {
  id: 'tier3',
  title: 'LESSON 3: FORWARDING',
  scene: 'pipeline',
  options: { forwarding: true },
  pages: [
    {
      title: 'A SHORTCUT',
      diagram: 'forward',
      lines: ['An answer is ready at the end of EXECUTE, but it', 'only goes into its register two stages later.', 'FORWARDING wires hand it straight to the next one.'],
      analogy: 'Hand it over directly, instead of putting it down first.',
    },
    {
      title: 'LOADS STILL WAIT',
      diagram: 'loaduse',
      lines: ['A load gets its number from memory in the MEMORY', 'stage: one stage too late to hand over in time.', 'So right after a load, you still stall once.'],
      analogy: "The one wait forwarding can't remove: a LOAD-USE hazard.",
    },
    {
      title: 'HOW IT PLAYS',
      diagram: 'forwardplay',
      lines: ['Most links are gone: play notes straight away.', 'Watch the forwarded numbers jump up the wire.'],
      analogy: 'A link now usually means a load: stall once.',
    },
    {
      title: 'YOUR SCORE',
      diagram: 'speedup3',
      lines: ['Fewer stalls means a lower CPI,', 'on the same 4 MHz clock.'],
      analogy: 'Results compare you with tier 2 and tier 1.',
    },
  ],
};

export const TIER4_LESSON: Lesson = {
  id: 'tier4',
  title: 'LESSON 4: BRANCH PREDICTION',
  scene: 'pipeline',
  options: { forwarding: true, guessing: true },
  pages: [
    {
      title: 'WHAT A BRANCH DOES',
      diagram: 'branchread',
      lines: ['A BRANCH picks what runs next. bne x1, x2, loop:', 'if x1 and x2 differ, jump back to loop: (TAKEN).', "If they're the same, carry on (NOT TAKEN)."],
      analogy: 'bne = Branch if Not Equal. Like "stir until the timer hits zero".',
    },
    {
      title: 'HOW A LOOP ENDS',
      diagram: 'loopend',
      lines: ['Each time round, x1 goes up by 1. x2 holds 4.', 'While x1 is below 4, the branch jumps back.', "When x1 reaches 4, it's done: NOT TAKEN."],
      analogy: 'A loop jumps back every time, except the very last.',
    },
    {
      title: 'A FORK IN THE ROAD',
      diagram: 'fork',
      lines: ['The CPU only learns which way a branch goes in', "DECODE, but by then it's already fetching the", 'next instruction. So it has to guess.'],
      analogy: 'Like picking a turn before you can read the sign.',
    },
    {
      title: 'GUESS RIGHT, GUESS WRONG',
      diagram: 'guess',
      lines: ['Right guess: the next instruction is already there.', 'Wrong guess: the one fetched is thrown out', '(FLUSHED), and the right one starts a beat late.'],
      analogy: 'Until now, the CPU always guessed NOT TAKEN.',
    },
    {
      title: 'HOW TO GUESS',
      diagram: 'howguess',
      lines: ['Most of the time, guess TAKEN: loops repeat a lot.', 'Last time round, x1 is one below x2 in REGISTERS', '(its +1 still on the way, marked <-EX or <-MEM).'],
      analogy: 'Then guess NOT TAKEN. The glow only shows what it did last time.',
    },
    {
      title: 'HOW IT PLAYS',
      diagram: 'guessplay',
      lines: ['Play a branch with J (guess NOT TAKEN)', 'or K (guess TAKEN).', 'The bright key is the hint; the dim one goes against it.'],
      analogy: 'Loops jump back every time except the last.',
    },
    {
      title: 'YOUR SCORE',
      diagram: 'speedup4',
      lines: ['Each right guess on a jump back', 'saves the cycle a flush would cost.'],
      analogy: 'Results show how many guesses you got right.',
    },
  ],
};

export const TIER5_LESSON: Lesson = {
  id: 'tier5',
  title: 'LESSON 5: A 1-BIT PREDICTOR',
  scene: 'pipeline',
  options: { forwarding: true, guessing: true, predictor: '1-bit', program: 'SUM GRID' },
  pages: [
    {
      title: 'THE CPU GUESSES ON ITS OWN',
      diagram: 'table1',
      lines: ['Real CPUs have a PREDICTOR that guesses for them:', 'a little table of what each branch did last time.', 'It guesses the same again.'],
      analogy: 'It does what you did in lesson 4, without being asked.',
    },
    {
      title: 'A LOOP INSIDE A LOOP',
      diagram: 'grid',
      lines: ['SUM GRID adds up 4 rows of 3 numbers.', 'The inner loop (col) adds one row; x2 marks its end.', 'The outer loop (row) moves down; x6 marks the end.'],
      analogy: 'Like reading a page: across each line, then down to the next.',
    },
    {
      title: 'WHERE IT MISSES',
      diagram: 'misses1',
      lines: ['On every row, col goes TAKEN, TAKEN, NOT TAKEN.', 'The predictor misses twice a row: at the end, and', 'again at the next row, because it remembers NOT.'],
      analogy: 'It only knows the last answer, not the pattern.',
    },
    {
      title: 'FOLLOW OR OVERRIDE',
      diagram: 'override',
      lines: ["The predictor's guess glows bright: press it to follow.", 'The dim key OVERRIDES it. A right override saves', 'a cycle; a wrong one is thrown out, like any wrong guess.'],
      analogy: "Override only when you can see something it can't.",
    },
    {
      title: 'WHEN TO OVERRIDE',
      diagram: 'when1',
      lines: ['Read the registers, like in lesson 4. x1 is where', 'you are; x2 is the end of this row. If the row ends', 'here but the glow says TAKEN, press the dim key.'],
      analogy: 'The predictor only knows the past; you can read the registers.',
    },
  ],
};

export const TIER6_LESSON: Lesson = {
  id: 'tier6',
  title: 'LESSON 6: A 2-BIT PREDICTOR',
  scene: 'pipeline',
  options: { forwarding: true, guessing: true, predictor: '2-bit', program: 'SUM GRID' },
  pages: [
    {
      title: 'IT TAKES TWO MISSES',
      diagram: 'counter2',
      lines: ['A 2-bit predictor keeps a count from 0 to 3.', "Jumped back: count up. Didn't: count down.", 'At 2 or 3 it guesses TAKEN; at 0 or 1, NOT TAKEN.'],
      analogy: 'One surprise only makes it unsure; two in a row change its mind.',
    },
    {
      title: 'WHY THAT HELPS LOOPS',
      diagram: 'misses2',
      lines: ['At the end of a row it misses, but that only drops', 'the count from 3 to 2: still TAKEN. So the next row', 'starts with a right guess: one miss a row, not two.'],
      analogy: 'Same grid: 7 misses instead of 10.',
    },
    {
      title: 'SURE OR UNSURE',
      diagram: 'weak2',
      lines: ['A bright glow: the predictor is sure (0 or 3).', "A dim glow: it's unsure (1 or 2).", 'In the listing, N n t T show the count: capitals are sure.'],
      analogy: 'Sure or not, it is still only guessing from the past.',
    },
    {
      title: 'WHEN TO OVERRIDE',
      diagram: 'when2',
      lines: ['It still misses the end of every row. When x1 is', 'one below x2 (its +1 still on the way), press J.', 'Same rule as before; you just override less often.'],
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
export const OVERCLOCK_LESSON: Lesson = {
  id: 'overclock',
  title: 'OVERCLOCKING',
  scene: 'pipeline',
  pages: [
    {
      title: 'FASTER CLOCK, FASTER BEAT',
      diagram: 'overclock',
      lines: ['In a song, H speeds up the clock (+10%) and G slows it.', 'One beat is one cycle, so the music speeds up', 'and the job gets done sooner.'],
      analogy: 'Too fast? G slows it (down to 50%): easier, but the job takes longer.',
    },
    {
      title: 'THE POWER WALL',
      diagram: 'power',
      lines: ['A faster clock needs more voltage, and power grows', 'with voltage squared: +50% clock costs over 2x', 'the power. All of that power turns into heat.'],
      analogy: 'This wall is why desktop clocks stopped climbing in the mid-2000s.',
    },
    {
      title: 'TOO HOT: THE CLOCK STOPS',
      diagram: 'throttle',
      lines: ['At 95°C the chip stops its clock to cool down (THROTTLING):', "the notes freeze and nothing runs until it's 80°C.", 'Stalls and bubbles use less power, so they run cooler.'],
      analogy: 'Smoke and flames warn you first: press G before it gets there.',
    },
    {
      title: 'HEAT WEARS THE CHIP',
      diagram: 'damage',
      lines: ['Every overheat damages the chip: its top speed drops 10%', '(150% -> 140%), and it overheats sooner. Worn out, even 100%', 'overheats: slow it down (G) or repair it in the shop.'],
      analogy: 'Exaggerated: real chips wear slowly and slow down long before they burn.',
    },
  ],
};

/** Shown when the clock first outruns RAM (a trip takes more than one cycle). */
export const MEMWALL_LESSON: Lesson = {
  id: 'memwall',
  title: 'THE MEMORY WALL',
  scene: 'pipeline',
  options: { forwarding: true },
  pages: [
    {
      title: 'RAM TAKES ITS TIME',
      diagram: 'ramtrip',
      lines: ['A trip to RAM (the main memory) takes about 60 ns:', '60 billionths of a second (the textbook says 50-70).', 'Clocks got 4000x faster in 40 years; RAM, a few times.'],
      analogy: "Working faster doesn't make the delivery truck come sooner.",
    },
    {
      title: 'MORE CYCLES, SAME WAIT',
      diagram: 'wallchart',
      lines: ['60 ns is 1 cycle at 16 MHz, but 240 cycles at 4 GHz.', 'Every load and store waits that long, and the', 'whole pipeline freezes while it does.'],
      analogy: 'Each faster clock means more cycles spent doing nothing.',
    },
    {
      title: 'THE WALL',
      diagram: 'floor',
      lines: ['CPU TIME = INSTRUCTIONS x CPI x CLOCK PERIOD.', 'A faster clock shortens each cycle, but the waits', 'take more cycles: past a point, upgrades buy nothing.'],
      analogy: 'That floor is the memory wall. A cache is how CPUs get past it.',
    },
    {
      title: 'HOW IT PLAYS',
      diagram: 'freezeplay',
      lines: ['When a load or store reaches MEMORY, the notes freeze', 'and a counter rolls up the cycles. Keys do nothing.', 'A bright click: the data arrived. Play the next note.'],
      analogy: 'Up to 5 beats stand for hundreds of cycles; every one counts.',
    },
  ],
};

/** Shown right after buying the L1 cache. */
export const CACHE_LESSON: Lesson = {
  id: 'cache',
  title: 'THE L1 CACHE',
  scene: 'pipeline',
  options: { forwarding: true },
  pages: [
    {
      title: 'A DESK BESIDE THE CPU',
      diagram: 'desk',
      lines: ['A CACHE is a small, fast memory right by the CPU.', 'It keeps copies of the numbers used lately. If a load', "finds its number there, that's a HIT: no trip to RAM."],
      analogy: "Keep the books you're using on your desk, not across town.",
    },
    {
      title: 'LINES AND BLOCKS',
      diagram: 'lines',
      lines: ['Memory moves in BLOCKS of 4 bytes. This cache has', '4 LINES, each holding one block (16 bytes in all).', 'Each block has one line it can go in: DIRECT-MAPPED.'],
      analogy: 'Blocks 0, 4, 8... all share line 0, so they push each other out.',
    },
    {
      title: 'THE ADDRESS SAYS WHERE',
      diagram: 'address',
      lines: ["An ADDRESS is a byte's number in memory. It splits", 'into TAG, LINE and BYTE: tttt ii oo. LINE picks the', "line; if that line's TAG matches (and it's valid): a HIT."],
      analogy: 'The line is the shelf; the tag is the name on the book.',
    },
    {
      title: 'A MISS BRINGS A WHOLE BLOCK',
      diagram: 'locality',
      lines: ['A MISS fetches the whole block from RAM, so the', 'next bytes are already there: reading in order costs', 'one miss per 4 bytes. Reading a byte again hits too.'],
      analogy: "Programs reuse nearby and recent data. That's why small caches work.",
    },
    {
      title: 'THREE KINDS OF MISS',
      diagram: 'misskinds',
      lines: ['FIRST USE: the block was never loaded before.', 'CONFLICT: two blocks keep pushing each other out.', 'TOO SMALL: more blocks in use than the cache holds.'],
      analogy: 'Replays label every miss: click a load to see which kind.',
    },
    {
      title: 'HOW IT PLAYS',
      diagram: 'cacheplay',
      lines: ['The L1 box shows each line: its tag and its 4 bytes.', "A hit doesn't freeze; a miss freezes as before.", 'Stores go out through a WRITE BUFFER: no waiting.'],
      analogy: 'Watch the lookup line under memory to see every hit and miss.',
    },
    {
      title: 'YOUR SCORE',
      diagram: 'cachescore',
      lines: ['Fewer trips to RAM means a lower CPI,', 'and faster clocks start paying off again.'],
      analogy: 'Results show your hit rate and your time next to NO CACHE.',
    },
  ],
};

export const LESSONS: Readonly<Record<string, Lesson>> = {
  [TIER1_LESSON.id]: TIER1_LESSON,
  [TIER2_LESSON.id]: TIER2_LESSON,
  [TIER3_LESSON.id]: TIER3_LESSON,
  [TIER4_LESSON.id]: TIER4_LESSON,
  [TIER5_LESSON.id]: TIER5_LESSON,
  [TIER6_LESSON.id]: TIER6_LESSON,
  [OVERCLOCK_LESSON.id]: OVERCLOCK_LESSON,
  [MEMWALL_LESSON.id]: MEMWALL_LESSON,
  [CACHE_LESSON.id]: CACHE_LESSON,
};
