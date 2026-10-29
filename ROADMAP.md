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
- [ ] Full-length song (~60 s): longer program or several programs back to back (contract songs now run 60-150 cycles, median 94 on tier 2: ~65 s at 87 BPM, ~40 s at 147; longer needs more memory, with the cache work)

**Done when:** a 60-second tier 1 song is playable, instructions visibly execute on the beat, and registers update correctly. (Currently ~15 s.)

## Phase 2: MVP

### CPU simulation
- [x] 5-stage pipeline model (IF, ID, EX, MEM, WB)
- [x] RAW hazard detection and stall (bubble insertion)
- [x] Forwarding unit (simulator option; still needs the upgrade in the shop)
- [x] Branch handling: flush on mispredict; predictors none (tiers 2-3) → player guesses (tier 4) → 1-bit (tier 5) → 2-bit (tier 6)
- [ ] Memory wall: RAM access in fixed ns (~80, check the textbook), so cycles per access grow with the clock; an access longer than a cycle freezes the pipeline (single-cycle too)
- [ ] L1 cache: 16 bytes, direct-mapped, 4 lines × 4 bytes, write-through + write buffer; a miss freezes the pipeline, 1-3 beats on a log scale, real cycles in the CPU-time math
- [ ] Miss kinds for replays: first use / conflict / too small (compare with a fully associative cache of the same size)
- [ ] Tests: hit/miss counts and miss penalties match hand-worked examples (SUM, ADD ARRAYS colliding vs not)
- [ ] Word size: multi-chunk add-with-carry chains on narrow CPUs
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
- [x] A worn chip overheats sooner (88°C at 140% ... 70°C at 110%), so its top clock stays as risky as 150% on a new chip
- [x] Key registers (NEXT, END, GRID) tagged in the REGISTERS box and introduced in a ~4 s count-in before each song and practice
- [ ] Cache miss in the song: load shows `MISS → RAM`, the bus carries the block to its line, a counter rolls up the real cycles; presses during the freeze are ignored
- [ ] CACHE box in the panel (valid, tag, data per line; each lookup shown as `0000 01 10 → line 1, tag 0 → HIT`); MEMORY box grows to addresses 0-63
- [x] Clock dial in the song (`G` / `H`, 50–150% of the rated clock, tiers 2–6); results show average clock, peak temperature, overheats and real CPU time. Overclocking past 100% is a shop upgrade; every tier has it
- [x] Underclocking down to 50% (slower tempo to think, more CPU time, cooler)
- [x] **Overclock red zone:** the dial goes past the rated clock; heat builds every beat; overheating **throttles** (clock drops to rated mid-song until it cools) and **wears the chip** (maximum clock -10% until repaired). Still to do with the shop: better pay when overclocked, paid repairs, cooling upgrades that widen the safe zone
- [x] Heat meter and thermal throttling (`sim/thermal.ts`), with fire effects building up with heat (`visual/heat.ts`)

### Memory and storage
- [ ] Generator: data in addresses 0-63, bigger than the cache; ADD ARRAYS sometimes placed so its arrays collide in the cache
- [ ] Contract cards show the access pattern (sequential, two arrays, grid by column ...)
- [ ] Results: "waiting on memory" bar, hits / misses / hit rate, a "no cache" bar
- [ ] Shop: L1 cache (a memory part, separate from the CPU tiers)
- [ ] L2 cache, then L3 (shop upgrades; a miss checks each level; results show average memory access time)
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
- [x] Terminal look with four eras (green CRT → modern terminal), previewable with keys 1–4
- [ ] Drive the era from the player's CPU word size instead of the preview keys

### Education: briefing → practice → play for every concept
- [x] Briefing system: paged concept cards (picture, ≤ 3 short lines, an analogy, then "how it plays")
- [x] Practice mode: notes wait at the hit line, first-time callouts explain each instruction, wrong keys explain instead of stalling
- [x] Tier 1 lesson: what a CPU does, the clock, functional units, registers vs memory, how it plays, scoring
- [x] Tier 2 lesson: pipelining (laundry analogy), data hazards, stalls (+ tier 2 practice)
- [x] Tier 3 lesson: forwarding
- [x] Branch prediction lesson (tier 4)
- [ ] Cache lesson: the memory wall (chart of RAM cycles vs clock), what a cache is (a desk next to the library), lines and tags, hit vs miss, locality; practice narrates each lookup
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

- Pipeline designer (cut the datapath; stalls stay manual at every depth; open: hold Space until the hazard clears), after L2 / L3 and pages + HDD
- Stretch, in priority order: SSD flash mode → dual-issue → NVMe mode → out-of-order + renaming, report card, before/after check
- Submission: README, 800×450 thumbnail (≤ 500 KB), `games.yml` entry, size check (≤ 35 MB), GitHub Pages test, pull request
