// Briefings shown before a concept is played. Each page teaches ONE idea:
// a picture, at most three short lines, and an everyday comparison.
// The last page of each lesson explains how the concept plays.
export const TIER1_LESSON = {
    id: 'tier1',
    title: 'LESSON 1: HOW A CPU RUNS A PROGRAM',
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
export const LESSONS = {
    [TIER1_LESSON.id]: TIER1_LESSON,
};
//# sourceMappingURL=lessons.js.map