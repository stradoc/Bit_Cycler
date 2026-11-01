import { LESSONS } from './lessons.js';
// What the guide says on each screen: a robot made of characters that walks
// the player through the real screen, pointing at its parts (everything else
// dims) or holding up a lesson picture. Every lesson is one of these tours;
// there are no slides. Lines are short and in sentence case, and written for
// someone who has never heard of a CPU: a new word comes in capitals, with
// what it means. Drawing is ui/guide.ts's job.
/** The guide's name. */
export const GUIDE_NAME = 'TICK';
/** The main menu's welcome (remembered in the settings, so it plays once per computer, save or no save). */
export const WELCOME_TOUR_ID = 'welcome';
/** The board's tour, as Progress.seenLessons remembers it. */
export const BOARD_TOUR_ID = 'board';
export const TUTORIAL = {
    full: { tours: true, closeLooks: true, tips: true },
    short: { tours: true, closeLooks: false, tips: true },
    skip: { tours: false, closeLooks: false, tips: false },
};
/** TICK's first words on the main menu: hello, and how much to teach. */
export const WELCOME_QUESTION = {
    say: `Hi! I'm ${GUIDE_NAME}, and I live inside this computer. Welcome to Bit Cycler! Before we start: have you played before?`,
    choices: [
        { answer: "I'm new. (FULL TUTORIAL)", level: 'full' },
        { answer: 'I already know most of this stuff. (SHORT TUTORIAL)', level: 'short' },
        { answer: "I've already been through this. (SKIP TUTORIAL)", level: 'skip' },
    ],
};
/** The whole welcome, after a new player's answer. */
export const WELCOME_TOUR = [
    { say: 'Every computer has a CPU: the chip that does all its work. This game shows you how a CPU works, from the inside.', picture: 'cpu' },
    { say: 'A CPU runs on a clock that ticks very fast. Here, every beat of the music is one tick, and you play the part that gives the orders.', picture: 'clock' },
    { say: 'Companies pay you to run their programs. With the money you buy parts that make your CPU faster, the way real CPUs got faster.' },
    { say: 'Start here. NEWGAME begins a new game; CONTINUE picks up where you left off.', point: 'new' },
    { say: 'Every lesson I give is kept in BRIEFS. Open it any time to see one again.', point: 'briefs' },
    { say: 'README has the keys and the rules. SETTINGS has the sound, the timing, and RELAXED mode if the beat is too fast.', point: 'readme' },
    { say: 'While you play, press ESC for the pause menu. After a song, click anything in its replay to learn what it is.' },
    { say: "Don't try to remember it all: I'll explain each thing the first time you need it. Let's go!", point: 'new' },
];
/** What TICK says after the answer: the whole welcome, a short one, or just where to find him. */
export const WELCOME_AFTER = {
    full: WELCOME_TOUR,
    short: [
        { say: "Alright, the short version. I'll still show you each new part of the CPU as you get it, but I won't go through every instruction." },
        { say: 'Every lesson I give is kept in BRIEFS, if you want one again.', point: 'briefs' },
        { say: 'Press ESC for the pause menu while you play, and change how much I explain in SETTINGS. Let\'s go!', point: 'settings' },
    ],
    skip: [{ say: "Got it! I'll stay out of your way. Every lesson is in BRIEFS, and SETTINGS can bring me back.", point: 'briefs' }],
};
export const BOARD_TOUR = [
    { say: "This is the contract board. Companies send in jobs for your CPU, and you get paid when it finishes them.", point: 'list' },
    { say: "OK means your CPU is fast enough for that job. SLOW means it isn't yet: a faster CPU from the shop will fix that.", point: 'list' },
    { say: "This is the job you've picked: who wants it, what it pays, and what they need done.", point: 'job' },
    { say: "This is the job's PROGRAM: a list of tiny steps called INSTRUCTIONS. These lines repeat once for each item.", point: 'loop' },
    { say: "Don't worry about reading it yet! In the song, each instruction becomes a note. This counts the notes for each lane.", point: 'notes' },
    { say: 'MEMORY is where the computer keeps its numbers, in numbered spots. The marks show which spots this job reads and writes.', point: 'memory' },
    { say: 'This is how long your CPU will take, against the deadline. A messy run is slower, and a late job pays half.', point: 'time' },
    { say: "Pick a job and press ENTER. Your first is a small one, picked so I can show you everything. See you on the next screen!", point: 'list' },
];
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
        { say: 'This is practice: notes wait for you, so take your time. I\'ll explain each new instruction as it comes.', point: 'line' },
    ],
    tier2: [
        { say: 'Until now, your CPU finished each instruction before starting the next. Most of its parts sat waiting.', picture: 'laundry' },
        { say: 'A PIPELINE overlaps them, like laundry: wash one load while the last one dries.', picture: 'laundry' },
        { say: 'Each instruction now goes through 5 steps called STAGES, one per beat. Up to 5 instructions are inside at once.', picture: 'stages' },
        { say: 'These rows are the later stages. A played note slides down: EX does the work, MEM reaches memory, WB saves the answer.', point: 'rows' },
        { say: "One catch: an instruction may need an answer that the one just ahead hasn't worked out yet. Then it has to wait.", picture: 'stall' },
        { say: "When that happens, a LINK joins the note on the line to the one it's waiting for. Press SPACE to wait a beat: a STALL.", point: 'rows' },
        { say: 'No link? Play it straight away. Too early gets it thrown out (FLUSHED), and waiting for nothing wastes a cycle.', point: 'line' },
        { say: 'Each stage is small, so the clock ticks 4x faster. Stalls raise CPI a little, but the pipeline still finishes far sooner.', picture: 'speedup' },
        { say: "Let's practice. Notes wait for you, and I'll explain each new thing as it comes.", point: 'line' },
    ],
    tier3: [
        { say: 'An answer is ready at the end of EX, but it only reaches its register two stages later. Waiting for that wastes beats.', picture: 'forward' },
        { say: 'FORWARDING adds wires that hand the answer straight to the instruction that needs it. No waiting!', picture: 'forward' },
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
        { say: 'A right guess costs nothing. A wrong guess throws out the instruction it started (FLUSHED) and loses a beat.', picture: 'guess' },
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
        { say: 'Practice time!', point: 'line' },
    ],
    overclock: [
        { say: "This is your CPU's clock and temperature. You can now OVERCLOCK: run the clock faster than it's rated for.", point: 'gauge' },
        { say: 'In a song, H speeds the clock up 10% and G slows it down. The music follows, since one beat is still one cycle.', picture: 'overclock' },
        { say: 'A faster clock needs more power, and power grows faster than speed: +50% clock costs over 2x the power. It all turns into heat.', picture: 'power' },
        { say: 'At 95°C the chip stops its clock to cool down, and the notes freeze until it reaches 80°C. Stalls use less power, so they run cooler.', picture: 'throttle' },
        { say: 'Every overheat wears the chip: its top speed drops 10%. The shop can repair it. (Real chips wear far more slowly.)', picture: 'damage' },
        { say: 'Smoke and flames warn you first. Press G before it gets too hot!', point: 'gauge' },
    ],
    memwall: [
        { say: 'Memory (RAM) is a separate chip from the CPU. Every trip there takes about 60 ns: 60 billionths of a second.', point: 'memory' },
        { say: 'In 40 years, clocks got thousands of times faster, but RAM only got a few times faster.', picture: 'ramtrip' },
        { say: '60 ns is 1 cycle at 16 MHz, but 240 cycles at 4 GHz. The faster your clock, the more cycles each trip wastes.', picture: 'wallchart' },
        { say: "So past a point, a faster clock hardly helps: the waits grow just as fast. That's the MEMORY WALL.", picture: 'floor' },
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
    deep: [
        { say: 'Your DEEP PIPELINE splits each instruction into 10 smaller stages instead of 5. Smaller stages are quicker, so the clock ticks 1.5x faster.', picture: 'deep' },
        { say: 'Here is your clock: the same job, more beats a second. The screen still draws 5 rows; the extra stages are squeezed in between.', point: 'gauge' },
        { say: "The catch: a branch is now decided further from where instructions are fetched. A wrong guess throws away 4 instructions' work, not 1.", picture: 'deep' },
        { say: 'When you guess wrong, the notes freeze while the front of the pipeline refills: 4 cycles lost instead of 1.', point: 'rows' },
        { say: "So it's a trade. Guess badly and it's slower than before. Guess well, or have a good predictor, and the faster clock wins.", picture: 'deeptrade' },
        { say: "At the very top clock there's no faster tick left to gain, only the dearer wrong guesses. Real chips hit that wall too." },
        { say: 'You can switch it ON or OFF in the shop whenever you like. The shop shows a typical job both ways.', point: 'stats' },
        { say: "Let's practice with it on. Read the registers and guess right!", point: 'line' },
    ],
};
/** Everything the game teaches, as Progress.seenLessons remembers it: every lesson, and the board's tour. */
export const TAUGHT_IDS = [...Object.keys(LESSONS), BOARD_TOUR_ID];
//# sourceMappingURL=tours.js.map