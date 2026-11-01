# Bit Cycler

A tycoon + rhythm game where every beat is one CPU clock cycle. You are the processor's control unit: route each instruction to the right unit on the beat, wait out data hazards, guess branches, and earn money from contracts to buy the hardware that does those jobs for you, from a single-cycle CPU to a pipelined one with forwarding, branch predictors and a cache.

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
| `G` / `H` | Clock down / up 10% (above 100% needs the overclocking upgrade, and heats the chip) |
| `Esc` or `Q` | Pause menu: resume, restart, or go to the board, the shop, the settings or the main menu |

Each song opens with a short count-in naming the loop's key registers (`NEXT`, `END`). After every song you watch its replay (`←` / `→` speed, `Space` pause, click anything to learn what it is), then the results: where the cycles went, CPI, and the time the whole contract takes at your pace.

**Menus.** Arrows choose, `Enter` opens, `Esc` or `Q` goes back (on the board and in the shop it opens the pause menu), `M` turns the computer's hum on or off. On the main menu: CONTINUE, NEWGAME, PRACTICE (your CPU, with notes that wait for you), SAVES (three slots, export and import), BRIEFS (every lesson TICK gives, to play again, and TICK's welcome), SETTINGS, README.TXT and CREDITS.TXT, SHUTDOWN. On the board: `S` opens the shop. In the shop: `Enter` buys, `B` goes back to the board.

**Settings.** Relaxed mode (wider timing and a slower beat), audio calibration (line the light up with the click), volume, the hum, CRT effects and dark mode for the 90s desktop.

**Eras.** Your computer's look follows its CPU chip. Each wider chip you buy in the shop moves it into the next era: a green CRT (8-bit), DOS (16-bit), a 90s desktop (32-bit) and a modern terminal (64-bit).

**TICK teaches as you go.** TICK, the robot who lives in the computer, welcomes you on the main menu, shows you around the contract board, and teaches each new part of the CPU on the real screen the first time it comes up, pointing at it and holding up pictures; then a practice, where notes wait for you and TICK explains each new situation, then the real thing. Press `Enter` to see the rest of what TICK is saying, and `Enter` again to go on. Every lesson is in BRIEFS on the main menu. On the board, the job sheet shows the chosen contract: the loop you'll play, its notes, the memory it uses, and how long your CPU would take.

## Educational purpose and learning objectives

*To be written before submission: the concepts covered (CPU time = instructions x CPI x clock period, pipelining and data hazards, forwarding, branch prediction, the power wall, the memory wall and caches), the measurable learning objective and how the game measures it, and which figures are simplified (the 8- and 16-bit CPUs are simplified teaching CPUs; the tempo, wear and overheat limits are stylized).*

## How it was developed

*To be written before submission.*

## Credits

- **Engine:** [Phaser 3.90](https://phaser.io) (MIT License).
- **Fonts** (`assets/fonts/`, see its `CREDITS.txt`): [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) by the JetBrains Mono Project Authors (SIL Open Font License 1.1); IBM BIOS, IBM VGA 9x16 and IBM XGA 7x15 from [The Ultimate Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/) by VileR (CC BY-SA 4.0, used unmodified).
- **Sounds:** the keyboard keys are cut from ["Typing on a keyboard"](https://freesound.org/s/489424/) by SamsterBirdies on Freesound (CC0; see `assets/sounds/CREDITS.txt`). Every other sound and all the music are made in code with the Web Audio API.
