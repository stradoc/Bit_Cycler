# MVP Roadmap

Personal roadmap for building the MVP. The full design lives in the [design doc](https://claude.ai/artifact/8VttdcZGpm8e6upLo3wgzy). Rules are in `RULES.md`, history in `CHANGELOG.md`.

**MVP =** tiers 1–3 (single-cycle → 5-stage pipeline → forwarding, branch prediction, L1 cache), RAM page frames, HDD platter mode, contract board, shop, and a results screen with CPI.

Phases move on when ready. There are no internal due dates; the only fixed date is the course deadline, **Nov 30, 2026**.

---

## Step 0: Decisions needed first

Nothing is built until these are settled (see `RULES.md` rule 3). Each one gets a full pros/cons write-up before it's decided.

- [x] **Rendering:** Phaser 3.90
- [x] **Language:** TypeScript
- [x] **Audio:** raw Web Audio API
- [x] **Testing the simulation:** Node's built-in `node:test`
- [x] **WebAssembly:** not used
- [x] **Build step:** plain `tsc`, no bundler
- [x] **Package manager:** npm
- [x] **Local dev server:** `python3 -m http.server`
- [x] **Git setup:** separate team repo; everyone works in `game/`, copied to `games/bit-cycler/` at submission
- [x] **Design (not tech):** RISC-V inspired instruction set, adapted for 8/16/32/64-bit tiers
- [x] **Repo access:** connected to https://github.com/stradoc/Bit_Cycler over SSH
- [x] **Design (not tech):** title **Bit Cycler**, folder `bit-cycler`

## Phase 1: Prototype

Goal: prove the "beat = clock cycle" idea is fun before building systems around it.

- [x] Folder skeleton: `index.html`, entry script, empty README
- [x] Conductor: audio-clock beat scheduling with a metronome click (confirm sync by ear in a real browser)
- [x] Input judgment: Perfect / Good / Miss windows, plus an audio latency calibration offset
- [x] Note highway: 3 lanes (ALU / MEM / BRANCH); route each instruction to its unit on the beat
- [x] Tier 1 CPU: single-cycle model runs a program, one instruction per beat
- [x] Register panel shows values changing as instructions execute (plus memory and program listing)
- [x] Relaxed mode toggle (wider windows, slower tempo)
- [ ] Relaxed mode: pipeline waits for input instead of stalling
- [ ] Playtest in a real browser and tune timing windows
- [ ] Full-length song (~60 s): longer program or several programs back to back

**Done when:** a 60-second tier 1 song is playable, instructions visibly execute on the beat, and registers update correctly. (Currently ~15 s.)

## Phase 2: MVP

### CPU simulation
- [ ] 5-stage pipeline model (IF, ID, EX, MEM, WB)
- [ ] RAW hazard detection and stall (bubble insertion)
- [ ] Forwarding unit (upgrade)
- [ ] Branch handling: flush on mispredict; predictors none → 1-bit → 2-bit
- [ ] L1 cache: hit/miss model with miss penalty
- [ ] Word size: multi-chunk add-with-carry chains on narrow CPUs
- [ ] Performance tracking: instruction count, cycles, CPI, clock period, CPU time
- [ ] Tests: CPI matches hand-calculated examples for each hazard type

### Play screen
- [ ] Five stage lanes with instructions scrolling in, registers highlighted
- [ ] Event notes: hazard (stall/forward), branch fork, cache-miss hold, wide-arithmetic chain
- [ ] Wrong or missed input → slow path (extra stall), never a fail state
- [ ] Clock speed sets the tempo; heat meter and thermal throttling

### Memory and storage
- [ ] RAM as page frames; page fault plays as a long hold note
- [ ] Page replacement: player picks the frame to evict, each frame shows its last-used beat
- [ ] HDD platter mode: move the head (seek), tap as the sector passes (rotation)
- [ ] Access time breakdown shown after each read (seek + rotation + transfer + controller)
- [ ] Sequential vs. random contracts behave differently on the HDD
- [ ] Latency figures checked against the textbook and labeled approximate

### Economy and UI
- [ ] Contract board: 3 offers with instruction mix, dataset size, access pattern, deadline, pay
- [ ] Pay formula: base × speed bonus × accuracy bonus
- [ ] Shop: CPU tiers 1–3, forwarding, predictor, clock, cooling, cache, RAM, HDD
- [ ] Results screen: instructions, cycles, CPI, clock period, CPU time, pay
- [ ] All prices and balance numbers in one data file
- [ ] Save/load progress

### Audio and art
- [ ] Synthesized music whose tempo follows the clock speed
- [ ] Sound effects for hits, stalls, flushes, page faults
- [ ] Sprites and UI art
- [x] Terminal look with four eras (green CRT → modern terminal), previewable with keys 1–4
- [ ] Drive the era from the player's CPU word size instead of the preview keys

### Education: briefing → practice → play for every concept
- [x] Briefing system: paged concept cards (picture, ≤ 3 short lines, an analogy, then "how it plays")
- [x] Practice mode: notes wait at the hit line, first-time callouts explain each instruction, wrong keys explain instead of stalling
- [x] Tier 1 lesson: what a CPU does, the clock, functional units, registers vs memory, how it plays, scoring
- [ ] Tier 2 lesson: pipelining (laundry analogy), data hazards, stalls
- [ ] Tier 3 lessons: forwarding, branch prediction
- [ ] Storage lessons: RAM / page faults, HDD
- [ ] Track hazard-decision accuracy (learning objective 1) and show it after each contract

### Tier 2–3 play screen (design: player is the control unit)
- [ ] Pipeline strip above the hit line (IF ID EX MEM WB), advancing each beat; in-flight destination registers glow
- [ ] "Pipeline fill" feel: clock never changes; music adds one layer per occupied stage; a flush strikes out in-flight notes, leaves a gap of bubbles and drops layers, then refills; live throughput (instructions completed per cycle) meter
- [ ] STALL key (Space) inserts a bubble; stall rules follow the textbook 5-stage pipeline (distance 1 → 2 stalls, distance 2 → 1)
- [ ] Routing into a hazard shows the stale value read (red) next to the correct one, then flushes
- [ ] Forwarding upgrade: ALU→ALU needs 0 stalls, load-use needs 1
- [ ] Branch prediction keys: J = predict not taken, K = predict taken; mispredict strikes out wrong-path notes
- [ ] Results compare single-cycle vs pipelined CPU time (CPI up, period down, faster overall)
- [ ] Run logic accepts several presses per beat (ready for superscalar chords later)

**Done when:** a new player can go from tier 1 to tier 3 and buy an HDD in one ~30-minute session, the CPI numbers are verified by tests, and the game runs from a plain static server.

## Later (not part of the MVP)

- Stretch, in priority order: SSD flash mode → pipeline designer → dual-issue → NVMe mode → out-of-order + renaming, report card, before/after check
- Submission: README, 800×450 thumbnail (≤ 500 KB), `games.yml` entry, size check (≤ 35 MB), GitHub Pages test, pull request
