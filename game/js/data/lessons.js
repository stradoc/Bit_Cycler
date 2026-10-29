// Briefings shown before a concept is played. Each page teaches ONE idea:
// a picture, at most three short lines, and an everyday comparison.
// The last page of each lesson explains how the concept plays.
export const TIER1_LESSON = {
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
export const LESSONS = {
    [TIER1_LESSON.id]: TIER1_LESSON,
    [TIER2_LESSON.id]: TIER2_LESSON,
    [TIER3_LESSON.id]: TIER3_LESSON,
};
//# sourceMappingURL=lessons.js.map