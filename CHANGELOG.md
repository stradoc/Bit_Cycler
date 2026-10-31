# Changelog

The decisions in force, then a short entry per work session, newest first: what changed and why, the main files, and what was verified or still needs checking. The long notes from before this file was condensed (measurements, playtest details, every fix) are in git history: `git show 58b85cf:CHANGELOG.md`.

## Decisions

Technology and design decisions, with the reason for each (`RULES.md` rule 3). A decision that changed an earlier one says what it replaces.

### Technology

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-28 | Rendering: **Phaser 3.90** (a move to Phaser 4 possible later) | A full framework with built-in WebGL effects (bloom, barrel) and a pixel-art mode; far more docs and examples than Phaser 4, which matters in a one-month project |
| 2026-10-28 | Language: **TypeScript 7.0.2** (native compiler), with exact versions pinned (`phaser@3.90.0`, `@types/node@22.20.5`) | Type checking before running keeps the code consistent for the team and for Claude; only the plain compiler is used, so 7.0's plugin gaps don't matter (fallback: 6.0.3, no code changes) |
| 2026-10-28 | Audio: **the raw Web Audio API** | No dependency; the beat clock stays small code the team can explain; oscillators give a chiptune sound |
| 2026-10-28 | Testing: **Node's built-in `node:test`**, on the TypeScript source through type stripping (`erasableSyntaxOnly`) | Nothing to install; enough to verify the CPU model's numbers |
| 2026-10-28 | Build: **plain `tsc`, no bundler**; commit both `src/` and compiled `js/` | The smallest build step; the output mirrors the source and runs as-is on GitHub Pages |
| 2026-10-28 | **No WebAssembly** | The simulation is trivial to compute; wasm would add a toolchain and debugging cost for nothing |
| 2026-10-28 | Package manager: **npm**, for dev tools only; dev server: **`python3 -m http.server`** | Both already installed; teammates may use any static server; `node_modules/` never ships |
| 2026-10-28 | Git: **a separate team repo**; everyone works in `game/`, copied to `games/bit-cycler/` in the course repo at submission | A small repo with only our work; planning files stay out of the shipped folder |
| 2026-10-28 | All keyboard input through `game/src/input/keys.ts`; Phaser's keyboard plugin off | Phaser re-runs its per-frame key queue on every new key event, so keys fired twice or more |
| 2026-10-29 | **Fonts bundled**: JetBrains Mono (64-bit era, SIL OFL) and period PC fonts from The Ultimate Oldschool PC Font Pack (IBM BIOS, IBM VGA 9x16, IBM XGA 7x15; CC BY-SA 4.0), credited in `game/assets/fonts/CREDITS.txt` | Each era's text looks like its machines'; bundled, so it works offline with no outside request |
| 2026-10-29 | **The shop's 3D chip uses a small renderer of our own**, not Three.js | About 300 lines and no dependency (Three.js: ~650 KB, a second 3D engine the CRT effects wouldn't reach); its math (rotation, projection, culling, drawing order) is explainable |
| 2026-10-30 | **Recorded keystrokes** for the menu's keys: a Cherry MX Blue keyboard, CC0 from Freesound (#489424), credited in `game/assets/sounds/CREDITS.txt`; every other sound stays synthesized | Synthesized clicks never sounded like a mechanical keyboard; CC0 needs no license terms; 168 KB |
| 2026-10-30 | **One place for each thing that changes across screens**: eras in `ui/eras.ts`, one screen base and kit in `ui/`, every sound a named cue (`audio/cues.ts`) through buses with one table of levels (`audio/mix.ts`); the song screen in parts (`song/`) | Team: screens, rendering and audio standardized and modular, so a change is made once for every screen. Our own code structure, no new technology |
| 2026-10-30 | **Sounds exported as WAV files by a team tool** (`npm run export-sounds`): the game's own sound code renders offline in headless Chrome; nothing new ships | Team asked for the sounds as files to listen to and edit; uses code we already have, no npm package. Playing edited files in the game is a later decision |

