import { LESSONS } from './lessons.js';
// What the guide says on each screen: a robot made of characters that walks
// the player through the real screen, pointing at its parts (everything else
// dims) or holding up a lesson picture. A tour plays the first time its
// screen comes up (Progress.seenLessons keeps its id). Lines are short and in
// sentence case, like the lessons; drawing is ui/guide.ts's job.
/** The guide's name. */
export const GUIDE_NAME = 'TICK';
/** The board's tour, as Progress.seenLessons remembers it. */
export const BOARD_TOUR_ID = 'board';
export const BOARD_TOUR = [
    { say: `Hi! I'm ${GUIDE_NAME}. I live inside this computer. I'll show you how it works, one small piece at a time.` },
    { say: 'Every computer has a CPU: the chip that does all its work. It reads a PROGRAM, a list of tiny steps, and does them in order.', picture: 'cpu' },
    { say: 'Here, you run a CPU for hire. Companies send in jobs, and you get paid when your CPU finishes them.', point: 'list' },
    { say: 'OK means your CPU is fast enough for that job. SLOW means it isn\'t yet: a faster CPU from the shop will fix that.', point: 'list' },
    { say: 'This is the job you\'ve picked: who wants it, what it pays, and what they need done.', point: 'job' },
    { say: 'This is the job\'s program. Each line is one INSTRUCTION: one tiny step. These steps repeat once for each item.', point: 'loop' },
    { say: 'Don\'t worry about reading it yet! In the song, each instruction becomes a note. This counts the notes for each lane.', point: 'notes' },
    { say: 'MEMORY is where the computer keeps its numbers, in numbered spots. The marks show which spots this job reads and writes.', point: 'memory' },
    { say: 'This is how long your CPU will take, against the deadline. A messy run is slower, and a late job pays half.', point: 'time' },
    { say: 'Pick a STARTER job and press ENTER. I\'ll meet you on the next screen!', point: 'list' },
];
/** Tours of the song screen, by lesson id: they play before that lesson's practice, in place of its briefing. */
export const SONG_TOURS = {
    tier1: [
        { say: 'This screen shows the inside of your CPU. It looks busy, but we\'ll go through it one piece at a time.' },
        { say: 'A program is a list of INSTRUCTIONS: tiny steps like "add these two numbers". The CPU does one, then the next.', picture: 'cpu' },
        { say: 'Here\'s this job\'s program. The arrow points at the instruction the CPU is doing right now.', point: 'listing' },
        { say: 'Inside the CPU, a clock ticks very fast. Each tick is one CYCLE. Here, every beat of the music is one cycle.', picture: 'clock' },
        { say: 'Each instruction needs one part of the CPU: ALU does math, MEM reaches memory, BRANCH picks what runs next.', point: 'lanes' },
        { say: 'Instructions fall toward this line. When one reaches it, press its lane\'s key on the beat: D, F or J.', point: 'line' },
        { say: 'REGISTERS are 8 slots inside the CPU, x0 to x7: tiny, but instant to use. x0 is special: it always holds 0.', point: 'registers' },
        { say: 'MEMORY holds far more numbers, but it\'s slower to reach, like a shelf across the room.', point: 'memory' },
        { say: 'Your score is CPI: cycles per instruction. 1.00 is perfect. A wrong or late key wastes a cycle and raises it.', point: 'stats' },
        { say: 'This is practice: notes wait for you, so take your time. I\'ll explain each new instruction as it comes.', point: 'line' },
    ],
};
/** Everything the game teaches, as Progress.seenLessons remembers it: every lesson, and the board's tour. */
export const TAUGHT_IDS = [...Object.keys(LESSONS), BOARD_TOUR_ID];
//# sourceMappingURL=tours.js.map