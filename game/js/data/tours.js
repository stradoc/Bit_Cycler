import { cacheBytes, L1_BASE, LOWER_CACHES, missNs } from '../sim/memory.js';
import { LESSONS } from './lessons.js';
// What the guide says on each screen: TICK, a little robot who walks the
// player through the real screen, pointing at its parts (everything else
// dims) or holding up a lesson picture, his face showing how he feels about a line. Every lesson is one of these tours;
// there are no slides. Lines are short and in sentence case, and written for
// someone who has never heard of a CPU: a new word comes in capitals, with
// what it means. Drawing is ui/guide.ts's job.
/** The guide's name. */
export const GUIDE_NAME = 'TICK';
/** The main menu's welcome (remembered in the settings, so it plays once per computer, save or no save). */
export const WELCOME_TOUR_ID = 'welcome';
/** The board's tour, as Progress.seenLessons remembers it. */
export const BOARD_TOUR_ID = 'board';
/** The first day's tours, as Progress.seenLessons remembers them: the first real board, the first timecard, the first look at the calendar. */
export const FIRST_DAY_ID = 'firstday';
export const TIMECARD_TOUR_ID = 'timecard';
export const CALENDAR_TOUR_ID = 'calendar';
export const TUTORIAL = {
    full: { tours: true, closeLooks: true, tips: true },
    short: { tours: true, closeLooks: false, tips: true },
    skip: { tours: false, closeLooks: false, tips: false },
};
/**
 * The main menu's welcome, the same for everyone: hello, and where things are.
 * How much he teaches is asked at the first job (TUTORIAL_QUESTION), when
 * there's something to teach; lesson 1 says what a CPU and its clock are.
 */
export const WELCOME_TOUR = [
    { say: `Hi! I'm ${GUIDE_NAME}, and I live inside this computer. Welcome to Bit Cycler! It shows you how a CPU works, from the inside.`, mood: 'cheer' },
    { say: 'Companies pay you to run their programs. With the money you buy parts that make your CPU faster, the way real CPUs got faster.' },
    { say: 'Start here. NEWGAME begins a new game; CONTINUE picks up where you left off.', point: 'new' },
    { say: 'Every lesson I give is kept in BRIEFS. Open it any time to see one again.', point: 'briefs' },
    { say: 'README has the keys and the rules. SETTINGS has the sound, the timing, and the DIFFICULTY: RELAXED if the beat is too fast.', point: 'readme' },
    { say: "When you take your first job, I'll ask how much you'd like me to explain. Let's go!", point: 'new', mood: 'happy' },
];
/**
 * Asked as a new game's first job (the tutorial job) is picked on the board:
 * how much TICK teaches from here, saved in the settings (a row there changes it later).
 */
