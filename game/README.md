# Bit Cycler

A tycoon + rhythm game where every beat is one CPU clock cycle. You are the processor's control unit: route each instruction to the right unit on the beat, wait out data hazards, guess branches, and earn money from contracts to buy the hardware that does those jobs for you, from a single-cycle CPU to a pipelined one with forwarding, branch predictors, a cache, and a superscalar CPU that starts two instructions at once.

Made for CSC 3501 (Computer Organization), Fall 2026.

## How to play

The game opens on a dark screen: press any key to switch the computer on. It boots from your save, then shows the main menu as the computer's own disk.

**The goal.** Take contracts from the board. Each one is a program you play as a song: notes fall to a line, one beat per clock cycle, and each note is an instruction. Finish, get paid, and spend it in the shop on a faster CPU, so bigger contracts come within reach. A mistake never ends a song: the CPU just loses a cycle, and the results show what it cost.

**Playing a song**
| Key | What it does |
| --- | --- |
| `D` / `F` / `J` | Route the instruction on the line to its unit: ALU (math and logic), MEM (loads and stores), BRANCH |
| `Space` | Stall for a cycle, when the instruction needs a value still being computed (pipelined CPUs) |
| `J` / `K` | Branch prediction (tier 4 and up): guess the branch not taken / taken |
| Two lanes at once | Superscalar (tier 7): two instructions that can start together arrive side by side, a chord: press both lanes to start them as a pair. They can pair when each needs a different unit, the second doesn't need the first's result, and a branch comes second; one key is never wrong, just slower, and a chord on two that can't pair throws both away |
| `G` / `H` | Clock down / up 10% (above 100% needs the overclocking upgrade, and heats the chip) |
| `Q` (or `Esc`) | Pause menu: resume, restart, or go to the board, the calendar, the shop, the settings or the main menu |

Each song opens with a short count-in naming its music and the loop's key registers (`NEXT`, `END`). The music follows you: it moves on only when the CPU gets work done, so a stall makes it wait, a missed beat makes it skip, and a wrong guess stops it like a tape. After every song you watch its replay (`←` / `→` speed, `Space` pause, click anything to learn what it is), then the results: on time or late, the pay, the time the whole job took at your pace, and where the cycles went (CPI). Press `T` and TICK explains the numbers: what each lost cycle was, time per instruction, and how your CPU compares with the ones it improves on.

**Menus.** Arrows choose, `Enter` opens, `Q` (or `Esc`) goes back (on the board, the calendar and in the shop it opens the pause menu), `M` turns the computer's hum on or off. On the main menu: CONTINUE, NEWGAME, PRACTICE (your CPU, with notes that wait for you), SAVES (three slots, export and import), BRIEFS (every lesson TICK gives, to play again, and TICK's welcome), SETTINGS, README.TXT and CREDITS.TXT, SHUTDOWN. On the board: `L` logs off for the day, `C` opens the calendar, `S` opens the shop. In the shop: `Enter` buys, `B` goes back to the board.

**Settings.** The difficulty, how fast songs go: RELAXED (80%, with wider timing), EASY (100%), MEDIUM (115%, where you start) or HARD (150%); the pay is the same at every one, and practice always plays relaxed. Then the tutorial (how much TICK explains: full, short or off), START OVER (erases every save and brings back TICK's first tutorial), REDUCED MOTION (things jump into place instead of moving, and nothing bobs or pulses), audio calibration (line the light up with the click), volume, the hum, CRT effects and dark mode for the 90s desktop.

**A deep pipeline, if you want it.** Once you can guess branches on the 32-bit chip, the shop sells a deep pipeline: ten shorter stages, so the clock runs 1.5x faster, but a wrong guess throws away 4 cycles of work instead of 1. Switch it on or off in the shop whenever you like: it pays off if you (or your predictor) guess well. At the very top clock it gains nothing, as real chips found. (Stylized: real deep pipelines lost 10-20 cycles per wrong guess.)

**The workday.** Each day is 8 hours of your CPU's time, from 9:00 to 5:00. Every job uses up its time (at the pace you played it), and is due a few hours after you take it; a job your CPU couldn't finish before 5:00 waits until tomorrow (LATER). Jobs are sized to your CPU: easy, fair and stretch (tight: a sloppy run is late). Offers last a day or two. Choosing or hovering over a job shows on the workday bar how long it would take and when it would be done. Press `L` to log off: the day's timecard, then a new morning with new jobs. Finishing late pays half. The calendar (`C`) shows the month from November 1: what each day earned (pick one for its timecard), today, and the days offers end.

**Eras.** Your computer's look follows its CPU chip. Each wider chip you buy in the shop moves it into the next era: a green CRT (8-bit), DOS (16-bit), a 90s desktop (32-bit) and a modern terminal (64-bit).

**TICK teaches as you go.** TICK, the robot who lives in the computer, welcomes you on the main menu, shows you around the contract board and walks you through your first job (a bakery's till) instruction by instruction, and teaches each new part of the CPU on the real screen the first time it comes up, pointing at it and holding up pictures; then a practice, where notes wait for you and TICK explains each new situation, then the real thing. Press `Enter` to see the rest of what TICK is saying, and `Enter` again to go on. With the full or short tutorial, TICK also walks you through your first day: the workday, the job grades, logging off and the timecard, and the calendar. When TICK first says hello he asks if you've played before: the full tutorial, a short one (each new part, but not every instruction up close), or none. Every lesson is in BRIEFS on the main menu, whatever you choose. On the board, the job sheet shows the chosen contract: in the middle, what it pays, how long your CPU would take and when it's due; along the bottom, the details: the loop you'll play, its notes, and the memory it uses.

## Educational purpose and learning objectives

**Learning objective.** After playing, the player should understand a pipelined CPU's control decisions: determine which unit of the microprocessor each instruction must be routed to, when it has to wait for a value that isn't ready yet, and which way a branch is likely to go, and explain how each decision changes the CPI.

**How the game measures it.** The player *is* the control unit, so each of those decisions is a call they make on the beat, and the game counts every one: routing (the right unit or not, from tier 1), hazards (stalling when a value isn't ready, and only then, from tier 2) and branches (each guess, from tier 4). Missed and off-beat presses are timing, not understanding, so they don't count. Each job's results card shows its right calls ("RIGHT CALLS: ROUTE 60/60  HAZARD 4/5  BRANCH 12/14"), and REPORT.TXT on the main menu shows the share of right calls of each kind over all jobs and the last five, and charts each kind job by job, so a player's improvement shows. Press `T` on the results card and TICK explains how the job's calls and lost cycles add up to its CPI.

*Still to write before submission: the concepts covered (CPU time = instructions x CPI x clock period, pipelining and data hazards, forwarding, branch prediction, the power wall, the memory wall and caches), and which figures are simplified (the 8- and 16-bit CPUs are simplified teaching CPUs; the tempo, wear, overheat limits and the deep pipeline's numbers are stylized).*

## How it was developed

*To be written before submission.*

## Credits

- **Engine:** [Phaser 3.90](https://phaser.io) (MIT License).
- **Fonts** (`assets/fonts/`, see its `CREDITS.txt`): [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) by the JetBrains Mono Project Authors (SIL Open Font License 1.1); IBM BIOS, IBM VGA 9x16 and IBM XGA 7x15 from [The Ultimate Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/) by VileR (CC BY-SA 4.0, used unmodified).
- **Sounds:** the keyboard keys are cut from ["Typing on a keyboard"](https://freesound.org/s/489424/) by SamsterBirdies on Freesound (CC0; see `assets/sounds/CREDITS.txt`). Every other sound and all the music are made in code with the Web Audio API.