### Game design

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-28 | Concept: **a tycoon + rhythm game where each beat is one clock cycle**; title **Bit Cycler**, folder `bit-cycler` | Ties the rhythm play to CPU concepts, so the mechanics teach |
| 2026-10-28 | **Scope by phases**, no internal due dates; only Nov 30 is fixed | The team expects to move faster than a fixed schedule |
| 2026-10-28 | Instruction set: **RISC-V inspired**, for CPU word sizes growing **8 → 16 → 32 → 64-bit** (a gameplay mechanic, separate from the art style) | Matches the textbook's notation; real RV32I / RV64I at 32 / 64-bit, simplified teaching CPUs at 8 / 16-bit (the README must say so) |
| 2026-10-28 | **The player is the control unit**: each tier adds one decision (route → stall → guess → predictor), and upgrades automate it | Players learn what hardware does by doing its job by hand first |
| 2026-10-28 | **Tier 1: route each instruction to its unit** (ALU / MEM / BRANCH lanes, keys D / F / J); a wrong unit or a miss costs a cycle | Makes tier 1 about reasoning (instruction classes), and CPI shows the cost |
| 2026-10-28 | **Briefing → practice → play** for every concept, one idea per card (a picture, ≤ 3 short lines, an analogy); a part's briefing plays straight after buying it and can't be skipped | Concepts must be easy to digest before they're tested; playtest skipped optional briefings |
| 2026-10-28 | Notes use **syntax highlighting, not color by unit** | Coloring by unit would let players route by color without reading the instruction |
| 2026-10-28 | **Pipeline fill**: the clock never changes with mistakes; correct play keeps the pipeline full (the music adds a layer per occupied stage); a flush strikes notes out and the pipeline refills | A tempo change on mistakes would teach something false: hazards don't slow the clock |
| 2026-10-28 | **The highway is the pipeline**: the hit line is ID, with EX / MEM / WB rows below and a link from a waiting note to the instruction computing its value; results show on notes and travel a bus to the panel; every run is followed by its replay, with click-to-learn | Playtest: a separate pipeline strip was too far from the notes; five views were tried and these kept |
| 2026-10-28 | **Tier 1 plays on the same screen** as tiers 2–6 (a single-cycle mode in the simulator) | Every feature (bus, replays, explanations, heat) reaches every tier |
| 2026-10-28 | **Tier 4: the player guesses branches** (J not taken, K taken), each branch glowing in the color of what it did last time, with a badge so color isn't needed; **tiers 5–6: a 1-bit / 2-bit predictor guesses first** and the player follows or overrides it | A colored glow reads at a glance; showing the last outcome is what a 1-bit predictor knows, and its loop-exit miss sets up the 2-bit one. Overriding keeps a decision at every branch |
| 2026-10-28 | **The tempo follows the rated clock**: 75 BPM at 1 MHz, +20 BPM per 10× clock (pipelined 87 → ~147 BPM, single-cycle 75 → ~135); relaxed mode and practice at 80%. Replaces a fixed tier 1 tempo (80 BPM) and a gentler +12 BPM curve | Upgrades should be felt in the song; a log scale keeps a 4000× clock range playable. CPU-time math uses the real period |
| 2026-10-28 | **The clock dial is in the song** (G / H, 50–150% of the rated clock, the tempo following); overclocking past 100% is a shop upgrade, underclocking is free | Makes CPU time = instructions × CPI × period a player choice; underclocking is an honest difficulty option (slower, but more CPU time) |
| 2026-10-29 | **Heat and wear**: power = f·V² with voltage rising with the clock; heat builds over ~15 cycles; **an overheat stops the clock** until it cools (5–8 beats; the time counts in CPU time, not CPI) and lowers the chip's top clock 10% until repaired; **each step of wear lowers the overheat point** (88°C at 140% ... 65°C at 100%), so a worn chip's top clock stays as risky as 150% on a new one, and a worn-out chip overheats at its rated clock. Replaces throttling back to the rated clock | Teaches the power wall, thermal throttling (real CPUs stop their clock when too hot) and wear by feel; with gentler heat, an overclocked song couldn't burn the chip, and one overheat made it safe |
| 2026-10-29 | **The loop's key registers are tagged** (NEXT, END, GRID) in the panel and introduced in a ~4 s count-in; **x1 is always NEXT and x2 always END** (other registers stay random) | The next and end addresses should be easy to find, and in the same place every song |
| 2026-10-28 | **An endless contract board and a shop**: random jobs in STARTER / STANDARD / ADVANCED, each showing the whole job's time on your CPU; **each contract has its own deadline**: locked if your CPU couldn't make it playing perfectly, half pay if the pace you played is late. Replaces a single 30-day lock | Shows how slow early CPUs are ("117 YEARS") and lets upgrades open better work; deadlines make CPI from your own play matter |
| 2026-10-29 | **Contracts are for made-up clients**, each with a **generated program** (9 kinds with random sizes, data and order, rebuilt from a seed); results are ASCII charts | Contracts feel like real work without imitating real companies; variety without hand-written programs; the charts make instructions × CPI × period readable |
| 2026-10-29 | ADVANCED contracts are **10–70 trillion instructions**, provisional until a balance pass after word size | With the memory wall, the most-missing program couldn't make a 7-day deadline at the old sizes |
| 2026-10-30 | **The campaign is the existing progression for now**; the debt deadline is to become its goal and ending, with the endless board as free play after | One way to play; the deadline gives the rubric's clear objective |
| 2026-10-28 | Relaxed mode: wider timing windows and the beat at 80% | Simple; "the pipeline waits for input" is still open |
| 2026-10-28 | Pipeline depth (later): **cut the datapath** in a designer; stalls stay manual at every depth | Cutting also teaches stage balancing |
| 2026-10-30 | **An intro**: the computer powers on and boots from the save (CPU, clock and cycle time, a trip to RAM in cycles, cache, cooler, wear), each era like its machines, then types the commands that start the game; any key skips | Like SUPERHOT's terminal coming to life (the idea, not its content); the boot changes with every upgrade and repeats the clock period and memory wall in numbers |
| 2026-10-30 | **The main menu is the computer's disk**, listed the way each era listed files (programs to run, SAVES and BRIEFS folders, SETTINGS.CFG, README.TXT, CREDITS.TXT, SHUTDOWN.EXE); more glow on dark screens. Replaces a plain list menu | Closer to SUPERHOT's file-system menu (the idea only: nothing of its names, text or assets) |
| 2026-10-30 | **Three save slots and a developer save**, export / import as a file, deleting asks twice; briefings read are kept per save. **A settings screen** (relaxed mode, calibration, volume, hum, CRT effects strength, era, dark mode). **A developer screen** behind the backquote key | The team asked for saves; files move saves between computers; developer mode lets the team and graders reach any tier |

