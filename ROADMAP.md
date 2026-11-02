# Roadmap

What's left to build, in priority order, with a short list of what's done at the end. Decisions and history are in `CHANGELOG.md`; the rules in `RULES.md`; how to build things in `CLAUDE.md`.

**MVP =** tiers 1–3 (single-cycle → 5-stage pipeline → forwarding, branch prediction, L1 cache), contract board, shop, and a results screen with CPI (RAM page frames and the HDD were in it until they were parked on 2026-10-31). **Done when** a new player can go from tier 1 to tier 3 in one ~30-minute session, the CPI numbers are verified by tests, and the game runs from a plain static server.

There are no internal due dates; the only fixed date is the course deadline, **Nov 30, 2026**.

## Before submission (required, in priority order)

From the rubric check (2026-10-29). Everything else the spec requires is met: browser, no installs, 3.6 MB of the 35 MB limit, relative paths, mechanics that teach, no quizzes, feedback, progression, in-game instructions.

- [ ] **`game/README.md`**: How to play and Credits are written; the learning objective and how it's measured are written; still to write: the concepts covered (say the 8/16-bit CPUs are simplified teaching CPUs and which figures are approximate) and how it was developed
- [ ] **`thumbnail.png`**: 16:9 PNG, exactly 800×450, ≤ 500 KB
- [ ] **Every teammate commits their own work**: only students who actively contribute get credit, and all commits so far come from one account
- [ ] **Outside playtest**: someone new plays from the title through tier 3; fix what they trip on; tune the timing windows (see "Needs a real browser")
- [ ] **Textbook check**: stall counts, forwarding, branch penalty, CPU time, the power wall and every latency figure against Patterson & Hennessy; label what's stylized (the tempo curve, wear, overheat limits)
- [ ] **Submission**: a `games.yml` entry (title, authors, topic, description, learning_objective, game_url, thumbnail), copy `game/` to `games/bit-cycler/`, test on GitHub Pages, pull request by Nov 30

## Next up

