// Briefings shown before a concept is played. Each page teaches ONE idea:
// a picture, at most three short lines, and an everyday comparison.
// The last page of each lesson explains how the concept plays.

export type DiagramId =
  | 'cpu' | 'clock' | 'units' | 'storage' | 'highway' | 'score'
  | 'laundry' | 'stages' | 'overlap' | 'hazard' | 'stall' | 'pipeplay' | 'layers' | 'speedup';

export type LessonPage = {
  readonly title: string;
  readonly diagram: DiagramId;
  readonly lines: readonly string[];
  readonly analogy: string;
};

export type Lesson = {
  readonly id: string;
  readonly title: string;
  /** Scene that practices and plays this lesson's concept. */
  readonly scene: 'play' | 'pipeline';
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
      title: 'ONE AT A TIME IS SLOW',
      diagram: 'laundry',
      lines: [
        "Tier 1's CPU finished each instruction",
        'before starting the next, so most of the',
        'CPU sat idle. Pipelining overlaps the work.',
      ],
      analogy: 'Laundry: start washing load 2 while load 1 is drying.',
    },
    {
      title: 'FIVE STAGES',
      diagram: 'stages',
      lines: [
        "The CPU's work is split into five short steps.",
        'Each instruction moves one stage per cycle,',
        'so five instructions can be in flight at once.',
      ],
      analogy: 'Like an assembly line with five stations.',
    },
    {
      title: 'A FASTER CLOCK',
      diagram: 'overlap',
      lines: [
        'Short stages let the clock tick faster: 4 MHz.',
        'Once the pipeline is full, one instruction',
        'finishes every cycle. Filling it takes 4 cycles.',
      ],
      analogy: 'The tempo rises a little: you are running a faster chip.',
    },
    {
      title: 'DATA HAZARDS',
      diagram: 'hazard',
      lines: [
        'An instruction reads its registers in ID.',
        "If an older instruction hasn't written that",
        "register yet (in WB), the value isn't ready.",
      ],
      analogy: 'Like starting a recipe step before the ingredient is cooked.',
    },
    {
      title: 'STALLING',
      diagram: 'stall',
      lines: [
        'The fix is to wait: a STALL holds it in ID',
        'and sends an empty BUBBLE down the pipeline.',
        'Result from 1 back: 2 stalls. 2 back: 1 stall.',
      ],
      analogy: 'A short wait beats cooking with raw ingredients.',
    },
    {
      title: 'HOW IT PLAYS',
      diagram: 'pipeplay',
      lines: [
        'Route notes as before: D = ALU  F = MEM  J = BRANCH.',
        'But if it reads a register still being computed',
        '(outlined in the pipeline), press SPACE to stall.',
      ],
      analogy: 'Route into a hazard: FLUSH. Stall for nothing: a wasted cycle.',
    },
    {
      title: 'LISTEN TO THE PIPELINE',
      diagram: 'layers',
      lines: [
        'Each filled stage adds a layer to the music.',
        'A full pipeline plays the whole song;',
        'stalls and flushes strip it back down.',
      ],
      analogy: 'Keep the streak going and the song keeps building.',
    },
    {
      title: 'YOUR SCORE',
      diagram: 'speedup',
      lines: [
        'Stalls push CPI above 1.00, but every cycle',
        'is 4x shorter than tier 1, so the pipelined',
        'CPU still finishes the program sooner.',
      ],
      analogy: 'Results compare your run with the single-cycle CPU.',
    },
  ],
};

export const LESSONS: Readonly<Record<string, Lesson>> = {
  [TIER1_LESSON.id]: TIER1_LESSON,
  [TIER2_LESSON.id]: TIER2_LESSON,
};