### CPU and memory model

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-28 | **The memory hierarchy plan**: L1 → L2 → L3 → RAM page frames + HDD → SSD / NVMe, as a labeled miniature (16-byte L1, 256-byte RAM, 16-byte pages); cache levels play automatically, a page fault pauses the song for its own view. If time runs short, drop SSD / NVMe, then L3 | Covers the textbook's hierarchy without adding to the song's load; page faults are slow enough to pause for |
| 2026-10-29 | **RAM takes 60 ns** (approximate), so its cost in cycles grows with the clock (1 at 16 MHz, 240 at 4 GHz); **each cache level adds its own lookup time to a miss** (L1 ~1 ns; later L2 ~5, L3 ~10–15). Replaces ~80 ns | Patterson & Hennessy give 50–70 ns for DRAM; a full miss grows as the hierarchy is bought, while misses get rarer |
| 2026-10-29 | **A memory wait freezes the whole pipeline**, squeezed into 2 / 3 / 5 beats on a log scale with the real cycles counted; stores wait until the L1 brings a write buffer; no write allocate; instruction fetch is always fast | The textbook's in-order pipeline; squeezing keeps a 240-cycle wait from eating the song while every cycle still counts |
| 2026-10-28 | **One L1 shape**: 16 bytes, direct-mapped, 4 lines × 4 bytes (`tttt ii oo`), write-through with a write buffer; automatic in the song (no new keys), taught by the panel, the results and a briefing. Choosing a shape comes later | Tier 6 players already route, stall, guess and turn the dial; the textbook's first cache, where conflict misses show best |
| 2026-10-29 | **The L1 goes on sale once a trip to RAM takes over a cycle** at your rated clock; the memory wall briefing comes with the clock upgrade that crosses it, the cache briefing after buying the L1 | The cache only makes sense once you've felt the wall |
| 2026-10-29 | **The panel shows memory 0–31** with the L1 beside it; ADD ARRAYS puts its arrays a cache-size apart half the time | With 16 bytes of data in a 16-byte cache only first-use misses could happen; conflict misses are the clearest lesson for direct-mapped caches |

