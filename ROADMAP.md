# MVP Roadmap

Personal roadmap for building the MVP. The full design lives in the [design doc](https://claude.ai/artifact/8VttdcZGpm8e6upLo3wgzy). Rules are in `RULES.md`, history in `CHANGELOG.md`.

**MVP =** tiers 1–3 (single-cycle → 5-stage pipeline → forwarding, branch prediction, L1 cache), RAM page frames, HDD platter mode, contract board, shop, and a results screen with CPI.

Phases move on when ready. There are no internal due dates; the only fixed date is the course deadline, **Nov 30, 2026**.

---

## Before submission (from the rubric check, 2026-10-29)

Checked against the assignment spec: everything else required is met (browser, no installs, 2.3 MB of 35 MB, relative paths, mechanics that teach, no quizzes, feedback, progression, in-game instructions). In priority order:

- [ ] **Measure the learning objective** (required): % of correct hazard decisions after each contract (tier 2 vs tier 3), plus a report card. See Education below
- [ ] **`game/README.md`** (required): the project, how it was developed, educational purpose and learning objectives, how to play, credits (fonts: JetBrains Mono, SIL OFL; The Ultimate Oldschool PC Font Pack by VileR, CC BY-SA 4.0; see `assets/fonts/CREDITS.txt`). Say the 8/16-bit CPUs are simplified teaching CPUs and which figures are approximate
- [ ] **`thumbnail.png`** (required): 16:9 PNG, exactly 800×450, ≤ 500 KB
- [ ] **Every teammate commits their own work**: only students who actively contribute get credit, and all commits so far come from one account
- [ ] **Outside playtest** (the spec asks to evaluate and refine through testing and feedback): someone new plays from the title through tier 3; fix what they trip on; tune the timing windows
- [ ] **Textbook check** (design rule): stall counts, forwarding, branch penalty, CPU time, power wall, and any latency figures checked against Patterson & Hennessy; anything stylized (tempo scale, wear, overheat limits) labeled
- [ ] Submission steps: `games.yml` entry (title, authors, topic, description, learning_objective, game_url, thumbnail), copy `game/` to `games/bit-cycler/`, GitHub Pages test, pull request by Nov 30

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
- [ ] Full-length song (~60 s): longer program or several programs back to back (contract songs now run 60-150 cycles, median 94 on tier 2: ~65 s at 87 BPM, ~40 s at 147; longer needs more memory, with the cache work)

**Done when:** a 60-second tier 1 song is playable, instructions visibly execute on the beat, and registers update correctly. (Currently ~15 s.)

## Phase 2: MVP

### CPU simulation
- [x] 5-stage pipeline model (IF, ID, EX, MEM, WB)
- [x] RAW hazard detection and stall (bubble insertion)
- [x] Forwarding unit (simulator option; still needs the upgrade in the shop)
- [x] Branch handling: flush on mispredict; predictors none (tiers 2-3) → player guesses (tier 4) → 1-bit (tier 5) → 2-bit (tier 6)
- [x] Memory wall: RAM access in fixed ns (60, textbook 50-70), so cycles per access grow with the clock; an access longer than a cycle freezes the pipeline (single-cycle too)
- [x] L1 cache: 16 bytes, direct-mapped, 4 lines × 4 bytes, write-through + write buffer; a miss freezes the pipeline, 2 / 3 / 5 beats on a log scale (1.5x after playtest), real cycles in the CPU-time math
- [x] Miss kinds for replays: first use / conflict / too small (compare with a fully associative cache of the same size)
- [x] Tests: hit/miss counts and miss penalties match hand-worked examples (SUM, ADD ARRAYS colliding vs not)
- [ ] Word size: 8 → 16 → 32 → 64-bit as its own upgrade track, the only upgrade that cuts the instruction count (CPU time = instructions x CPI x period). Contracts state their data width ("32-BIT DEPOSITS"); a narrow CPU on wide data plays a chain of chunks (RISC-V has no carry flag: `sltu` carries, so each chunk depends on the last, a chain of hazards); wider loads (`lh` / `lw` / `ld`); wider addresses reach more memory; byte jobs gain nothing. Drives the terminal era. Open: `sltu` or an invented `addc`; how 64-bit registers fit the panel. After L1, before L2 / L3 (team discussion 2026-10-29, order not yet confirmed)
- [ ] Performance tracking: instruction count, cycles, CPI, clock period, CPU time
- [x] Tests: CPI matches hand-calculated examples for each hazard type (pipeline; SUM ARRAY 43 / 35 cycles)

### Play screen
- [ ] Five stage lanes with instructions scrolling in, registers highlighted
- [ ] Event notes: hazard (stall/forward), branch fork, cache-miss hold, wide-arithmetic chain
- [ ] Wrong or missed input → slow path (extra stall), never a fail state
- [x] Clock speed sets the tempo: 75 BPM at 1 MHz, +12 BPM per 10× clock (`rhythm/tempo.ts`; now +20, see below)
- [x] Clock upgrades raise the tempo again, steeper: +20 BPM per 10× clock (pipelined 87 → ~147 BPM, single-cycle 75 → ~135); songs use the rated clock
- [x] Bus stops at the panel's box edge (the row lights up; a stored byte gets an outline) instead of running over the text
- [x] Heat builds faster (time constant 25 → 15 cycles): 150% overheats in ~28 busy beats, 140% in ~53, within one song
- [x] A worn chip overheats sooner (88°C at 140% ... 65°C at 100%), so its top clock stays as risky as 150% on a new chip; worn out, even 100% overheats (underclock or repair)
- [x] Overheating stops the clock (notes freeze, ~5-8 beats) instead of throttling to rated; the time counts in CPU time, not CPI
- [x] Key registers (NEXT, END, GRID) tagged in the REGISTERS box and introduced in a ~4 s count-in before each song and practice
- [x] Cache miss in the song: load shows `MISS → RAM`, the bus carries the request out and the data back, a counter rolls up the real cycles; presses during the freeze are ignored; drone and ticks while waiting, a click when the data arrives
- [x] CACHE box in the panel (tag and data per line; each lookup shown as `lb 5: 0000 01 01 LINE 1 TAG 0 -> HIT`); MEMORY box grows to addresses 0-31 (0-63 would need a different layout)
- [x] Clock dial in the song (`G` / `H`, 50–150% of the rated clock, tiers 2–6); results show average clock, peak temperature, overheats and real CPU time. Overclocking past 100% is a shop upgrade; every tier has it
- [x] Underclocking down to 50% (slower tempo to think, more CPU time, cooler)
- [x] **Overclock red zone:** the dial goes past the rated clock; heat builds every beat; overheating **throttles** (clock drops to rated mid-song until it cools) and **wears the chip** (maximum clock -10% until repaired). Still to do with the shop: better pay when overclocked, paid repairs, cooling upgrades that widen the safe zone
- [x] Heat meter and thermal throttling (`sim/thermal.ts`), with fire effects building up with heat (`visual/heat.ts`)

### Memory and storage
- [x] Generator: ADD ARRAYS puts its arrays a cache-full apart half the time (every load a conflict miss); data in addresses 0-31
- [ ] Generator: data bigger than the cache that's read more than once (capacity misses, "too small", never happen yet)
- [ ] **Contract cards show the access pattern** (sequential, two arrays, two arrays colliding, grid by column ...). Needed soon: a colliding ADD ARRAYS can be locked even at 4 GHz with the L1, and the card only says TOO SLOW
- [x] Results: "waiting on RAM" bar, hits / misses / hit rate, a "no cache" bar
- [x] Shop: L1 cache (a memory part, on sale once RAM takes over a cycle)
- [ ] L2 cache, then L3 (shop upgrades; a miss checks each level and adds its lookup time, L2 ~5 ns, L3 ~10-15 ns, so a trip that misses everywhere grows from 60 toward ~80 ns; results show average memory access time and where the waits came from). In the song: an L2 hit is a 3-beat freeze at 4 GHz, RAM 5. Contracts need data sizes that fit L1 / fit L2 / fit L3 / stream through once, or L3 never matters; a streaming job gains almost nothing from L2 / L3 (first-use misses), a job that re-reads its data gains a lot. The whole job's miss rate for re-reading jobs should come from simulating many passes behind the scenes, not the song's first pass. Later idea: a prefetcher for streaming jobs
- [ ] Balance pass once word size is in: contract sizes and deadlines (ADVANCED is provisionally 10-70 trillion instructions)
- [ ] Later: choosing the cache's shape (block size, associativity)
- [ ] RAM as page frames; a page fault pauses the song for its own view
- [ ] Page replacement: player picks the frame to evict, each frame shows its last-used beat
- [ ] HDD platter mode: move the head (seek), tap as the sector passes (rotation)
- [ ] Access time breakdown shown after each read (seek + rotation + transfer + controller)
- [ ] Sequential vs. random contracts behave differently on the HDD
- [ ] Latency figures checked against the textbook and labeled approximate

### Economy and UI
- [x] Contracts for made-up clients ("FAIRVIEW SAVINGS: TOTAL 107 BILLION DEPOSITS"), never the same client twice on the board
- [x] Contract board (endless): random jobs in STARTER / STANDARD / ADVANCED, each with its whole-job time on your CPU and its own deadline; locked if your CPU can't make it, half pay if your run's pace is late. Later: instruction mix, access pattern
- [ ] Pay formula: base × speed bonus × accuracy bonus (flat pay for now; overclocking bonus)
- [x] Shop: CPU parts (tiers 2–6), clock upgrades (to 4 GHz), cooling, chip repair. Later: cache, RAM, HDD
- [ ] **Debt deadline (next; contract deadlines are done):** a calendar (each contract costs setup time + its CPU time) and one far debt deadline; possibly quarterly installments. Original idea: pay off a debt before an in-game deadline. Each contract costs game time = its CPU time (instructions × CPI × period), where the song is a sample of a much bigger job and your song CPI applies to the rest. The board shows each contract's estimate at your current CPU ("317 years" at 1 MHz → days late game; keep the numbers real, roughly a 10^4–10^5× total speedup). Clock upgrades shorten the time and raise the tempo (decided again: steeper curve, see above). Open: what missing the deadline does; fixed tempo per tier or a small step per tier
- [x] Results screen: instructions, cycles, CPI, clock period, CPU time, the whole contract's time, pay
- [x] All prices and balance numbers in one data file (`data/economy.ts`)
- [x] Save/load progress (browser storage; `N` twice on the title for a new game)

### Audio and art
- [ ] Synthesized music whose tempo follows the clock speed
- [x] Menu sound: an old computer's hum (fan, mains hum, CRT whine, hard drive seeks) on the title, board, shop and briefings, and mechanical key presses for menu actions; `M` toggles the hum
- [ ] Sound effects for hits, stalls, flushes, page faults
- [ ] Sprites and UI art
- [x] Shop: the chip as a spinning 3D model (own renderer) built from the parts owned, drawn as wireframe / flat / low-poly / smooth by era
- [x] Terminal look with four eras (green CRT → modern terminal), previewable with keys 1–4
- [x] 64-bit era: JetBrains Mono, the screen's real resolution, sub-pixel motion, eased transitions (listing slide, glides, page slides)
- [x] 64-bit era as a terminal window (title bar with a prompt per screen) on black, with teal accents and an LCD subpixel grid
- [x] 32-bit era as a mid-90s desktop app (gray 3D window on teal, notes as buttons, sunken fields, blue selection bar)
- [x] 32-bit dark mode (D on the title screen); the shop's selected item, contract cards and the song's key labels are buttons that press in
- [x] 16-bit era as a DOS app (blue text mode, menu and status bars, double-line boxes, drop shadows, EGA chip)
- [x] CRT scanlines, phosphor stripes and vignette as a fine overlay at the screen's resolution
- [x] A period font per era: IBM BIOS (8-bit), IBM VGA (16-bit), IBM XGA (32-bit) from The Ultimate Oldschool PC Font Pack; JetBrains Mono (64-bit)
- [ ] Playtest the 64-bit era on a real screen with `?fps`: smoothness, ligatures (`<-` drawn as an arrow) kept or not
- [ ] Drive the era from the player's CPU word size instead of the preview keys

### Education: briefing → practice → play for every concept
- [x] Briefing system: paged concept cards (picture, ≤ 3 short lines, an analogy, then "how it plays")
- [x] Practice mode: notes wait at the hit line, first-time callouts explain each instruction, wrong keys explain instead of stalling
- [x] Tier 1 lesson: what a CPU does, the clock, functional units, registers vs memory, how it plays, scoring
- [x] Tier 2 lesson: pipelining (laundry analogy), data hazards, stalls (+ tier 2 practice)
- [x] Tier 3 lesson: forwarding
- [x] Branch prediction lesson (tier 4)
- [x] Memory wall lesson (the trip, cycles per trip by clock, the floor chart) and cache lesson (desk, lines and blocks, the address split, locality, three kinds of miss, how it plays, score); practice narrates the first miss, hit and store
- [ ] Storage lessons: RAM / page faults, HDD
- [ ] Track hazard-decision accuracy (learning objective 1) and show it after each contract

### Tier 2–3 play screen (design: player is the control unit)
- [x] Pipeline shown on the highway: hit line = ID, EX / MEM / WB rows below; a link from a waiting note to the instruction computing its register; registers still being computed marked in the panel
- [x] "Pipeline fill" feel: clock never changes; music adds one layer per occupied stage; a flush strikes out notes and drops layers, then refills; live throughput meter
- [x] STALL key (Space) inserts a bubble; stall rules follow the textbook 5-stage pipeline (distance 1 → 2 stalls, distance 2 → 1)
- [x] Routing into a hazard shows the stale value read next to the correct one, then flushes
- [x] Forwarding (tier 3): ALU→ALU needs 0 stalls, load-use needs 1; forwarded values shown jumping up a wire; results compare with/without forwarding
- [x] Branch prediction keys (tier 4): J = guess not taken, K = guess taken; a wrong guess strikes out the fetched instruction
- [x] Branch hint (tier 4): note glows in the color of what the branch did last time; history in the listing
- [x] Hardware predictors (tiers 5-6): 1-bit and 2-bit, guessing first with the player following or overriding; nested-loop SUM GRID where 2-bit beats 1-bit (7 vs 10 misses)
- [x] Results compare single-cycle vs pipelined CPU time (CPI up, period down, faster overall)
- [x] Tier switch on the title screen (`T`) until the shop exists
- [ ] Playtest tier 2 in a real browser: timing, music mix, readability
- [x] Results on notes, a bus carrying results to registers / memory, and a 2x replay (picked from five views tried in playtest)
- [x] Tier 2 program listing that scrolls with the instruction in ID and tags each line with its stage
- [x] Plain-English stage labels (FETCH / DECODE / EXECUTE / MEMORY / WRITE BACK); results wait until the last instruction leaves WB
- [x] Replay after every run, with speed control, pause, and click-anything explanations (`data/glossary.ts`)
- [x] Panel split into titled PROGRAM / REGISTERS / MEMORY boxes; hover outline on clickable things in replays
- [x] Tier 1 replay and explanations (tier 1 now plays on the shared pipeline screen)
- [ ] Run logic accepts several presses per beat (ready for superscalar chords later)

**Done when:** a new player can go from tier 1 to tier 3 and buy an HDD in one ~30-minute session, the CPI numbers are verified by tests, and the game runs from a plain static server.

## Later (not part of the MVP)

- Idea, not decided: on contracts that fight the cache, a programmer's fix on the job sheet before the song (pad the array so it stops colliding, swap the loops to read a grid by row); the song plays the fixed program and results compare. A decision for direct-mapped caches, which have none of their own; could be a second measurable learning objective
- Pipeline designer (cut the datapath; stalls stay manual at every depth; open: hold Space until the hazard clears), after L2 / L3 and pages + HDD
- Stretch, in priority order: SSD flash mode → dual-issue → NVMe mode → out-of-order + renaming, report card, before/after check
- Submission: see "Before submission" at the top
