// Briefings shown before a concept is played. Each page teaches ONE idea:
// a picture, at most three short lines, and an everyday comparison.
// The last page of each lesson explains how the concept plays.

export type DiagramId =
  | 'cpu' | 'clock' | 'units' | 'storage' | 'highway' | 'score'
  | 'laundry' | 'stages' | 'stall' | 'pipeplay' | 'speedup'
  | 'forward' | 'loaduse' | 'forwardplay' | 'speedup3'
  | 'fork' | 'guess' | 'guessplay' | 'speedup4';

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
  readonly scene: 'play' | 'pipeline';
  readonly options?: { readonly forwarding?: boolean; readonly guessing?: boolean };
  readonly pages: readonly LessonPage[];
};

export const TIER1_LESSON: Lesson = {
  id: 'tier1',
  title: 'LESSON 1: HOW A CPU RUNS A PROGRAM',
  scene: 'play',
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

export const TIER2_LESSON: Lesson = {
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

export const TIER3_LESSON: Lesson = {
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

export const TIER4_LESSON: Lesson = {
  id: 'tier4',
  title: 'LESSON 4: BRANCH PREDICTION',
  scene: 'pipeline',
  options: { forwarding: true, guessing: true },
  pages: [
    {
      title: 'A FORK IN THE ROAD',
      diagram: 'fork',
      lines: ['A branch is decided in DECODE, but the next', 'instruction is fetched in that same beat.'],
      analogy: 'So the CPU has to guess which way the road goes.',
    },
    {
      title: 'GUESS RIGHT, GUESS WRONG',
      diagram: 'guess',
      lines: ['Right guess: nothing is lost.', 'Wrong guess: the fetched instruction is flushed.'],
      analogy: 'Until now the CPU always guessed NOT TAKEN.',
    },
    {
      title: 'HOW IT PLAYS',
      diagram: 'guessplay',
      lines: ['Route a branch with J (guess NOT TAKEN) or K (guess TAKEN).', 'Its glow shows what it did last time.'],
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

export const LESSONS: Readonly<Record<string, Lesson>> = {
  [TIER1_LESSON.id]: TIER1_LESSON,
  [TIER2_LESSON.id]: TIER2_LESSON,
  [TIER3_LESSON.id]: TIER3_LESSON,
  [TIER4_LESSON.id]: TIER4_LESSON,
};