### Look and sound

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-28 | **Layout at 960×540** (was 480×270) | Text at 480×270 was too hard to read |
| 2026-10-28 | **An old-terminal look that modernizes by era**: green CRT (8-bit) → DOS app (16-bit) → mid-90s desktop with a dark mode (32-bit) → terminal window on an LCD (64-bit). Era styling, not a claim that word size changes the screen; generic, with no real products, logos or system fonts | Fits the hardware theme; each era looks like a computer of its time, without imitating any company |
| 2026-10-29 | The retro eras draw a 960×540 canvas stretched with chunky pixels; the 32- and 64-bit eras draw at the screen's resolution, the 64-bit one with smooth motion; **the CRT's scanlines and vignette are an overlay at the screen's own resolution** | Each era should feel like its time; the overlay stays fine over chunky pixels |
| 2026-10-30 | **The glow adds to the picture** (Phaser's bloom runs at half strength, the result doubled) and **the CRT overlay blends as soft light** | Phaser's bloom averages the picture with its blur, which halved the letters' brightness; this keeps the halo and makes the letters bright |

## 2026-10-30

### Documents rewritten (uncommitted)
- **Why** (team): get rid of redundancy, and explain in `CLAUDE.md` how to add features (a campaign mode, audio, screens, gameplay) for future AI.
- `CLAUDE.md`: the code map, how to add a screen, a sound, an era, a song feature, a tier or shop part, a contract kind, the campaign mode, a briefing and a setting; conventions; how to verify changes in headless Chrome; the gotchas found so far (moved here from old changelog entries).
- `README.md`: team setup, commands, dev shortcuts and cheats only; the controls moved to `game/README.md`, which now has How to play and Credits (the educational purpose and how it was developed are still to write).
- `ROADMAP.md`: open work in priority order, a "Needs a real browser" checklist and a short Done list (the Step 0 list repeated the Decisions table).
- `CHANGELOG.md`: the Decisions table grouped by topic, current decisions only (replaced ones folded into the rows that replaced them), and the table no longer breaks at blank lines; history condensed, the long version in git history.
- `data/tiers.ts`: a stale comment (the removed `T` key).

### One place for eras, screens and sound; the song screen in parts; sounds as files (58b85cf)
- **Eras in one file** (`ui/eras.ts`): colors, font, `kind` (how widgets draw), `screen`, `computer` (display, drive, BIOS, file names), `sound`, chip style, dark variant. `data/boot.ts` and `data/menuFiles.ts` take an era.
- **A screen kit** (`ui/`): `theme.ts`, `widgets.ts` (`Box`, `PressButton`, panels), `list.ts` (`ListMenu`, now also the shop's), `screen.ts` (`Screen`, which every scene extends: the look, hum, keys with M everywhere, standard title, about, message and hint lines). Every screen's title, hints and messages now sit where the main menu has them.
- **Sound as one system** (`audio/`): buses and `LEVELS` (`mix.ts`), building blocks (`synth.ts`), every short sound as a named, typed cue (`cues.ts`), the hum built from the era's computer (`hum.ts`; the modern era's LCD and SSD make no whine or drive noise), power and chime (`machine.ts`). Replaces `audio/menu.ts` and `audio/sfx.ts`.
- **The song screen in parts** (`scenes/PipelineScene.ts` 2,187 → 746 lines): `song/highway.ts`, `panel.ts`, `bus.ts`, `gauge.ts`, `replay.ts`, `results.ts`, with all its text in `words.ts`.
- **`npm run export-sounds`** (`tools/export-sounds.mjs`, `audio/render.ts`, `audio/wav.ts`): 34 WAV files in `sound-export/` (not committed).
- Tests: 111. Verified in headless Chrome against the previous build side by side: full autoplayed songs on tiers 3 and 4, practice, replays and click-to-learn (identical), every screen in every era. Still to hear in a real browser: every sound. Found, older than this: clicking empty space in a replay doesn't close the explanation.

### Intro, the main menu as a disk, settings, saves, developer mode; menu sounds (93efb2a)
- **Intro** (`scenes/BootScene.ts`, `data/boot.ts`): power on (a CRT's line opening out, an LCD's backlight), a self test reporting the save, each era's commands typing themselves, the contracts' programs scrolling past as they load, then a title splash with a start-up chime. About 12 s, half that after the first time; any key skips.
- **Main menu** (`scenes/TitleScene.ts`, `data/menuFiles.ts`): the computer's disk listed the era's way, with README.TXT and CREDITS.TXT in block letters, SHUTDOWN.EXE (the screen collapses back to the power button), code scrolling in the margins, and an arrival that types itself in.
- **Settings, three save slots and a developer save, export / import, a developer screen** (`SettingsScene`, `SavesScene`, `DevScene`, `save.ts`, `saveFile.ts`, `files.ts`); a volume setting on a squared curve (`audio/output.ts`).
- **Menu sounds** modeled on SUPERHOT's terminal sounds (measured for length, pitch and balance; nothing of theirs used): dry key ticks, ping / pong, a flat error buzz, a tick per new line, boot sounds (power, POST beep, floppy, hard drive), a quiet room hum; keys recorded from a real mechanical keyboard. A dial-up modem was tried and dropped (too much).
- **Fixed**: letters dimmed by the glow and the CRT overlay; the shop's chip drawing parts through each other (now ordered by planes between whole parts); the boot running twice on slow frames; a pile of sounds after switching back to the window.

## 2026-10-29

### A period font for each era (a8c8a1d)
- IBM BIOS (8-bit), IBM VGA 9x16 (16-bit), IBM XGA 7x15 (32-bit), loaded with JetBrains Mono before the game starts (`loadFonts` in `visual/display.ts`).

### The memory wall and the L1 cache; the eras reworked; a 3D chip (0ea9423)
- **Memory** (`sim/memory.ts`): RAM in fixed time, a freeze in the song while a load or store waits (the request up the bus, the data back, a counter of real cycles, a drone in the music); the L1 cache, its box in the panel and a lookup line; results with waiting on RAM, hit rate and a no-cache comparison; the L1 in the shop; the memory wall and cache briefings.
- **Eras**: the 16-bit era as a DOS app (menu and status bars, double lines, drop shadows), the 32-bit era as a mid-90s desktop app (3D window and buttons that press in) with a dark mode, the 64-bit era as a terminal window on an LCD with JetBrains Mono and smooth motion; the CRT overlay at the screen's resolution.
- **The shop's chip** (`visual/chip3d.ts`): a spinning 3D model built from the parts owned, drawn as each era drew 3D (wireframe, flat, low-poly, smooth).

### Overheating stops the clock (f58e570)
- An overheat stops the clock until the chip cools (notes freeze, the music stops); its time counts in the results. Wear keeps lowering the overheat point down to the rated clock. Also the rubric check: everything required is met except the paperwork, the learning objective's measurement and a textbook check (now at the top of `ROADMAP.md`).

### Clients, generated programs, charts, tempo, key registers (a59c56b)
- Contracts for made-up clients with generated programs (`sim/generator.ts`, 9 kinds); results as ASCII charts (`visual/asciiChart.ts`); the tempo follows the rated clock (`rhythm/tempo.ts`); the loop's key registers tagged and introduced in a count-in; heat builds faster and a worn chip overheats sooner; the bus stops at the panel's edge.

## 2026-10-28

### The economy: board, shop, upgrades, saves, deadlines (da7870e, 95683f5)
- The contract board and shop (`BoardScene`, `ShopScene`, `sim/progress.ts`, `data/economy.ts`), clock upgrades, cooling, repairs, an overclocking upgrade, a save in browser storage, testing cheats (`cheats.ts`); briefings made mandatory after buying; tier 1 moved onto the pipeline screen; the first menu sounds; then a deadline per contract, locked or tight jobs, half pay when late.

### Overclocking, heat, wear and fire (e700c0d)
- The clock dial in the song (G / H), a heat model (`sim/thermal.ts`), chip wear, fire effects (Phaser's particles, `visual/heat.ts`), the overclocking briefing; the conductor changes tempo between beats.

### Tiers 3 to 6 (2ba193e, fd319cd, 527c420, 7cff617)
- Tier 3: forwarding, its wire and a three-way results comparison. Replays after every run with speed, pause and click-to-learn (`data/glossary.ts`). Tier 4: the player guesses branches, with glowing hints and history in the listing; titled panel boxes; hover outlines in replays. Tiers 5–6: 1-bit and 2-bit predictors to follow or override, the SUM GRID program, longer branch lessons.

### Tier 2: the pipeline (467e366, ce8bab5, af4dc6c)
- The textbook 5-stage pipeline simulator (`sim/pipeline.ts`: hazards, stalls, flushes; SUM ARRAY 43 cycles, 35 with forwarding); the run logic (`rhythm/pipelineRun.ts`); music in layers (`audio/music.ts`); the tier 2 lesson and practice; then, after playtest, the highway as the pipeline with results on notes, the bus, a program listing and replays.

### Tier 1, tutorials, the eras, the scaffold (9dcd09b, c9c0ed5, 089dda9, a815cde, 97c44ad)
- The scaffold (TypeScript, Phaser, the audio-clock beat), the four terminal eras, the single-cycle CPU and assembler, the first program (SUM ARRAY), the play screen and results; briefing → practice → play; keys through `input/keys.ts` (Phaser's plugin fired them twice), `Q` to quit (Vimium swallows Esc), the tempo from the clock.
