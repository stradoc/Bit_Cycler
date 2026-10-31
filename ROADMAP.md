# Roadmap

What's left to build, in priority order, with a short list of what's done at the end. Decisions and history are in `CHANGELOG.md`; the rules in `RULES.md`; how to build things in `CLAUDE.md`.

**MVP =** tiers 1–3 (single-cycle → 5-stage pipeline → forwarding, branch prediction, L1 cache), RAM page frames, HDD platter mode, contract board, shop, and a results screen with CPI. **Done when** a new player can go from tier 1 to tier 3 and buy an HDD in one ~30-minute session, the CPI numbers are verified by tests, and the game runs from a plain static server.

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

1. **Campaign goal: the debt deadline.** A calendar (each contract costs its whole job's time at the pace played) and one far deadline to pay a debt by, possibly in installments; free play on the endless board after. Open, to decide with the team: what missing the deadline does; installments or one payment; how the board shows the date. Where it fits in the code: "Campaign mode" in `CLAUDE.md`.
2. **Contract cards show the access pattern** (sequential, two arrays, two arrays colliding, grid by column...). A colliding ADD ARRAYS can be locked even at 4 GHz with the L1, and its card only says TOO SLOW.
3. **Word size: 8 → 16 → 32 → 64-bit** as its own upgrade track, the only upgrade that cuts the instruction count. Contracts state their data width ("32-BIT DEPOSITS"); a narrow CPU on wide data plays a chain of chunks (RISC-V has no carry flag: `sltu` carries, so each chunk depends on the last, a chain of hazards); wider loads (`lh` / `lw` / `ld`) and addresses; byte jobs gain nothing; it drives the era instead of the preview keys. Open: `sltu` or an invented `addc`; how 64-bit registers fit the panel. Planned after L1 and before L2 / L3 (order not confirmed).
4. **L2, then L3.** Shop parts; a miss checks each level and adds its lookup time (L2 ~5 ns, L3 ~10–15 ns), so a trip that misses everywhere grows from 60 toward ~80 ns; results show average memory access time and where the waits came from. In the song an L2 hit is a 3-beat freeze at 4 GHz, RAM 5. Contracts need data that fits L1 / L2 / L3 / streams once, or L3 never matters; a re-reading job's whole-job miss rate should come from simulating many passes. Later idea: a prefetcher.
5. **RAM as page frames and the HDD**: a page fault pauses the song for its own view; the player picks the frame to evict (each shows its last-used beat); HDD platter mode (move the head to seek, tap as the sector passes); an access-time breakdown (seek + rotation + transfer + controller); sequential and random contracts behave differently. Storage lessons with them.
6. **Balance pass** once word size is in: contract sizes and deadlines (ADVANCED is provisionally 10–70 trillion instructions).

## Open work by area

**Song and CPU**
- [ ] Relaxed mode: the pipeline waits for input instead of stalling
- [ ] Full-length songs (~60 s): tier 1 contract songs run 30–64 cycles (median 46, about 37 s at 75 BPM), tier 2 about 65 s; longer needs more memory
- [ ] Event notes for the wide-arithmetic chain (with word size)
- [ ] Run logic that accepts several presses per beat (for superscalar chords later)
- [ ] Pay formula: base × speed bonus × accuracy bonus, and better pay when overclocked (pay is flat for now)
- [ ] Generator: data bigger than the cache that's read more than once (capacity misses never happen yet)
- [ ] Later: choosing the cache's shape (block size, associativity)

**Audio and art**
- [ ] Sounds for branch flushes (a wrong guess is silent) and page faults
- [ ] Decide: let the game play an edited sound file in place of a synthesized sound when one exists (the recorded keys already work this way); the music stays synthesized
- [ ] Decide whether sprites are needed (the art is the four era looks and the 3D chip)

**Known issues**
- [ ] Replays: clicking empty space doesn't close the explanation box (clicking the box or Space does); predates the song screen's split

## Needs a real browser

Headless testing can't judge these:
- [ ] The beat in sync by ear; the timing windows on tiers 1–2; the music's mix; readability while playing
- [ ] Every sound after the sound system's restructure (should be unchanged; the modern era's hum has no whine or drive); the boot's pace, power-on and typing sounds, the hum fading in
- [ ] No pile of sounds after switching away from the window and back (fixed by reasoning from Phaser's pause-on-blur, not reproduced)
- [ ] The 64-bit era with `?fps`: smoothness; keep or drop the font's ligatures (`<-` drawn as an arrow)

## Later (not part of the MVP)

- Idea: on contracts that fight the cache, a programmer's fix on the job sheet before the song (pad the array, swap the loops of a grid); the song plays the fixed program and results compare. A decision for direct-mapped caches, which have none of their own; could be a second measurable learning objective
- Pipeline designer: cut the datapath to choose the depth; stalls stay manual (open: hold Space until the hazard clears). After L2 / L3 and pages + HDD
- Stretch, in priority order: SSD flash mode → dual-issue → NVMe mode → out-of-order + renaming, a before/after check

## Done

Details are in `CHANGELOG.md`.

- **Foundations:** the technology decisions (Decisions table); the beat clock on the audio clock, timing windows and calibration; the note highway; the single-cycle CPU, assembler and register panel; relaxed mode (wider windows, slower beat)
- **CPU model** (tested against hand-worked counts): the 5-stage pipeline with hazards and stalls; forwarding; branches decided in DECODE with the player guessing (tier 4), 1-bit and 2-bit predictors (tiers 5–6); the memory wall (RAM 60 ns, so cycles grow with the clock); the L1 cache (16 bytes, direct-mapped, write-through with a write buffer) with miss kinds; instructions, cycles, CPI and CPU time
- **The song:** the highway as the pipeline (EX / MEM / WB rows, links from waiting notes to their producers); results on notes and the bus to the panel; the scrolling listing; replays with speed, pause and click-to-learn; the count-in and key registers; the clock dial, overclocking, heat, wear and fire, an overheat stopping the clock; cache misses freezing the song
- **Economy and progress:** contracts for made-up clients with generated programs and deadlines (late = half pay); the board; the shop (CPU parts, clock, overclocking, cooling, repair, L1); results as charts; every number in `data/economy.ts`; three save slots and a developer save, with export / import
- **Menus:** the intro (the computer powers on and boots from the save); the main menu as the computer's disk; settings; the developer screen
- **Education:** briefing → practice → play for tiers 1–6, overclocking, the memory wall and the cache
- **Look and sound:** four eras (green CRT, DOS app, 90s desktop with a dark mode, modern terminal on an LCD) with period fonts; the 3D chip; the CRT overlay; synthesized music in layers, menu sounds, the hum and the boot's sounds; recorded keys; every sound exportable as WAV
- **Code:** one place per thing (eras, the screen kit, the sound system), the song screen in parts, a guide to extending it in `CLAUDE.md`