export const TUTORIAL_QUESTION = {
    say: 'Your first job! Its program is a list of INSTRUCTIONS, tiny commands for the CPU. Want me to go through every one of them in depth?',
    mood: 'happy',
    choices: [
        { answer: 'Yes, every one up close. (FULL TUTORIAL)', level: 'full' },
        { answer: 'Just each new part. (SHORT TUTORIAL)', level: 'short' },
        { answer: 'No, I know this. (NO TUTORIAL)', level: 'skip' },
    ],
};
/** What TICK says after the answer, before the job starts (full and short: his lesson starts on the next screen). */
export const TUTORIAL_REPLY = {
    full: [],
    short: [],
    skip: [{ say: "Got it! I'll stay out of your way. Every lesson is in BRIEFS on the main menu, and SETTINGS can bring me back.", mood: 'happy' }],
};
export const BOARD_TOUR = [
    { say: "This is the contract board. Companies send in jobs for your CPU, and you get paid when it finishes them.", point: 'list' },
    { say: "OK means your CPU can do it in time. SLOW: it isn't fast enough yet (the shop can fix that). LATER: not enough of today is left.", point: 'list' },
    { say: "This is the job you've picked: who wants it, what it pays, and what they need done.", point: 'job' },
    { say: 'This is how long your CPU will take, against the deadline. A messy run is slower, and a late job pays half.', point: 'time' },
    { say: "Under the line are the details. This is the job's PROGRAM: a list of tiny steps called INSTRUCTIONS, repeated for each item.", point: 'loop' },
    { say: "Don't worry about reading it yet! In the song, each instruction becomes a note. This counts the notes for each lane.", point: 'notes' },
    { say: 'MEMORY is where the computer keeps its numbers, in numbered spots. The marks show which spots this job reads and writes.', point: 'memory' },
    { say: "This is your workday: 8 hours from 9:00. Each job uses up its time. Press L to log off, and a new day starts with new jobs.", point: 'calendar' },
    { say: "Pick a job and press ENTER. Your first is a small one, picked so I can show you everything. See you on the next screen!", point: 'list', mood: 'happy' },
];
/** Your first day: the first board with real jobs on it, once the tutorial job is done. */
export const FIRST_DAY_TOUR = [
    { say: 'Nice work! Now the real jobs arrive, sized to your CPU. EASY jobs leave room for mistakes; FAIR ones leave less.', point: 'list', mood: 'cheer' },
    { say: "STRETCH jobs pay the most, but they're TIGHT: one sloppy run and you finish late, which pays half.", point: 'list', mood: 'worried' },
    { say: 'This bar is your workday: 8 hours from 9:00. The # marks are the hours used; the = marks are what the chosen job would take.', point: 'workday' },
    { say: "Move to a job, or hover over it, to see its = marks. One that won't fit before 5:00 says LATER and waits for tomorrow.", point: 'list' },
    { say: "Each job is due a few hours after you take it, and only stays on the board for a day or two, so don't wait too long.", point: 'time' },
    { say: "When you've done enough, press L to log off. The day's timecard comes up, then a new morning with new jobs.", point: 'calendar' },
    { say: 'Press C any time to see your calendar: every day so far, and what\'s coming. Have a good first day!', mood: 'happy' },
];
/** The first timecard, as the first day ends. */
export const TIMECARD_TOUR = [
    { say: "That's your timecard: when you started and stopped, the jobs you finished, how many were late, and what you earned.", point: 'card' },
    { say: 'Press ENTER to clock out. Tomorrow brings new jobs, and offers that were on their last day are gone.', point: 'card' },
];
/** The first look at the calendar. */
export const CALENDAR_TOUR = [
    { say: 'This is your calendar: the whole month, a box for each day. You started on Monday, November 1.', point: 'month' },
    { say: "Today is shaded. The days you've finished show what you earned.", point: 'today' },
    { say: "Choose any day with the arrows to see it here: a finished day's timecard, or what's coming that day.", point: 'day' },
    { say: 'Days when offers end are marked, so you can plan which jobs to take first. Press B to go back to the board.', point: 'month' },
];
/** The caches below the L1, as their lessons talk about them. */
const [L2, L3] = LOWER_CACHES;
const bytes = (level) => cacheBytes(level.shape);
/** How long a load found at `from` takes on the first L1 with `lower` caches below it (ns). */
const ns = (lower, from) => missNs(L1_BASE, lower, from);
/** Every lesson as a tour of the song screen, by lesson id (data/lessons.ts). */
export const SONG_TOURS = {
    tier1: [
        { say: "This screen shows the inside of your CPU. It looks busy, but we'll go through it one piece at a time." },
        { say: 'A program is a list of INSTRUCTIONS: tiny steps like "add these two numbers". The CPU does one, then the next.', picture: 'cpu' },
        { say: "Here's this job's program. The arrow points at the instruction the CPU is doing right now.", point: 'listing' },
        { say: 'Inside the CPU, a clock ticks very fast. Each tick is one CYCLE. Here, every beat of the music is one cycle.', picture: 'clock' },
        { say: 'Each instruction needs one part of the CPU: the ALU does math, MEM reaches memory, BRANCH picks what runs next.', picture: 'units' },
        { say: 'These are those three parts, as lanes. Each instruction falls down the lane of the part it needs.', point: 'lanes' },
        { say: "When one reaches this line, press its lane's key on the beat: D, F or J. A wrong or late key makes the CPU wait a cycle.", point: 'line' },
        { say: 'REGISTERS are 8 slots inside the CPU, x0 to x7: tiny, but instant to use. x0 is special: it always holds 0.', point: 'registers' },
        { say: "MEMORY holds far more numbers, but it's slower to reach, like a shelf across the room. LOAD copies from it; STORE copies to it.", point: 'memory' },
        { say: 'Your score is CPI: cycles per instruction. 1.00 is perfect, and every wasted cycle pushes it up.', point: 'stats' },
        { say: 'This is practice: notes wait for you, so take your time. I\'ll explain each new instruction as it comes.', point: 'line', mood: 'happy' },
    ],
    tier2: [
        { say: 'Until now, your CPU finished each instruction before starting the next. Most of its parts sat waiting.', picture: 'laundry' },
        { say: 'A PIPELINE overlaps them, like laundry: wash one load while the last one dries.', picture: 'laundry' },
        { say: 'Each instruction now goes through 5 steps called STAGES, one per beat. Up to 5 instructions are inside at once.', picture: 'stages' },
        { say: 'These rows are the later stages. A played note slides down: EX does the work, MEM reaches memory, WB saves the answer.', point: 'rows' },
        { say: "One catch: an instruction may need an answer that the one just ahead hasn't worked out yet. Then it has to wait.", picture: 'stall', mood: 'worried' },
        { say: "When that happens, a LINK joins the note on the line to the one it's waiting for. Press SPACE to wait a beat: a STALL.", point: 'rows' },
        { say: 'No link? Play it straight away. Too early gets it thrown out (FLUSHED), and waiting for nothing wastes a cycle.', point: 'line' },
        { say: 'Each stage is small, so the clock ticks 4x faster. Stalls raise CPI a little, but the pipeline still finishes far sooner.', picture: 'speedup' },
        { say: "Let's practice. Notes wait for you, and I'll explain each new thing as it comes.", point: 'line' },
    ],
    tier3: [
        { say: 'An answer is ready at the end of EX, but it only reaches its register two stages later. Waiting for that wastes beats.', picture: 'forward' },
        { say: 'FORWARDING adds wires that hand the answer straight to the instruction that needs it. No waiting!', picture: 'forward', mood: 'happy' },
        { say: "Watch for it down here: a forwarded value jumps up the wire to the note that needs it.", point: 'rows' },
        { say: 'Loads are the one exception. A load gets its number from memory in MEM, one stage too late to hand over in time.', picture: 'loaduse' },
        { say: 'So right after a load, you will still see a link: press SPACE once. Most other links are gone.', point: 'rows' },
        { say: 'Fewer stalls means a lower CPI on the same clock. Your results compare you with your old CPU.', picture: 'speedup3' },
        { say: 'Practice time. Look out for links: there are far fewer now.', point: 'line' },
    ],
    tier4: [
        { say: 'A BRANCH decides what runs next. bne x1, x2, loop means: if x1 and x2 are different, jump back to loop.', picture: 'branchread' },
        { say: 'Jumping back is TAKEN; carrying on is NOT TAKEN. A loop jumps back every time except the very last.', picture: 'loopend' },
        { say: 'The CPU only learns which way a branch goes in DECODE, but it has already started on the next instruction. So it guesses.', picture: 'fork' },
        { say: 'A right guess costs nothing. A wrong guess throws out the instruction it started (FLUSHED) and loses a beat.', picture: 'guess', mood: 'worried' },
        { say: 'Now YOU guess: play a branch with J for NOT TAKEN, or K for TAKEN. The bright key is a hint; the dim one goes against it.', point: 'line' },
        { say: 'Mostly, guess TAKEN. On the last time round, x1 is one below x2 with its +1 still on the way: then guess NOT TAKEN.', picture: 'howguess' },
        { say: 'Watch x1 and x2 here. A value still being worked out is marked <-EX or <-MEM.', point: 'registers' },
        { say: 'Every right guess on a jump back saves the beat a flush would cost.', picture: 'speedup4' },
        { say: "Let's practice some guesses.", point: 'line' },
    ],
    tier5: [
        { say: 'Real CPUs guess on their own, with a PREDICTOR: a little table that remembers what each branch did last time.', picture: 'table1' },
        { say: 'This program, SUM GRID, adds up 4 rows of 3 numbers: one loop goes across a row, another moves down to the next.', picture: 'grid' },
        { say: 'Here are the two loops: col adds up one row, and row moves down. x2 marks the end of a row, x6 the end of the grid.', point: 'listing' },
        { say: 'The predictor only remembers the last answer, so it misses at the end of every row, and again as the next row starts.', picture: 'misses1' },
        { say: "Its guess glows bright: press it to follow. The dim key OVERRIDES it. A right override saves a beat; a wrong one is flushed.", picture: 'override' },
        { say: 'Override when you can see the end coming: x1 one below x2 (its +1 on the way) means this row ends now.', point: 'registers' },
        { say: "Let's practice beating the predictor.", point: 'line' },
    ],
    tier6: [
        { say: 'A 2-bit predictor keeps a count from 0 to 3. Jumped back: count up. Didn\'t: count down. At 2 or 3 it guesses TAKEN.', picture: 'counter2' },
        { say: 'A miss at the end of a row only drops the count from 3 to 2: still TAKEN. So it misses once a row, not twice.', picture: 'misses2' },
        { say: "A bright glow means it's sure (0 or 3); a dim glow means it's unsure (1 or 2).", picture: 'weak2' },
        { say: 'The listing shows each branch\'s count as N, n, t or T. Capitals mean sure.', point: 'listing' },
        { say: 'It still misses the end of every row. When x1 is one below x2, override it with J.', picture: 'when2' },
        { say: 'Your results compare you with the predictor on its own. Every right override is a beat it would have lost.', picture: 'score2' },
        { say: 'Practice time!', point: 'line', mood: 'happy' },
    ],
    tier7: [
        { say: 'Your CPU has a second path through it now: TWO instructions can start in the same beat. That is called SUPERSCALAR.', point: 'lanes', mood: 'happy' },
        { say: "Think of a shop opening a second till: two customers served at once, as long as they don't need the same counter.", point: 'lanes' },
        { say: 'There is still one of each unit: one ALU, one memory, one branch unit. So two can only go together if they need different units.', point: 'lanes' },
        { say: "And the second can't need the first one's answer: if it reads a register the first is still writing, it waits its turn.", point: 'listing' },
        { say: "A branch can only go second. Until it's decided, the CPU doesn't know which instruction comes after it.", point: 'listing' },
        { say: 'Two that can go together arrive side by side, a CHORD: press both lanes at the same moment, like F and D for lb and addi.', point: 'line' },
        { say: "One key is never wrong, just slower. A chord on two that can't go together throws both away, like issuing too early.", point: 'line' },
        { say: 'With pairs, more than one instruction finishes per cycle, so CPI can drop below 1. THROUGHPUT now goes up to 2.', point: 'stats' },
        { say: "Let's practice some chords.", point: 'line' },
    ],
    overclock: [
        { say: "This is your CPU's clock and temperature. You can now OVERCLOCK: run the clock faster than it's rated for.", point: 'gauge' },
        { say: 'In a song, H speeds the clock up 10% and G slows it down. The music follows, since one beat is still one cycle.', picture: 'overclock' },
        { say: 'A faster clock needs more power, and power grows faster than speed: +50% clock costs over 2x the power. It all turns into heat.', picture: 'power' },
        { say: 'At 95°C the chip stops its clock to cool down, and the notes freeze until it reaches 80°C. Stalls use less power, so they run cooler.', picture: 'throttle' },
        { say: 'Every overheat wears the chip: its top speed drops 10%. The shop can repair it. (Real chips wear far more slowly.)', picture: 'damage', mood: 'worried' },
        { say: 'Smoke and flames warn you first. Press G before it gets too hot!', point: 'gauge', mood: 'worried' },
    ],
    memwall: [
        { say: 'Memory (RAM) is a separate chip from the CPU. Every trip there takes about 60 ns: 60 billionths of a second.', point: 'memory' },
        { say: 'In 40 years, clocks got thousands of times faster, but RAM only got a few times faster.', picture: 'ramtrip' },
        { say: '60 ns is 1 cycle at 16 MHz, but 240 cycles at 4 GHz. The faster your clock, the more cycles each trip wastes.', picture: 'wallchart' },
        { say: "So past a point, a faster clock hardly helps: the waits grow just as fast. That's the MEMORY WALL.", picture: 'floor', mood: 'worried' },
        { say: 'In a song, when a load or store reaches MEM, the notes freeze and a counter rolls up the cycles. Wait for the click.', picture: 'freezeplay' },
        { say: 'A few beats stand in for hundreds of cycles. A CACHE, from the shop, is how real CPUs get past the wall.', point: 'memory' },
    ],
    cache: [
        { say: 'This is your L1 CACHE: a small, fast memory right beside the CPU. It keeps copies of the numbers used lately.', point: 'cache' },
        { say: "If a load finds its number in the cache, that's a HIT: no trip to RAM. If not, it's a MISS, and it waits.", picture: 'desk' },
        { say: 'The cache moves memory in BLOCKS of 4 bytes, and has 4 LINES of one block each. Every block has one line it can go in.', picture: 'lines' },
        { say: "An ADDRESS (a byte's number in memory) says which line to look in; the line's TAG says which block is there now.", picture: 'address' },
        { say: 'A miss brings in the whole block, so the next bytes are already there. Programs use nearby data, so this pays off.', picture: 'locality' },
        { say: 'Misses come in 3 kinds: FIRST USE, CONFLICT (two blocks fighting over a line) and TOO SMALL. Replays label each one.', picture: 'misskinds' },
        { say: 'Watch the cache here as you play. Stores go out through a WRITE BUFFER, so they never wait.', point: 'cache' },
        { say: 'Fewer trips to RAM means a lower CPI, and faster clocks start paying off again.', picture: 'cachescore' },
        { say: "Let's practice with the cache.", point: 'line' },
    ],
    morelines: [
        { say: 'Your L1 cache now has 8 LINES instead of 4, so it holds 32 bytes. Just as fast, with twice the room.', point: 'cache', mood: 'happy' },
        { say: 'Think of a desk: a bigger desk keeps more books open at once, so you walk back to the shelf less often.' },
        { say: 'Some jobs read their data TWICE. The first L1 holds 16 bytes, so by the second pass the first numbers were pushed out.', picture: 'morelines' },
        { say: "Those are TOO SMALL misses: the data was used before, but there wasn't room to keep it. More lines fix them.", picture: 'morelines' },
        { say: "More lines can't help a FIRST USE: data that was never loaded still has to come from RAM.", picture: 'misskinds' },
        { say: "With 8 lines, the cache box shows each line's TAG. In a replay, click a line to see which bytes it holds.", point: 'cache' },
        { say: "Let's practice: this job reads 24 bytes twice. Watch the second pass hit.", point: 'line' },
    ],
    twoway: [
        { say: 'Your L1 now has 2-WAY SETS: its 4 lines are paired into 2 SETS. Still 16 bytes, but each block gets a choice.', point: 'cache', mood: 'happy' },
        { say: 'Before, each block had exactly one line, like a parking lot where your car must take spot 3, even if someone is in it.', picture: 'lines' },
        { say: 'Two blocks that needed the same line kept pushing each other out, even with other lines empty. Those are CONFLICT misses.', picture: 'lines', mood: 'worried' },
        { say: 'Now a block can take either line of its SET. When both are full, the one used longest ago makes room.', picture: 'sets' },
        { say: 'Two lists 16 bytes apart used to fight over one line, missing every time. Now both fit in their set.', picture: 'twoway' },
        { say: 'An address now picks a SET instead of a line. There are fewer sets than lines, so its tag takes one more bit.', point: 'cache' },
        { say: "Let's practice with two lists that used to collide.", point: 'line' },
    ],
    bigblocks: [
        { say: 'Your L1 now moves BLOCKS of 8 bytes instead of 4. It still has 4 lines, so it holds 32 bytes.', point: 'cache', mood: 'happy' },
        { say: "It's like carrying two bags in from the car on each trip instead of one: fewer trips, each a little longer." },
        { say: 'Each miss now brings in a whole 8-byte block, so more of the data next to it is already there. Fewer FIRST USE misses.', picture: 'bigblocks' },
        { say: 'Wide data needs this most: a 32-bit number fills a whole 4-byte block, so every new number was a miss.', picture: 'bigblocks' },
        { say: "A bigger block takes longer to send, about 5 ns more per miss. Here, half the trips is well worth it.", picture: 'bigblocks' },
        { say: "Let's practice: a job that sums 32-bit numbers.", point: 'line' },
    ],
    l2: [
        { say: `Meet your L2 CACHE: a second, bigger cache behind the L1. It holds ${bytes(L2)} bytes, eight times the first L1, but it's a little slower.`, picture: 'shelf', mood: 'happy' },
        { say: "Your L1 is a desk, and RAM is a library across town. The L2 is a shelf in the same room: not as handy as the desk, but no trip outside.", picture: 'shelf' },
        { say: `When the L1 misses, the L2 is checked next. If it has the block, it answers in ${ns(1, 'L2')} ns instead of RAM's ${ns(1, 'RAM')}: a short wait, not a long one.`, point: 'lookup' },
        { say: `If the L2 misses too, it's off to RAM, ${L2.ns} ns later than before: the L2 was checked on the way. That's the price of a level.`, point: 'lookup', mood: 'worried' },
        { say: `The L2 moves BLOCKS of ${L2.shape.blockBytes} bytes, so one trip to RAM brings the next numbers too. When the L1 misses them, the L2 has them.`, picture: 'l2loads' },
        { say: 'The lookup line and the bus now name where each load was found. Watch the waits: the L2 answers in fewer beats than RAM.', point: 'lookup' },
        { say: "How fast is memory, overall? Its AMAT: how long a load takes, on average. A hit is quick; each miss adds its share of the trip down.", picture: 'amat' },
        { say: "Let's practice: a job that reads 24 bytes twice. Count the short waits.", point: 'line' },
    ],
    l3: [
        { say: `Meet your L3 CACHE: a third cache, behind the L2. ${bytes(L3)} bytes: room for a whole 64-bit job, all 32 of its numbers.`, picture: 'library', mood: 'happy' },
        { say: 'Desk, shelf, and now a big bookcase down the hall, before the library across town. Further than the shelf, much nearer than town.', picture: 'library' },
        { say: `An L2 miss now checks the L3. If it has the block, it answers in ${ns(2, 'L3')} ns, not ${ns(2, 'RAM')}. If not, it's RAM, ${L3.ns} ns later than before.`, point: 'lookup' },
        { say: `The L3 moves BLOCKS of ${L3.shape.blockBytes} bytes: eight 64-bit numbers per trip to RAM, where the L2's blocks held two.`, picture: 'l3loads' },
        { say: "Wide numbers need it most: a 64-bit number fills two of the first L1's blocks, so each one misses the L1. The levels below catch them.", picture: 'l3loads' },
        { say: 'Real chips do this too: the further down a level is, the bigger its blocks, so each slow trip brings back more.' },
        { say: "Let's practice: a job that sums 16 numbers, 64 bits each. Watch which level answers.", point: 'line' },
    ],
    deep: [
        { say: 'Your DEEP PIPELINE splits each instruction into 10 smaller stages instead of 5. Smaller stages are quicker, so the clock ticks 1.5x faster.', picture: 'deep' },
        { say: 'Here is your clock: the same job, more beats a second. The screen still draws 5 rows; the extra stages are squeezed in between.', point: 'gauge' },
        { say: "The catch: a branch is now decided further from where instructions are fetched. A wrong guess throws away 4 instructions' work, not 1.", picture: 'deep', mood: 'worried' },
        { say: 'When you guess wrong, the notes freeze while the front of the pipeline refills: 4 cycles lost instead of 1.', point: 'rows' },
        { say: "So it's a trade. Guess badly and it's slower than before. Guess well, or have a good predictor, and the faster clock wins.", picture: 'deeptrade' },
        { say: "At the very top clock there's no faster tick left to gain, only the dearer wrong guesses. Real chips hit that wall too." },
        { say: 'You can switch it ON or OFF in the shop whenever you like. The shop shows a typical job both ways.', point: 'stats' },
        { say: "Let's practice with it on. Read the registers and guess right!", point: 'line' },
    ],
};
/** Everything the game teaches, as Progress.seenLessons remembers it: every lesson, the board's tour and the first day's. */
export const TAUGHT_IDS = [...Object.keys(LESSONS), BOARD_TOUR_ID, FIRST_DAY_ID, TIMECARD_TOUR_ID, CALENDAR_TOUR_ID];
//# sourceMappingURL=tours.js.map