# Roadmap

What's left to build, in priority order, with a short list of what's done at the end. Decisions and history are in `CHANGELOG.md`; the rules in `RULES.md`; how to build things in `CLAUDE.md`.

**MVP =** tiers 1–3 (single-cycle → 5-stage pipeline → forwarding, branch prediction, L1 cache), contract board, shop, and a results screen with CPI (RAM page frames and the HDD were in it until they were parked on 2026-10-31). **Done when** a new player can go from tier 1 to tier 3 in one ~30-minute session, the CPI numbers are verified by tests, and the game runs from a plain static server.

There are no internal due dates; the only fixed date is the course deadline, **Nov 30, 2026**.

## Before submission (required, in priority order)

From the rubric check (2026-10-29). Everything else the spec requires is met: browser, no installs, 3.6 MB of the 35 MB limit, relative paths, mechanics that teach, no quizzes, feedback, progression, in-game instructions.

- [ ] **Measure the learning objective**: the share of correct hazard decisions after each contract (tier 2 vs tier 3), shown after each contract and in a report card on the main menu (it could be a file on the menu's disk)
- [ ] **`game/README.md`**: How to play and Credits are written; still to write: the educational purpose and learning objectives (say the 8/16-bit CPUs are simplified teaching CPUs and which figures are approximate) and how it was developed
- [ ] **`thumbnail.png`**: 16:9 PNG, exactly 800×450, ≤ 500 KB
- [ ] **Every teammate commits their own work**: only students who actively contribute get credit, and all commits so far come from one account
- [ ] **Outside playtest**: someone new plays from the title through tier 3; fix what they trip on; tune the timing windows (see "Needs a real browser")
- [ ] **Textbook check**: stall counts, forwarding, branch penalty, CPU time, the power wall and every latency figure against Patterson & Hennessy; label what's stylized (the tempo curve, wear, overheat limits)
- [ ] **Submission**: a `games.yml` entry (title, authors, topic, description, learning_objective, game_url, thumbnail), copy `game/` to `games/bit-cycler/`, test on GitHub Pages, pull request by Nov 30

## Next up

Upgrades follow microprocessor history and stay with the CPU and its control logic (decided 2026-10-31; the reasoning and sources are in the design doc's "Eras and upgrade order").

1. **Word size, phase 2: the CPU model.** 16-, 32- and 64-bit registers (64-bit needs JavaScript's built-in BigInt; `Cpu.wrap` breaks at 32 bits today), wider loads and stores (`lh` / `lw` / `ld`, `sh` / `sw` / `sd`) and `sltu`; the generator writes programs that work on wide data in pieces, each piece's carry found with `sltu` (a chain of hazards); contracts state their data width ("32-BIT DEPOSITS") and the board's instruction counts come from tracing those programs; byte jobs gain nothing. Songs on wide data play fewer items so they keep their length. Tests against hand-worked counts. Open: the L1's 4-byte blocks are smaller than a 64-bit word.
2. **Word size, phase 3: the song screen.** Registers shown at the chip's width (64-bit needs a new panel layout), the carry chain's practice tips and click-to-learn, results showing instructions per item, a lesson (the guide's tour, and practice) for each chip.
3. **Hardware multiplier** (end of the 8-bit era, like the Motorola 6809): without it a multiply is a loop of shifts and adds; with it, one `mul` that holds its unit for several beats (a structural hazard). Textbook section 3.3.
4. **Block-copy trap** (16-bit era, like the 8086's `REP MOVS`): one instruction copies a block, but each copy takes many cycles, so the job is barely faster; the textbook's Chapter 2 fallacy ("more powerful instructions mean higher performance"). Shares the multi-cycle unit with the multiplier.
5. **Superscalar** (first 64-bit upgrade, like the DEC Alpha 21064): chords; the textbook's static two-issue CPU (one ALU or branch and one load or store per cycle) maps onto D+F and J+F. Needs the run logic to take several presses per beat.
6. **Campaign goal: the debt deadline.** A calendar (each contract costs its whole job's time at the pace played) and one far deadline to pay a debt by, possibly in installments; free play on the endless board after. Open, to decide with the team: what missing the deadline does; installments or one payment; how the board shows the date. Where it fits in the code: "Campaign mode" in `CLAUDE.md`.
7. **The job sheet names the access pattern.** The board's job sheet now marks which addresses a job reads and writes; it could also say it in words (sequential, two arrays, two arrays colliding in the cache, grid by column), since a colliding ADD ARRAYS can be locked even at 4 GHz with the L1 and the sheet only says why in marks.
8. **Balance pass** once word size is in: chip prices and top clocks, contract sizes and deadlines (ADVANCED is provisionally 10–70 trillion instructions, sized for 4 GHz, which now needs the 64-bit chip).

## Open work by area

**Song and CPU**
- [ ] Relaxed mode: the pipeline waits for input instead of stalling
- [ ] Full-length songs (~60 s): tier 1 contract songs run 30–64 cycles (median 46, about 37 s at 75 BPM), tier 2 about 65 s; longer needs more memory
- [ ] Event notes for the wide-arithmetic chain (with word size)
- [ ] Run logic that accepts several presses per beat (for superscalar chords later)
- [ ] Pay formula: base × speed bonus × accuracy bonus, and better pay when overclocked (pay is flat for now)
- [ ] Generator: data bigger than the cache that's read more than once (capacity misses never happen yet)
- [ ] Later: choosing the cache's shape (block size, associativity)

**Teaching**
- [ ] Show the team the lesson tours (all nine are TICK's now) and play them through in a real browser: reading pace, where TICK stands, whether any line needs a better picture

**Audio and art**
- [ ] Decide with the team: the guide's name (TICK) and look (one robot drawn in characters, the same in every era, in the era's font and colors)
- [ ] Sounds for branch flushes (a wrong guess is silent)
- [ ] Decide: let the game play an edited sound file in place of a synthesized sound when one exists (the recorded keys already work this way); the music stays synthesized
- [ ] Decide whether sprites are needed (the art is the four era looks and the 3D chip)

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

- **Getting around:** a pause menu (Esc / Q) on the board, in the shop and in songs (the beat holds while it's open); the developer screen in groups, explaining each row, its save staying loaded until you go back to your campaign
- **Foundations:** the technology decisions (Decisions table); the beat clock on the audio clock, timing windows and calibration; the note highway; the single-cycle CPU, assembler and register panel; relaxed mode (wider windows, slower beat)
- **CPU model** (tested against hand-worked counts): the 5-stage pipeline with hazards and stalls; forwarding; branches decided in DECODE with the player guessing (tier 4), 1-bit and 2-bit predictors (tiers 5–6); the memory wall (RAM 60 ns, so cycles grow with the clock); the L1 cache (16 bytes, direct-mapped, write-through with a write buffer) with miss kinds; instructions, cycles, CPI and CPU time
- **The song:** the highway as the pipeline (EX / MEM / WB rows, links from waiting notes to their producers); results on notes and the bus to the panel; the scrolling listing; replays with speed, pause and click-to-learn; the count-in and key registers; the clock dial, overclocking, heat, wear and fire, an overheat stopping the clock; cache misses freezing the song
- **Economy and progress:** contracts for made-up clients with generated programs and deadlines (late = half pay); the board; the shop (CPU chips 8 → 64-bit, each with its top clock, and CPU parts in historical order; clock, overclocking, cooling, repair, L1); results as charts; every number in `data/economy.ts`; three save slots and a developer save, with export / import
- **Menus:** the intro (the computer powers on and boots from the save); the main menu as the computer's disk; settings; the developer screen
- **Education:** TICK (a robot in characters, with a voice of blips) teaches everything on the real screens, with pictures: a welcome on the main menu, the board, and every lesson (tiers 1–6, overclocking, the memory wall, the cache) as a tour, then practice, then play; practice's tips wait for Enter; lesson 1's practice goes through every kind of instruction with its real numbers, before and after it runs; every lesson in BRIEFS to play again, written for players who don't know what a CPU is. No slides
- **The contract board:** a list by section with the chosen contract's job sheet (its loop, notes per lane, memory read and written, and time = instructions × CPI × clock period against the deadline)
- **Look and sound:** four eras (green CRT, DOS app, 90s desktop with a dark mode, modern terminal on an LCD) with period fonts, each the era of a CPU chip (word size, phase 1); the 3D chip; the CRT overlay; synthesized music in layers, menu sounds, the hum and the boot's sounds; recorded keys; every sound exportable as WAV
- **Code:** one place per thing (eras, the screen kit, the sound system, the song's setup), the song screen in parts, a guide to extending it in `CLAUDE.md`