The latest handoff (what's done, what's unchecked, what's next) is the top entry of `CHANGELOG.md`.

Upgrades follow microprocessor history and stay with the CPU and its control logic (decided 2026-10-31; the reasoning and sources are in the design doc's "Eras and upgrade order").

0. **Animations as data** (decided 2026-11-01; Decisions table). Phases, each playable, each deleting what it replaces:
   - [x] **1. Foundation** (done): `data/motions.ts` (recipes: tracks of keyframes, duration, easing, delay, stagger, loops; the pure maths of easing, sampling and each era's style), `motion` in each `ERAS` entry (style: cut, step, tween, ease; fps; character cell; afterglow; variants), `visual/motion.ts` (one player per screen, `motionOf(scene)`, updated by `Screen.update`), REDUCED MOTION in the settings; the first recipes: gliding in, the list's sliding bar
   - [ ] **2. One-shots and loops**: the song screen's are done (2026-11-02: fades, flashes, the highlight settling, the count-in, the waiting notes' pulse, the timing mistake's jolt). Left on other screens: the settings' beat light (`SettingsScene`), a picture's pulsing light (`visual/diagrams.ts`), the main menu's and the boot's (phase 5), the shop's, cursor blinks
   - [x] **3. TICK** (done): drawn the era's way (`data/tick.ts`: poses, and four looks: ASCII, code page 437, a VGA pixel sprite, vector shapes; drawn by `visual/tickFigure.ts`), his bob, walk and the spotlight's pulse as recipes (smooth in every era, the user's choice: the `tick` group in `GROUP_STYLES`), walking feet, moods (happy, cheer, worried) on tour lines. His typing speed and his blink, mouth and step timings are data in `TICK` (they change what he shows, not where he is)
   - [ ] **Charts and cards in each era's style, last** (user: "keep it in the style of the era, for 16 bit, keep it similar to MS-DOS, 32-bit, late 90s, and 64 bit, modern day"; then: "For now lets stop changing the era styles, we'll do that last. Because we might want to add more features"): the results card is done (`ui/card.ts`). Once the features are in, the same kit for the board (the job sheet's deadline bar and notes per lane, the workday bar, the block-digit clock, the calendar page, the timecard) and the calendar screen (its month grid and the day's timecard). REPORT.TXT is a text file, so it stays in characters (the era's character set)
   - [x] **4. Gameplay feel** (done 2026-11-02): every song-screen animation is a `song` recipe, smooth in every era (the user's choice), lasting one of the lengths in `PACE`; notes stepping down the rows, the listing's slide (now in every era), values on the bus (fitted to the beat), the hazard and memory pulses; a test fails on tweens, camera effects or hand-timed waves in `song/` and `PipelineScene`. Positions on the beat stay in `Highway.syncNotes`. Branches made clear on it: a flushed note is struck, stamped FLUSHED and pushed out of its slot; notes fetch won't reach slide out of their lanes; a callout (REDIRECTED BY BRANCH UNIT, taken or not) over the note fetch was sent to, with an arrow from the branch. Still to judge in a real browser: how they feel at full frame rate and speed
   - [ ] **5. Transitions**: power on and off (CRT beam or LCD fade as era variants), the title's arrival, the boot's typing
   - [ ] **6. Motion lab and docs**: done for recipes (2026-11-02: `?scene=motions`, the developer screen's MOTION LAB: every recipe on a sample, in any era, frozen at a time; "An animation" in `CLAUDE.md`). Left: TICK's poses in the lab
   - Not yet: the heat particles, the 3D models' motion
0. **From the user's notes (2026-11-02)** (the branch animations are done: item 0, phase 4):
   - [ ] Practice: after the first practice, notes still wait for you, but TICK doesn't stop you over a note missed by half a second; he teaches the new idea and gets out of the way
   - [ ] TICK's full tutorial of every instruction moves to the first contract, where he asks whether you want it: FULL, SHORT or NO TUTORIAL
   - [ ] Superscalar: make chords easier to see (FETCH higher up, or the chords shown at the top)
0. **From the user's notes (2026-11-01)**: all four done (results card, job sheet, difficulty, 12 songs and 13 kinds of program). Left from them:
   - [ ] Listen to the 12 songs and the music's reactions (`sound-export/music/`, `music/reactions/`), and play a song with sound (missed beats, stalls, wrong guesses): nothing here can hear them
   - [ ] Later: each era's own music style (DOS, 90s desktop, modern), added to the songs' table as data
1. **Contracts redesign: a workday, a reputation, special jobs** (decided with the team 2026-11-01; Decisions table). Three phases, each playable on its own:
   - **Phase 1: done** (the workday, the calendar and its month page, jobs sized to your CPU, and TICK's first-day tours; CHANGELOG 2026-11-01). New kinds of events (special contracts, a campaign's deadline) go in `eventsOn` (`sim/workday.ts`). Still to tune by playing: pay per hour, the grades' shares, a day's pace.
   - **Phase 2: streak and reputation.** A streak of on-time jobs raises a pay multiplier (about +10% each, up to 2x); a late job resets it; a streak of 5 (say) brings a special contract. Reputation rises slowly with on-time jobs and falls with several lates in a row; it decides which clients offer work, so the big, well-paid ones need reputation (in place of the ADVANCED section). Ads in the shop buy reputation back, with diminishing returns. Both shown on the board (reputation as stars) and the timecard.
   - **Phase 3: special contracts and trophies.** Special jobs that feel different, not just pay more, and teach (almost all branches; cache-hostile; no stalls allowed). Each earns a trophy: 3D, drawn by our own renderer (`visual/model3d.ts`, now general: the shop's chip and the main menu's title are models on it), standing on an ASCII shelf with labels and "?" slots for those not yet earned; the chosen one spins, in each era's 3D style. Maybe a 3D punch clock on the timecard. Later rewards: OS colors, dark modes, past eras' screens (the computer still moves forward), keyboard sounds.
   - Numbers to settle by playing, in `data/economy.ts`: the size spread, pay per hour of job time, the streak's step and cap, the special contract's streak, reputation's steps and thresholds, ad prices.
2. **Word size, phase 2: the CPU model.** 16-, 32- and 64-bit registers (64-bit needs JavaScript's built-in BigInt; `Cpu.wrap` breaks at 32 bits today), wider loads and stores (`lh` / `lw` / `ld`, `sh` / `sw` / `sd`) and `sltu`; the generator writes programs that work on wide data in pieces, each piece's carry found with `sltu` (a chain of hazards); contracts state their data width ("32-BIT DEPOSITS") and the board's instruction counts come from tracing those programs; byte jobs gain nothing. Songs on wide data play fewer items so they keep their length. Tests against hand-worked counts. Open: the L1's 4-byte blocks are smaller than a 64-bit word.
3. **Word size, phase 3: the song screen.** Registers shown at the chip's width (64-bit needs a new panel layout), the carry chain's practice tips and click-to-learn, results showing instructions per item, a lesson (the guide's tour, and practice) for each chip.
4. **Hardware multiplier** (end of the 8-bit era, like the Motorola 6809): without it a multiply is a loop of shifts and adds; with it, one `mul` that holds its unit for several beats (a structural hazard). Textbook section 3.3.
5. **Block-copy trap** (16-bit era, like the 8086's `REP MOVS`): one instruction copies a block, but each copy takes many cycles, so the job is barely faster; the textbook's Chapter 2 fallacy ("more powerful instructions mean higher performance"). Shares the multi-cycle unit with the multiplier.
6. **Superscalar: done** (tier 7, CHANGELOG 2026-11-01). Still to do: balance its price ($1,800) and how often pairs come up by playing; a picture for TICK's lesson (it points at the screen for now); say in the README's accuracy section that the textbook's two-issue CPU is stricter (one ALU-or-branch with one load-or-store); later, **a second ALU** (the Pentium's U and V pipes), so two ALU instructions can pair.
7. **Campaign goal: the debt deadline.** On the workday's calendar (item 1): one far deadline to pay a debt by, possibly in installments; free play on the endless board after. Open, to decide with the team: what missing the deadline does; installments or one payment; how the board shows the date. Where it fits in the code: "Campaign mode" in `CLAUDE.md`.
8. **The job sheet names the access pattern.** The board's job sheet now marks which addresses a job reads and writes; it could also say it in words (sequential, two arrays, two arrays colliding in the cache, grid by column), since a colliding ADD ARRAYS can be locked even at 4 GHz with the L1 and the sheet only says why in marks.
9. **Balance pass** once word size is in: chip prices and top clocks, contract sizes and deadlines, once jobs are sized to your CPU (item 1).

## Open work by area

**Song and CPU**
- [ ] Relaxed mode: the pipeline waits for input instead of stalling
- [ ] Full-length songs (~60 s): tier 1 contract songs run 30–64 cycles (median 46, about 37 s at 75 BPM), tier 2 about 65 s; longer needs more memory
- [ ] Event notes for the wide-arithmetic chain (with word size)
- [x] Run logic that accepts several presses per beat (done with superscalar's chords, tier 7)
- [ ] Pay: better pay when overclocked? (the streak multiplier of item 1 rewards accuracy; pay is flat for now)
- [ ] Generator: data bigger than the cache that's read more than once (capacity misses never happen yet)
- [ ] Later: choosing the cache's shape (block size, associativity)

**Windows**
- [x] `Play Bit Cycler.bat` works on a Windows machine (the user, 2026-11-01)

**Teaching**
- [ ] The deep pipeline: balance its price, clock gain and wrong-guess cost by playing; decide whether its loads should wait longer too (deeper pipelines lengthen data hazards as well); draw it on the shop's chip
- [ ] Show the team the lesson tours (all nine are TICK's now) and play them through in a real browser: reading pace, where TICK stands, whether any line needs a better picture

**Audio and art**
- [ ] Decide with the team: the guide's name (TICK). His look: one per era (decided 2026-11-01)
- [ ] Sounds for branch flushes (a wrong guess is silent)
- [ ] Decide: let the game play an edited sound file in place of a synthesized sound when one exists (the recorded keys already work this way); the music stays synthesized
- [x] Sprites: TICK has a look per era (a VGA sprite on the 90s desktop, vector shapes in the modern era) and the results card stamps with 90s icons (2026-11-01); the rest of the era styling comes last (item 0)

**Code** (from the modularity review, 2026-10-31: where the code doesn't yet match `CLAUDE.md`'s "one place per thing"; move each, or make the doc say what's true)
- [ ] Song text outside `song/words.ts`: about 25 labels in `song/panel.ts`, `gauge.ts`, `replay.ts`, `highway.ts`, `layout.ts` and `PipelineScene`
- [ ] Key bindings in one place: `LANE_KEYS` (`song/layout.ts`), `KEY_UNITS` and the K / G / H checks (`PipelineScene`), the J / K labels (`song/highway.ts`), the tier 1 picture (`visual/diagrams.ts`), the overclocking item's text (`sim/progress.ts`, which also repeats the 150% limit)
- [ ] The pay weights in `newContract` (0.6 size, 0.4 urgency; `sim/progress.ts`) belong in `data/economy.ts`
- [ ] The song's memory wait (`frozenBeats`, `updateFreeze`, `endFreeze` in `PipelineScene`) as its own `song/` part
- [ ] Small: `visual/asciiChart.ts` is text formatting in the drawing folder; `cheatFlags.ts` is missing from `CLAUDE.md`'s code map; `audio/render.ts` picks eras by position (`ERAS[0]`, `ERAS[3]`)

**Known issues**
- [ ] Notes off the music's beat in practice: when a note has waited for the player, the notes resume part-way through a beat (`chartOffset` in `PipelineScene.holdForPlayer` grows by fractions of a beat), so they land between the music's beats from then on. Decide: resume on the next beat, or right away as now
- [ ] Notes and music on separate clocks in replays: the notes move by frame time (`replayBeat`), the music by the audio clock, so they start apart and drift, and changing the speed restarts the music from its first bar. Could follow the conductor instead, with `setTempo` for the speed
- [ ] Replays: clicking empty space doesn't close the explanation box (clicking the box or Space does); predates the song screen's split

## Needs a real browser

Headless testing can't judge these:
- [ ] The beat in sync by ear; the timing windows on tiers 1–2; the music's mix; readability while playing
- [ ] Every sound after the sound system's restructure (should be unchanged; the modern era's hum has no whine or drive); the boot's pace, power-on and typing sounds, the hum fading in
- [ ] No pile of sounds after switching away from the window and back (fixed by reasoning from Phaser's pause-on-blur, not reproduced)
- [ ] The 64-bit era with `?fps`: smoothness; keep or drop the font's ligatures (`<-` drawn as an arrow)

## Later (not part of the MVP)

- Idea: on contracts that fight the cache, a programmer's fix on the job sheet before the song (pad the array, swap the loops of a grid); the song plays the fixed program and results compare. A decision for direct-mapped caches, which have none of their own; could be a second measurable learning objective
- Out-of-order execution with register renaming (64-bit era, like the DEC Alpha 21264), after superscalar
- Pipeline designer: cut the datapath to choose the depth; stalls stay manual (open: hold Space until the hazard clears)
- **Parked** (2026-10-31: memory and storage, not the CPU's control logic): L2 and L3 caches (a miss checks each level and adds its lookup time, L2 ~5 ns, L3 ~10–15 ns; results show average memory access time); RAM as page frames with a page fault's own view; HDD platter mode (seek, then tap as the sector passes); SSD and NVMe modes

## Done

Details are in `CHANGELOG.md`.

- **The player chooses how much TICK teaches:** full, short (no instruction-by-instruction close looks) or skip, asked at his first hello and in the settings; START OVER in the settings erases every save and brings his first tutorial back
- **The workday:** a calendar page (a month from November 1, each day's earnings and events) and a workday (8 hours of CPU time a day, LOG OFF and a timecard, offers lasting a day or two, jobs that don't fit today locked till tomorrow) and jobs sized to your CPU (easy, fair, stretch), all drawn in characters
- **A deep pipeline the player chooses:** a shop part with an ON / OFF switch, a faster clock for dearer wrong guesses, with TICK's lesson
- **Getting around:** a pause menu (Esc / Q) on the board, in the shop and in songs (the beat holds while it's open); the developer screen in groups, explaining each row, its save staying loaded until you go back to your campaign
- **Foundations:** the technology decisions (Decisions table); the beat clock on the audio clock, timing windows and calibration; the note highway; the single-cycle CPU, assembler and register panel; relaxed mode (wider windows, slower beat)
- **CPU model** (tested against hand-worked counts): the 5-stage pipeline with hazards and stalls; forwarding; branches decided in DECODE with the player guessing (tier 4), 1-bit and 2-bit predictors (tiers 5–6); the memory wall (RAM 60 ns, so cycles grow with the clock); the L1 cache (16 bytes, direct-mapped, write-through with a write buffer) with miss kinds; instructions, cycles, CPI and CPU time
- **The song:** the highway as the pipeline (EX / MEM / WB rows, links from waiting notes to their producers); results on notes and the bus to the panel; the scrolling listing; replays with speed, pause and click-to-learn; the count-in and key registers; the clock dial, overclocking, heat, wear and fire, an overheat stopping the clock; cache misses freezing the song
- **Economy and progress:** contracts for made-up clients with generated programs and deadlines (late = half pay); the board; the shop (CPU chips 8 → 64-bit, each with its top clock, and CPU parts in historical order; clock, overclocking, cooling, repair, L1); results as charts; every number in `data/economy.ts`; three save slots and a developer save, with export / import
- **Menus:** the intro (the computer powers on and boots from the save); the main menu as the computer's disk; settings; the developer screen
- **Education:** TICK (a robot drawn the way each era drew characters: ASCII, DOS's box characters, a 90s pixel sprite, modern vector shapes; with a voice of blips and moods) teaches everything on the real screens, with pictures: a welcome on the main menu, the board, and every lesson (tiers 1–6, overclocking, the memory wall, the cache) as a tour, then practice, then play; practice's tips wait for Enter; a new game's first job is a set tutorial (a bakery's till) whose practice goes through each core instruction with its real numbers, before and after it runs; every lesson in BRIEFS to play again, written for players who don't know what a CPU is. No slides
- **The contract board:** a list by section with the chosen contract's job sheet (its loop, notes per lane, memory read and written, and time = instructions × CPI × clock period against the deadline)
- **Look and sound:** four eras (green CRT, DOS app, 90s desktop with a dark mode, modern terminal on an LCD) with period fonts, each the era of a CPU chip (word size, phase 1); the 3D chip; the CRT overlay; synthesized music in layers, menu sounds, the hum and the boot's sounds; recorded keys; every sound exportable as WAV
- **Code:** one place per thing (eras, the screen kit, the sound system, the song's setup), the song screen in parts, a guide to extending it in `CLAUDE.md`
