# Changelog

Newest first. Each work session adds an entry: what changed, which files, and what's next.

## Decisions

Technology and design decisions, with the reason for each (see `RULES.md` rule 3).

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-28 | Game concept: tycoon + rhythm game where each beat is a clock cycle | Ties rhythm gameplay directly to CPU concepts; satisfies the "mechanics must teach" requirement |
| 2026-10-28 | Scope is phase-based with no internal due dates; only Nov 30 is fixed | Team expects to move faster than a fixed schedule |
| 2026-10-28 | Rendering: **Phaser 3.90** (possible move to Phaser 4 later) | Full framework with built-in WebGL effects (bloom, glow, barrel, vignette) and pixel-art mode; far more docs/examples than Phaser 4, which matters in a one-month project |
| 2026-10-28 | Language: **TypeScript** | Static type checking before running; easier to keep the codebase consistent, for the team and for Claude |
| 2026-10-28 | Audio: **raw Web Audio API** | No dependency; the beat clock stays small code the team understands and can explain; oscillators give a chiptune sound |
| 2026-10-28 | Testing: **Node's built-in `node:test`** | Nothing to install; enough to verify the simulation's CPI math |
| 2026-10-28 | **No WebAssembly** | The simulation is computationally trivial; wasm would add a toolchain and debugging cost with no gain. Godot's web export also exceeds the 35 MB limit by default |
| 2026-10-28 | Internal resolution raised to **960×540** | 480×270 text was too hard to read |
| 2026-10-28 | Notes use **syntax highlighting**, not color-by-unit | Coloring by unit would let players route by color without reading the instruction, which undercuts the learning goal. Highlighting helps reading speed without giving the answer away; monochrome eras use brightness levels, color arrives at 32/64-bit |
| 2026-10-28 | Tier 1 tempo **80 BPM** (relaxed 64) | Slower start for learning; clock upgrades will raise it |
| 2026-10-28 | Design direction: **player is the control unit**; each tier adds one decision (route → stall → predict → chord) and upgrades automate it | Players learn what each piece of hardware does by doing its job by hand first |
| 2026-10-28 | **Briefing → practice → play** for every concept; one idea per card (picture, ≤ 3 short lines, an analogy) | Concepts and gameplay must be easy to digest before they're tested |
| 2026-10-28 | Streak feel for pipelining: **"pipeline fill"**. The clock (beat) never changes; correct hits keep the pipeline full (one instruction completes per beat, music builds one layer per occupied stage); mistakes flush it (struck-out notes, a gap of bubbles, layers drop out) and it refills | A literal tempo change on mistakes would teach something false (hazards don't slow the clock). Turbo/heat could later cover real clock changes |
| 2026-10-28 | **Tempo follows the clock on a log scale:** 75 BPM at 1 MHz, +12 BPM per 10× clock (~118 BPM at 4 GHz); relaxed/practice at 80% | Real clocks grow ~4000×; a gentle, capped curve keeps the late game playable. CPU-time math uses the real period |
| 2026-10-28 | **Clock is a dial** set before each program: upgrades raise the maximum, players may underclock | Makes CPU time = IC × CPI × period a player choice (faster clock vs. more stalls), like real overclocking instability; players control difficulty |
| 2026-10-28 | **Overclock red zone** above the rated clock: faster and better-paid, but builds heat; overheating throttles mid-song; cooling widens the zone | Matches real overclocking (performance traded for heat and stability); ties the clock dial, heat meter and cooling upgrades together |
| 2026-10-29 | **Overheating stops the clock** (replaces dropping back to the rated clock): nothing runs, notes freeze, music stops, until it cools (~5-8 beats); the time counts toward CPU time but not cycles or CPI. **Wear keeps lowering the overheat point down to 100%** (65°C), so a worn-out chip overheats at its rated clock: underclock to 90% or less, or repair. Wear and the overclock cap are now separate (no overclocking upgrade = H stops at 100%, but the chip isn't worn) | Team: a worn-out chip should still be dangerous, demanding an underclock or a repair. Accurate: real CPUs stop their clock when too hot (thermal clock modulation, in microsecond bursts; compressed here), besides lowering clock and voltage |
| 2026-10-29 | **A worn chip overheats sooner:** its overheat temperature drops so its top clock heats to it as fast as 150% on a new chip (88°C at 140%, 82 at 130%, 76 at 120%, 70 at 110%); back to 95°C once no overclock is left; the cool-down point stays above where the rated clock settles | Team: after one overheat the chip became safe (130% and below could never overheat), so wear didn't bite. The rated clock is always safe and a throttled chip always recovers. The fan still keeps even a worn chip's top clock safe |
| 2026-10-29 | **Key registers (NEXT, END, GRID) are tagged in the panel and introduced in a count-in** before each song and practice; register numbers stay random | Team: the loop's next and end addresses should be easy to recognize before the song starts. A count-in adds no extra screen; random numbers keep reading practice, the tags make them findable |
| 2026-10-29 | **Contracts come from made-up clients** with the job in their words (2-3 companies per kind of program); **longer programs** (all 16 bytes of the panel's memory); **heat builds faster** (time constant 25 → 15 cycles, reversing the earlier "gentler" playtest change); **the bus stops at the box edge** | Team: contracts should feel like real work; overclocking couldn't burn a chip within one short song; the bus covered the panel's text. Companies are invented so the game never imitates a real business |
| 2026-10-28 | **Clock upgrades raise the tempo again, on a steeper curve:** +20 BPM per 10× clock (pipelined 87 BPM at 4 MHz → ~147 at 4 GHz; single-cycle 75 → ~135); replaces "clock upgrades change CPU time, not the tempo" and the +12 BPM curve | Team choice: upgrades should be felt in the song. Underclocking (G, down to 50%) and relaxed mode stay available for anyone it gets too fast for (underclocking costs CPU time) |
| 2026-10-28 | **Memory wall:** a RAM access takes a fixed time (~80 ns, approximate, to be checked against the textbook), so its cost in cycles grows with the clock (0 extra at 4 MHz, 2 at 16 MHz, ~320 at 4 GHz). A miss freezes the pipeline for 1-3 beats on a log scale with the real cycle count shown and used for CPU time | Accurate, and it's why caches exist: past a few clock upgrades, CPI rises and contract times stop improving until the player buys a cache |
| 2026-10-28 | **L1 cache, one fixed shape:** 16 bytes, direct-mapped, 4 lines × 4 bytes (address `tttt ii oo`), write-through with a write buffer (stores never freeze). Automatic in the song (no new keys); taught by the panel showing each lookup, results (waiting-on-memory bar, hit rate, vs. no cache), replay miss kinds (first use / conflict / too small) and a briefing. Choosing a shape (block size, associativity) comes later | Playtest worry: tier 6 players already route, stall, guess branches and run the clock dial; a fifth in-song job would overwhelm. The textbook's standard first cache, where conflict misses are easiest to see |
| 2026-10-28 | **Memory hierarchy plan:** L1 → L2 → L3 → RAM page frames + HDD → SSD / NVMe. Cache levels play automatically in the song; a page fault pauses the song for its own view (pick the page to evict, then the platter). A miniature, labeled as scaled: 16-byte L1, bigger L2/L3, 256-byte RAM, 16-byte pages. If time runs short, drop SSD / NVMe first, then L3 | Keeps the song's load the same while covering the textbook's hierarchy; page faults are slow enough in reality that pausing for them is honest |
| 2026-10-28 | **Pipeline depth: cut the datapath** (the design doc's designer) rather than preset depths; **stalls stay manual** at every depth (no hazard detection unit part). Built last of the CPU/memory work | Team choice: the cutting puzzle also teaches stage balancing. Open: deep pipelines need many stalls per hazard; one option is holding Space until the hazard clears |
| 2026-10-28 | **Generated programs for contracts:** 9 kernel kinds with random sizes, data, registers and order, rebuilt from a seed in the contract's name; results condensed into ASCII charts | Variety without hand-writing programs; different orders teach that scheduling changes hazards. Charts make the contract pace (instructions x CPI x period) readable at a glance |
| 2026-10-28 | **Contract deadlines:** each contract has its own deadline; locked if your CPU can't make it playing perfectly; late (judged at the CPI and clock you actually played) pays half. STANDARD jobs made bigger. A background debt deadline comes later on the same calendar | Playtest: STARTER was pointless when STANDARD was open from the start. Deadlines make every upgrade open better work, and make CPI from your own play matter (CPU time = instructions x CPI x period) |
| 2026-10-28 | **Tier 1 runs on the pipeline scene** (single-cycle mode in the simulator) instead of its own scene; overclocking is a shop upgrade (underclocking stays free); briefings are mandatory right after buying a part | Playtest: tier 1 lacked the bus, replays and explanations; one scene means every feature reaches every tier. Free underclocking keeps a difficulty option for everyone |
| 2026-10-28 | **Endless contract board and shop:** random contracts in STARTER / STANDARD / ADVANCED sections, flat pay, each showing the whole job's time on your CPU; locked over 30 days. Shop sells CPU parts (the tiers, in order), clock upgrades (to 4 GHz), cooling and repairs. Clock upgrades change CPU time, not the tempo. No other contract mechanics yet | Team choice: show how slow early CPUs are ("117 YEARS") and let clock upgrades visibly shrink it; keep contracts simple until later. The debt deadline builds on this |
| 2026-10-28 | **Overclocking and heat:** G / H turn the clock 50-150% during a song; the tempo scales exactly (beat = cycle); power = f·V² with voltage rising with the clock; throttle at 95°C back to the rated clock until 80°C; each overheat lowers the chip's maximum clock 10% until repaired (free now, paid in the shop). Fire effects use Phaser's built-in particles | Teaches the power wall, thermal throttling and wear by feel; underclocking doubles as an honest difficulty option (slower, but more CPU time). Reuses the engine already chosen. The briefing says the fire is exaggerated |
| 2026-10-28 | Tiers 5-6: hardware predictors **guess first; the player follows or overrides** (rather than fully automatic, or setting the counter by hand); offered as tiers 5 and 6 on T until the shop exists | Keeps a decision at every branch while showing what the hardware does; beating the predictor needs understanding the loop (watch x1 reach x2). The nested-loop SUM GRID makes 1-bit vs 2-bit visible (10 vs 7 misses) |
| 2026-10-28 | Tier 4 hint: a branch note **glows in the color of the key matching what it did last time**, with an arrow badge as a non-color backup; J (not taken) left, K (taken) right | Text like "LAST: T T T" is too slow to read mid-song; a colored glow is seen at a glance. Showing only the last outcome teaches what a 1-bit predictor knows, and its miss at loop exit sets up the 2-bit predictor |
| 2026-10-28 | Tier 2 layout: **EX / MEM / WB rows below the hit line**, with a link from a waiting note to the instruction computing its register | Playtest: the corner pipeline strip was too far from the notes to use while playing |
| 2026-10-28 | Tier 2 shows **results on notes**, a **bus** carrying results to registers/memory, and a **2x replay**; breathers and a view selector were tried and dropped | Playtest of five views: these let players see what the CPU did without looking away from the notes |
| 2026-10-28 | All keyboard input via `game/src/input/keys.ts`; Phaser's keyboard plugin disabled | Phaser re-processes its per-frame key queue on every new key event, so two key events in one frame fired handlers twice (found when briefing pages skipped) |
| 2026-10-28 | Art direction: 8/16-bit pixel art, ~480×270 internal resolution (now 960×540, see above), electronics effects, **old-terminal / green-phosphor CRT look** | Fits the hardware theme; visuals can evolve with CPU tier (presented as era styling, not a technical claim) |

| 2026-10-28 | Build: **plain `tsc`, no bundler**; commit both `src/` and compiled `js/` | Smallest possible build step; output mirrors source and runs as-is on GitHub Pages. Tests run on `.ts` directly via Node type stripping (`erasableSyntaxOnly`) |
| 2026-10-28 | Package manager: **npm** (dev tools only: `typescript`, `phaser@3.90.0`, `@types/node`) | Already installed with Node; `node_modules/` never ships |
| 2026-10-28 | Dev server: **`python3 -m http.server`** | Already installed; teammates may use any static server |

| 2026-10-28 | Git: **separate team repo** (this directory); the whole team works in one `game/` folder, copied to `games/bit-cycler/` in the course repo fork at submission | Small repo with only our work; planning files stay out of the shipped folder |
| 2026-10-28 | Title: **Bit Cycler**, folder `bit-cycler` | Team choice |

| 2026-10-28 | ISA: **RISC-V inspired**, adapted for 8/16/32/64-bit CPU tiers | Matches modern textbook notation; real RV32I/RV64I at 32/64-bit, simplified teaching CPUs at 8/16-bit (README must say so) |
| 2026-10-28 | CPU word size progresses 8 → 16 → 32 → 64-bit; art style is separate (pixel art throughout) | Word size is a real gameplay mechanic (multi-chunk arithmetic) |

| 2026-10-28 | TypeScript **7.0.2** (native Go compiler); exact versions pinned: `phaser@3.90.0`, `@types/node@22.20.5` | Current release line, much faster; we use only the plain compiler, so its plugin/API gaps don't affect us. Fallback is 6.0.3 with no code changes |

| 2026-10-28 | Tier 1 input: **route each instruction to its functional unit** (ALU / MEM / BRANCH lanes, keys D / F / J) | Makes tier 1 about reasoning (instruction classes), not just rhythm; a wrong unit or a miss stalls a cycle, so CPI shows the cost |
| 2026-10-28 | Relaxed mode (first version): wider timing windows and 80 instead of 100 BPM | Simple to build; "pipeline waits for input" from the design doc is not done yet |

All Step 0 decisions are made.

---

## 2026-10-29

### Rubric check (no code)
- Checked the game against the assignment spec (which gives only the three category weights, no performance levels). Met: runs in a browser with no installs, 2.3 MB of the 35 MB limit, relative paths only, a Computer Organization topic, mechanics that teach with no quizzes, interaction, feedback, objective and progression, in-game instructions (briefings, practice, replays), and a visual model of the CPU.
- Not yet: `game/README.md` is a stub, no `thumbnail.png`, the measurable learning objective isn't tracked or shown, no `games.yml` entry or pull request, no textbook check of the figures. Risk: all commits come from one account, and only students who actively contribute get credit.
- Estimated as it stands (with the paperwork done): Technical Content A- (~90), Educational Experience B+ (~85), Game Design and Implementation A- (~88-90); about B+/A- overall. Biggest gains: measuring the learning objective, an outside playtest, the memory wall + L1 cache.
- The action items are at the top of `ROADMAP.md` ("Before submission").

### Overheating stops the clock; a worn-out chip overheats at 100% (uncommitted)
- **An overheat stops the clock** (`sim/thermal.ts`, `rhythm/pipelineRun.ts`): instead of dropping to the rated clock, the chip runs no cycles until it cools to its resume point. Each beat with the clock stopped (`Chip.coolBeat`) only leaks a little power (`haltPower` 0.2), so it cools fast: 5-8 beats. Notes freeze in place (every due beat moves back a beat), key presses are ignored, the music stops, and the gauge says CLOCK STOPPED. The panel says "OVERHEATED: CLOCK STOPPED / COOLING 66°C -> 59°C" and the damage, then "COOLED: CLOCK RUNNING AGAIN". Replays show the same stops (they come from the model).
- **Time lost cooling counts:** stopped beats add real time (`haltedMicros`) but no cycles, so CPI is unchanged while the contract's pace includes them. The results add "CLOCK STOPPED TO COOL FOR 7 BEATS: NO CYCLES, BUT 109 ns LOST (+3.4 ns PER INSTRUCTION)".
- **Worn all the way down:** the overheat point keeps dropping to 65°C at a top clock of 100%, so a worn-out chip at its rated clock overheats in about 28 busy beats, like 150% on a new one. 90% only just stays safe and 80% easily; the fan still keeps any top clock safe. It can't wear past 100%.
- **Wear and the overclock cap are separate** (`Chip.canOverclock`, `dialCap`): without the overclocking upgrade, H stops at 100% but the chip keeps its own wear; practice always runs on a new chip, so it never overheats.
- Lesson cards (thermal throttling, heat wears the chip), the lesson chart (squares now mark stopped beats), and the glossary describe it.
- Tests (72): an overheat stops the clock, runs no cycles, cools in 3-12 beats and counts its time; a worn chip's top clock (down to 100%) overheats within a beat of 150% on a new one; a worn-out chip keeps stopping but always restarts and never wears past 100%; 90% and 80% are safe when worn out; no overclocking upgrade caps H at 100% and is safe on a new chip; in a song, a stopped clock ignores presses and pushes the next note back.
- Verified in headless Chrome: a tier 3 contract on a worn-out chip at 100% overheated at 65°C around cycle 40, stopped for 7 beats with the freeze message and gauge, ran again, and the results showed the cooling time.

### Clients, longer programs, faster heat, and a tidier bus (committed in a59c56b)
- **Every contract is for a made-up client** (`sim/generator.ts`, `CLIENTS`): 2-3 companies per kind of program, each describing the job in its own words: FAIRVIEW SAVINGS "TOTAL 107 BILLION DEPOSITS", LANTERN MAIL "VERIFY ... EMAIL BYTES", GREENLEAF CLINIC "COUNT 2s IN ... TEST RESULTS", STARGAZER LABS "BRIGHTEN (x2) ... PIXELS", CROPWATCH SURVEY "SUM 3x4 FIELDS: ... CELLS" and so on. Picked from the seed, so a contract still stores only its program's name. The board card leads with the client; the song's title shows the client and the PROGRAM box is titled with the program ("PROGRAM: ADD ARRAYS #876724"); the results say "RESULTS: TWIN RIVERS FARMS ON TIER 3: FORWARDING". The board never shows the same client twice (`fillBoard` rerolls).
- **Longer programs:** every kind now uses up to all 16 bytes of the panel's memory (SUM / CHECKSUM / COUNT / FIND 8-14 bytes, DOUBLE 8-15, FILL 8-16, COPY 5-8, grids up to 15 cells). ADD ARRAYS now adds a second array (8..) into the first (0..), so it can do 5-8 pairs. Songs went from a median of about 45 cycles to 94 on tier 2 (10% shortest 60, 10% longest 148).
- **Heat builds faster:** the chip's time constant went from 25 to 15 cycles (`sim/thermal.ts`): from cold, 150% overheats in about 28 busy beats and 140% in about 53, so an overclocked song can actually burn the chip. Wear per overheat is unchanged (10% off the maximum clock). Verified: an autoplayed tier 3 contract at 150% overheated once around cycle 42, throttled, cooled to 80°C and sped up again.
- **The bus stops at the box edge** (`scenes/PipelineScene.ts`): values travel up the bus and wait beside their row, outside the panel, instead of sliding over the register and memory text. The row lights up as the value lands, and a stored byte gets a brief outline in its memory row.
- **A worn chip overheats sooner** (`Chip.throttleAt` / `resumeAt` in `sim/thermal.ts`): each 10% of wear lowers the overheat point so the new top clock heats up to it in the same ~28 busy beats as 150% on a new chip: 95°C new, 88°C at 140%, 82 at 130%, 76 at 120%, 70 at 110%, and 95°C again once there's no overclock left (so the rated clock never overheats). It cools down to just above where the rated clock settles, so a throttled chip always recovers. The gauge's mark, the fire effects (now 20 / 10 / 4 degrees below the overheat point) and the "COOLED TO" message follow the chip's current limit; the overclocking lesson's chart steps its limits down as the chip wears, the wear chart labels each step "HOT AT 88°C" and so on, and the lesson, glossary and cooler descriptions say so (the heatsink's "140% no longer overheats" is for an undamaged chip; the fan keeps any top clock safe).
- Verified: a chip worn to 140% shows its limit as 88°C on the gauge, with sparks from 84°C; both lesson charts.
- Tests (70): every generated program has a client whose name fits a card and a job wording; a board never repeats a client; heat test retuned (overheats after 20-40 beats at 150%); a worn chip's top clock overheats within a beat of a new chip at 150%, always recovers, the rated clock never overheats, and the fan keeps every top clock safe.
- Found while checking: the program's name squeezed in at the right of each card collided with the instruction count (removed from the card; it's in the song's PROGRAM box), and the longest job wordings were squashed (shortened: "TALLIES", "DISK BYTES", "FIELDS", "MAPS").

### Key registers: tagged, and introduced in a count-in (committed in a59c56b)
- **Every program names its loop's key registers** (`ProgramSpec.keys`): `NEXT` (the next address, or which pair is next) and `END` (the value that stops the loop), plus `GRID` for the end of a grid (where `END` is the end of the current row). Register numbers stay random in generated programs; the tags follow them.
- **Count-in before every song and practice** (not replays): about 4 seconds (6 beats at 87 BPM, 10 at 147) with the panel saying what each one does ("x7 = NEXT: NEXT BYTE'S ADDRESS, FROM 0", "x5 = END: STOP WHEN x7 REACHES 8") and counting down, while those registers pulse. Then "GO!".
- **In the REGISTERS box**, key registers are bold, bright and tagged ("x7  0x03   3 NEXT"). The register rows went from 16 px to 14 px so a tag fits beside "<-MEM" (widest row 193 px in a 196 px column, measured in the browser).
- Test (67 total): every generated program (3,000 seeds) and both fixed programs tag NEXT and END, and they're the pair the loop's `bne` compares; tags fit the panel and lines fit the count-in.
- Verified in headless Chrome: count-ins at tier 1 (75 BPM, 5 beats), tier 2 (87 BPM) and tier 6 at 4 GHz (147 BPM, 10 beats, GRID SUM with NEXT / END / GRID), ending in GO! with the tags still showing; a FIND with NEXT = x7 and END = x5 in the right-hand column.
- Decision: random register numbers kept, labelled instead (team choice over always x1 / x2); introduced in a count-in rather than a separate job sheet screen.

## 2026-10-28

### Added
- Design doc ([link](https://claude.ai/artifact/8VttdcZGpm8e6upLo3wgzy)): pitch, assignment constraints, learning objectives, core loop, CPU tiers, pipeline designer, superscalar, storage branch (RAM / HDD / SSD / NVMe), economy, proposed tech, team split, scope.
- `RULES.md`: working rules (stay in this directory, consult before commit/push, consult before adopting technology, keep logs current), course project rules, design rules.
- `ROADMAP.md`: MVP roadmap with Step 0 decisions, Phase 1 prototype, Phase 2 MVP, and later work.
- `CHANGELOG.md`: this file.
- `CLAUDE.md`: points each new session to the rules, changelog, and roadmap, with the working rules in brief.

### Changed
- Design doc scope section: removed fixed internal dates; replaced the dated timeline with a four-phase sequence.
- Design doc superscalar section: corrected pairing rules. WAR is safe in in-order dual-issue; WAW and RAW block pairing; renaming matters once instructions can be reordered.

### Design session: memory hierarchy, tempo, pipeline depth (no code yet)
- Decided the memory plan and the L1 cache mechanic, the steeper tempo curve, and the pipeline designer's form (see the Decisions table). Build order: tempo → memory wall + L1 → L2 / L3 → RAM pages + HDD → pipeline designer → SSD / NVMe.
- Not yet copied into the design doc (it's shared with the team).

### Clock upgrades raise the tempo (committed in a59c56b)
- **Songs play at the tempo of your rated clock** (`scenes/PipelineScene.ts`; the fixed `TEMPO_MHZ` is gone), on a steeper curve: +20 BPM per 10× clock (`rhythm/tempo.ts`). Pipelined: 87 BPM at 4 MHz, 117 at 128 MHz, 147 at 4 GHz; single-cycle: 75 at 1 MHz, 135 at 1 GHz. Relaxed mode and practice still play at 80%, and G / H still scale it during a song.
- The shop's clock upgrade says so, with the numbers ("the song's beat speeds up (105 -> 111 BPM)"), and buying one says "CONTRACTS TAKE LESS TIME AND THE BEAT IS FASTER" (`sim/progress.ts`, `scenes/ShopScene.ts`).
- Tempo test updated to the new curve (66 tests pass).
- Removed an unused, never-committed `sim/randomProgram.ts` (template-free random programs); contracts keep the template generator, whose access patterns the cache work needs.
- Verified in headless Chrome: songs at clock levels 0 / 5 / 10 (pipelined) and 0 / 10 (single-cycle) run at the expected tempos; the shop text fits on two lines.

### Results as charts, and generated programs for contracts (committed in a59c56b)
- **Results screen, condensed into ASCII charts** (`visual/asciiChart.ts`): **where the cycles went** (finished an instruction / stalled / flushed / filling and emptying, giving CPI = cycles / instructions), **time per instruction = CPI x clock period** for you, the CPU this tier improved on (no forwarding / never guessing / predictor alone, played perfectly) and single-cycle, and **the whole contract = its instructions x your time per instruction**, with a deadline bar (`[####|....]`, `>` when far past) and ON TIME / LATE: HALF PAY. Dropped: the long CPU-time table, "x faster than single-cycle" and "saved N cycles" (the bars show both), and the clock line unless you changed the clock or overheated.
- **Every contract gets a randomly generated program** (`sim/generator.ts`): one of 9 kinds (sum, checksum (XOR), count a value (a forward branch), copy, double in place, add two arrays, find the first match (an early exit), fill, grid sum (a loop inside a loop)) with random sizes, data, register choices, and sometimes instruction order (moving the pointer step between a load and its use removes the load-use stall). Built from a seed: a contract stores only its name ("CHECKSUM #4821") and `programByName` rebuilds it. Inputs and outputs stay in addresses 0-15 (the panel), 16-120 instructions per song. Each kind has its own register roles, memory note and job wording ("COUNT 2s IN 5 BILLION BYTES").
- Tests (66): 3,000 seeds finish with the right answer and stay in memory 0-15; 300 seeds give the same answers on single-cycle, pipelined, forwarding and both predictors; same seed same program; all 9 kinds appear; chart bars.
- Found while checking: a FIND could match at address 0 and end after 6 instructions (the first match is now at least 3 bytes in, and the smallest sizes went up); long job wording overflowed board cards (shorter wording, squeezed to fit); a tiny job's deadline bar showed no mark.
- Verified: tier 1 and tier 3 (overclocked, late) results, the board with generated contracts, a generated SUM on tier 6 with no load-use stalls.

### Contract deadlines (committed in 95683f5)
- **Every contract has its own deadline** ("NEEDED IN: 1.4 DAYS"), replacing the single 30-day limit. Sections: STARTER (10 thousand-1 million instructions, needed in 1-10 minutes, $40-80), **STANDARD, now bigger** (100 billion-30 trillion instructions, 1-7 days, $150-400: mostly out of reach at 1 MHz, opening up with a pipeline and clock upgrades) and ADVANCED (100 trillion-1 quadrillion, 7-60 days, $500-1,200; capped so a fully upgraded CPU can take every one). Pay rises with size and urgency.
- **Locked** if your CPU couldn't meet the deadline even playing perfectly ("TOO SLOW: NEEDS A FASTER CPU"); **tight** if it would use over 80% of it ("TIGHT: PLAY CLEANLY OR BE LATE").
- **Late = half pay:** the results check the whole job at the pace you actually played (your CPI and the clocks you ran at) against the deadline: "NEEDED IN 6.6 DAYS. AT THIS PACE IT TAKES 278 DAYS. LATE! HALF PAY: $148".
- Old saves' contracts (without deadlines) are replaced on load. Durations say "1 MINUTE", not "1 MINUTES".
- Tests (61): deadline ranges, locked / tight, standard mostly locked at 1 MHz but open at 32 MHz pipelined, the biggest advanced job possible at 4 GHz, half pay when late.
- Verified: the board (starter open; standard and advanced too slow at 1 MHz, with one standard job reachable) and a late contract's results.

### Playtest round: mandatory briefings, overclocking upgrade, tier 1 on the shared screen, chip art, sound (committed in da7870e)
- **Briefings are mandatory:** buying a CPU part plays its briefing straight away (no skip), then a practice of the new part, then back to the board. Buying overclocking plays the overclocking briefing, then back to the shop. A new game's first briefing can't be skipped either; `B` on the title still opens briefings freely.
- **Overclocking is an upgrade** ($400, "OVERCLOCKING: UNLOCKS [H]"): without it, H stops at the rated clock ("OVERCLOCKING: IN THE SHOP") and the gauge shows `[G] SLOWER`. Underclocking (G, down to 50%) stays free as a way to slow a hard song down. The overclocking briefing no longer appears before the first pipelined song.
- **Tier 1 now plays on the same screen as tiers 2-6** (the old `PlayScene` and `rhythm/run.ts` are removed): the simulator has a single-cycle mode (`PipelineOptions.singleCycle`: the instruction on the line does all five steps in one beat, results are written straight away, branches never fetch the wrong instruction, CPI 1). Tier 1 gets the bus, results on notes, the register/memory panel with arrivals, replays with speed/pause/click-to-learn, the clock gauge and heat, G/H, and contract results. Its own touches: NEXT / EXECUTE (ALL 5 STEPS) / DONE labels, NOW / NEXT / DONE listing tags, no stall bar, a "NEW INSTRUCTION" explanation for each kind of instruction in practice, a `SINGLE_CYCLE` glossary entry. `Pipeline.cycles` gives the right count for both CPU types. The 4 tier 1 rhythm tests were ported (59 total).
- **Shop chip art** (`visual/chipArt.ts`): ASCII art of your chip next to the list: heatsink fins or a fan on top, the die showing your parts (single-cycle core, then IF>ID>EX>ME>WB, the forwarding wire, the branch unit, "~ OC ~"), the clock under it, and cracks for each 10% of wear. It hums with a faint tremble and shakes hard when something is fitted (the briefing waits until it stops).
- **Sound** (`audio/menu.ts`, all synthesized): on the title, board, shop and briefings, the hum of an old computer left on: fan noise, 60 Hz mains hum, a faint CRT whine, and hard drive seeks every few seconds (fades out for songs and calibration). Menu actions sound like mechanical key presses: a light click to move, a heavy thock to choose, a burst of typing to buy, a dull double thunk for errors. `M` turns the hum on/off (saved). (A looping chiptune came first; playtest preferred a computer sound.)
- Fixed while checking: the gauge showed "MAX 100%" as if worn when overclocking simply wasn't owned.
- **Testing cheats** (`cheats.ts`): `cheat.help()` in the browser console lists them: money, tier, clock level, cooling, overclocking, wear, unlock everything, new board, briefings read/unread, autoplay, chip temperature mid-song, reset. Each saves and redraws the menu showing. `withTier()` in `sim/progress.ts` (1 new test, 60 total). Checked in the browser: `cheat.unlockAll()` + `cheat.wear(1.2)` then the shop shows tier 6, 4 GHz, fan, cracks and a $180 repair.
- Verified on the real clock: tier 1 mid-song (bus, DONE row, NOW/NEXT/DONE) and its contract results after the replay; shop after buying clocks and the heatsink, the shake, the mandatory lesson 2 after buying the pipeline (no skip), title and board with `[M] MUSIC`.

### Contract board, shop, clock upgrades, and saves (committed in da7870e)
- **Endless contract board** (`scenes/BoardScene.ts`): random jobs in three sections, **STARTER** (10 thousand - 1 million instructions, $40-80), **STANDARD** (1 billion - 1 trillion, $120-250) and **ADVANCED** (100 trillion - 5 quadrillion, $400-900), 2 each. Each card shows the program, the job ("SUM 32 BILLION BYTES = 160 BILLION INSTRUCTIONS"), the pay, and **how long your CPU would take for the whole job** (instructions x CPI x clock period; CPI from your hardware playing the program perfectly). Jobs that would take **over 30 days are locked** ("YOUR CPU: 117 YEARS / NEEDS A FASTER CPU"). Finishing a contract pays its flat amount and a new random one takes its place. No other contract mechanics yet (as asked).
- **Shop** (`scenes/ShopScene.ts`): CPU parts in order (pipeline $300, forwarding $500, branch guessing $700, 1-bit $900, 2-bit $1,200; each is the next tier), **clock upgrades** (10 levels, $200 -> $5,660: 1 MHz -> 1 GHz single-cycle, 4 MHz -> 4 GHz pipelined; they shorten every contract's time, the song's tempo stays the same), cooling (heatsink $250: 140% no longer overheats; fan $600: even 150% is safe), and chip repair ($60 per 10% of wear). Each item explains what it does.
- **Your CPU is what you've bought:** the title's `T` tier switch is gone; taking a contract plays it on your tier. A part you haven't learned yet gets its briefing and practice first (briefing -> practice of that contract's program -> the contract); the first real pipelined song gets the overclocking briefing. All numbers are in `data/economy.ts`.
- **Saves** (`save.ts`, browser storage): money, parts, clock level, cooler, chip wear and the board. Title: money and CPU summary, `N` twice for a new game. Chip wear moved from settings into the save; repair moved from the title to the shop.
- **Results** show the contract: the whole job at this run's pace (e.g. 68 billion instructions -> 8.3 hours), the pay and the new total; `Enter` goes back to the board. CPU times use the rated clock from your upgrades (and ns / µs / ms as needed). Tier 1 plays any contract program and uses its upgraded clock too.
- Pure rules in `sim/progress.ts` (tiers, rated clock, CPI estimates, contract times, locking, board refills, buying) and plain-words numbers in `format.ts` ("2.4 BILLION", "317 YEARS", "4 GHz", "$1,240"). 8 new tests (58 total).
- Found while checking: "SUM A GRID OF 4.2 THOUSAND BYTES" overflowed its card (now "SUM A GRID:"); clock upgrade names showed "x1.953125" (now the target clock); tier 1's panel overflowed with SUM GRID's longer listing (tighter lines for long programs).
- Dev: `?money=5000` sets the money; `&contract=standard` plays the board's first contract in that section.
- Verified: title, new-game board (advanced locked at 117 / 6 years), shop after buying the pipeline and 5 clock levels (128 MHz), tier 1 and tier 3 contract results with pay, and board -> briefing -> practice of the contract's program.

### Overclocking, CPU temperature, chip wear, and fire (committed in e700c0d)
- **Clock dial in the song:** `H` raises the clock 10%, `G` lowers it, from **50% to 150%** of the rated clock (tiers 2-6; every song starts at 100%). One beat is one cycle, so the tempo follows from the next beat: overclocking speeds the song up, underclocking slows it down to give time to think, at the cost of more CPU time. Practice always runs at the rated clock. Replays reproduce the dial cycle by cycle.
- **Heat model** (`game/src/sim/thermal.ts`, all numbers in `THERMAL`): power = clock x voltage², with +4% voltage per +10% clock, so +50% clock = 2.2x power (the power wall). The chip warms toward 40°C + 30°C x power (70°C busy at rated, 89°C at 130%, 105°C at 150%) with a 25-cycle time constant; stall/bubble cycles use 70% power. Only 140% and up can overheat; at 150% it takes about 45 busy beats, with smoke and flames as warnings. At **95°C it throttles** to the rated clock (the song slows) until it cools to **80°C**. CPU time is summed cycle by cycle at whatever clock each ran.
- **Chip wear:** each overheat lowers the chip's maximum clock by 10% (150% -> 140% ...), never below rated. It's saved (`chipMaxDial`) until repaired: `X` on the title screen, free until the shop exists (then it will cost money). The title shows the chip's state; the gauge shows `MAX 140%`; the song says "OVERHEATED: THROTTLED! CHIP DAMAGED: MAX 140%". Real chips wear from heat and voltage too, much more slowly.
- **Gauge** top left: clock in MHz, RATED / OVERCLOCK / UNDERCLOCK / THROTTLED, `[G] - [H] +`, a thermometer with the 95°C mark, the temperature, and the worn maximum; clickable in replays (`CLOCK`, `HEAT` glossary entries).
- **Fire effects** (Phaser's built-in particles, no new library), building up with heat: a red glow behind the highway from 75°C, smoke and sparks from ~85°C, flames along the base and sides from 91°C and while throttled. Behind the notes, so they stay readable. Era colors: phosphor-green fire on the CRT eras, orange/red from 32-bit.
- **Conductor:** `setTempo()` changes tempo from the next beat on (beat times stay even; presses just before the change are judged at the old tempo). Music, replays and judging follow the chip's clock.
- **Results:** average clock, peak temperature, overheats and the new maximum; CPU time uses the run's real average period (e.g. 60 x 1.47 x 0.187 µs = 16.5 µs vs 23.8 µs at the rated clock).
- **Overclocking briefing** (4 cards, before the first real song on a pipelined tier, then straight into it): faster clock = faster beat (G / H, underclocking), the power wall, thermal throttling, heat wears the chip. Charts come from the game's own model. Briefings can now continue to a given scene (`then`).
- Design changes while building (playtest): the dial moved from the title screen into the song; heating made gentler so it's manageable (was 15-cycle time constant, +5% voltage per 10%); underclocking extended from 80% to 50%; overheating now damages the chip.
- 5 new tests (50 total): power grows faster than the clock, 70°C steady at rated, only 140%+ can overheat, a 150% overclock throttles after ~45 beats, recovers and still beats the rated clock's time, each overheat lowers the maximum 10% but never below rated.
- Verified on the real clock: tier 6 with H to 150% heats to 94°C with flames, overheats once (max 140%), results and replay match; the title then shows the damaged chip; tier 3 underclocked to 50% (2.0 MHz); all briefing cards.

### Tiers 5-6: hardware branch predictors (committed in 7cff617)
- **The predictor guesses, you follow or override it.** A predictor table (one entry per branch) is read at FETCH, so fetch follows its guess before the branch reaches DECODE. The branch note glows in the predictor's guess; pressing that key follows it, pressing the other overrides it. Feedback: PREDICTOR RIGHT / PREDICTOR MISSED / OVERRIDE! YOU BEAT THE PREDICTOR / BAD OVERRIDE.
- **Tier 5: 1-bit predictor** (remembers the last outcome). **Tier 6: 2-bit predictor** (a 0-3 counter; one surprise only weakens it; a weak state shows as a dimmer glow). Both start out guessing not taken.
- **New program SUM GRID:** adds a 4 x 3 grid with a loop inside a loop (60 instructions). Inner branch per row: taken, taken, not taken. 1-bit misses 10 of 16 branches (twice per row: the exit and the next row's first pass), 2-bit misses 7, always-not-taken 11; a player who overrides each row end misses none.
- **Listing:** each branch shows its predictor entry (`N T` or `N n t T`, current state lit); clickable in replays, with the branch's history.
- **Lessons 5 and 6** (5 cards each): the predictor table, a loop inside a loop (the grid and its two loops), where 1-bit misses (a trace computed by the same counter rules), follow or override, when to override; the 2-bit state machine, why it helps loops, sure vs. unsure glow, when to override, misses compared.
- **Playtest: lessons assume less.** Lesson 4 grew from 4 to 7 cards: what a branch does (reading `bne x1, x2, loop`), how a loop ends (x1 counting up to x2, pass by pass), and **how to guess**: usually taken; on the last pass x1 is one below x2 in REGISTERS, its +1 still on the way (`<-MEM`). Lessons 5-6 share a rules card for SUM GRID: x1 two or more below x2 -> col TAKEN; one below -> col NOT TAKEN; x2 below 12 -> row TAKEN; x2 = 12 -> row NOT TAKEN. Checked against the simulator at every branch decision of both programs.
- **Playtest: the hinted guess stands out.** In the guess tag over a waiting branch, the hinted key (the predictor's guess on tiers 5-6) is bold with a glow; the other key (an override) is dimmed to 30%.
- **Results:** guesses right, the predictor's own score, overrides right, and cycles saved vs. just following the predictor. The CPU-time rows now line up (tier 4's "ALWAYS NOT TAKEN" row was one column off too).
- Simulator: `PipelineOptions.predictor`, `predictorGuess()`, `predictorState()`, `guessFor()`, `predictorMisses` / `overrides` / `overridesRight`, `CycleResult.predicted`, `perfectRun()`; fetch and `upcoming()` follow the predictor; `perfectCycles(..., 'hardware')` (was `'not-taken'`). `PipelineRun` takes pipeline options. Tier/lesson options gained `predictor` and `program` (`TierOptions`). 3 new tests (45 total), including the 10 vs. 7 miss counts.
- Verified on the real clock: tier 5 and 6 rings, listing state, tier 6 results after a 4x replay (88 cycles, predictor 9/16, overrides 7/7, 7 cycles saved); all lesson 5-6 cards.

### Tier 4: branch hints (committed in 527c420)
- **A branch note glows in the color of what it did last time** (the information a 1-bit predictor keeps): a ring and soft halo around the note, plus a small badge on its corner (loop arrow = taken, down arrow = not taken) so the hint never relies on color alone. Before any history, a backward branch shows a dimmer "taken" hint (it's probably a loop). The ring updates if the branch is decided while the next round's note is already on screen, and goes away once the branch issues.
- **Keys match the colors:** `BRANCH J/K` under the lane and the guess tag over a waiting branch (`J: NOT  K: TAKEN`, now in keyboard order, the hinted guess brighter) use the same two colors. Monochrome eras (8/16-bit) tell them apart by brightness; 32/64-bit use colorblind-safe blue (taken) / orange (not taken). New `taken` / `notTaken` colors on each era.
- Following the hint misses once per loop, at the exit, which is exactly where a real 1-bit predictor misses; players who watch the loop counter can beat it.
- **History in the listing:** after a branch, its last 4 outcomes (`T` / `N`, colored), clickable in replays (`HISTORY` glossary entry). Clicking a branch note explains its glow.
- Simulator: `Pipeline.history` (each branch's outcomes by pc) and `Pipeline.hint(pc)`; 1 new test (42 total). Drawing in `game/src/visual/branchHint.ts`, shared by the game and lesson 4's "how it plays" card, which now shows the glow and J before K. Practice callout and README updated.
- Verified on the real clock in the green and color eras: ring, badge and tag over a waiting branch, listing history.

### Panel boxes and replay hover (committed in 527c420)
- **Titled boxes:** the side panel is split into PROGRAM, REGISTERS and MEMORY boxes, each a thin frame with its title set into the top edge (`game/src/visual/panelBox.ts`), on tier 1 and tiers 2-4. The REGISTERS title carries the `<-` key ("<- STILL COMPUTING"); the bus wires now end at the box edge. In replays the box titles are clickable.
- **Hover highlight in replays:** anything clickable gets a lit outline while the mouse is over it, so players can see what an explanation will be about before clicking.
- Verified: boxes on tiers 1 and 2 (screenshots); on the real clock, hovering register x3 in a tier 4 replay outlines that row.
- Playtest fixes: the PROGRAM box title overlapped the "TIER N" header (box moved down 6 px); long explanations (DECODE) ran past their box, which now grows to fit its text. Verified by clicking DECODE in a real-time tier 4 replay.

### Tier 4: branch prediction (committed in 527c420)
- Model (unchanged for tiers 2-3): branches are decided in DECODE while the next instruction is fetched in the same beat, so fetch follows a guess. Tiers 2-3 always guess not taken (taken branches flush 1). **Tier 4: the player guesses**: `K` routes a branch guessing TAKEN (fetch redirects to the target immediately, so the right next note appears), `J` guesses NOT TAKEN. Right guess: nothing lost. Wrong guess: the fetched instruction is flushed (1 cycle).
- Simulator: `Pipeline.predict()`, `branchOutcome()`, `branches` / `mispredicted` counters, `CycleResult.mispredicted`; `perfectCycles(..., 'perfect')`. Actions carry `guessTaken`; replays reproduce guesses. 4 new tests (41 total): right guesses cost nothing, wrong ones 1 cycle each, the program's answer never changes, SUM ARRAY 35 → 32 cycles with perfect guesses.
- Screen: `BRANCH J/K` lane, a "TAKEN? K  NOT? J" tag on a branch waiting on the line, "GOOD GUESS / WRONG GUESS" feedback, practice callouts for the first branch, first right and first wrong guess. Results: "BRANCH GUESSES: N OF M RIGHT" and a comparison with always guessing not taken ("GUESSING SAVED 3 CYCLES").
- Lesson 4 (4 cards): a fork in the road, guess right / guess wrong (timing chart with a flushed instruction), how it plays, your score. `PREDICTION` glossary entry; the BRANCH lane explanation mentions guessing on tier 4.
- Found while checking: lesson 4 rendered black because two diagrams passed `bne ..., loop` without defining `loop:`; fixed, and diagram code now falls back to plain text instead of crashing the briefing.
- Verified on the real clock: guess tag, "GOOD GUESS: TAKEN" with the loop's `lb` already fetched, results 32 cycles / 4 of 4 right after a 4x replay.

### Replays you learn from (committed in fd319cd)
- **Every tier 2/3 run is followed by its replay** ("RUN COMPLETE! NOW WATCH YOUR REPLAY"), and the results come at the end of it. `W` on the results watches again.
- **Speed and pause:** `←`/`→` or clickable `[<]` `[>]` for 0.5x / 1x / 2x / 4x; `Space` pauses. The replay runs on its own clock, so speed changes and pauses don't disturb it; the music restarts at the new tempo.
- **Click anything to learn what it is:** stage names, lanes (ALU / MEM / BRANCH), STALL, notes (the instruction in plain English and which stage it's in), each register (its job in this program, e.g. "x3: the running sum"), memory (what addresses 0-3 and 8 hold), the bus, the program listing, throughput and CPI. A click pauses and opens an explanation box; Space or another click resumes.
- Explanations live in `game/src/data/glossary.ts`; register jobs and the memory note in the program data (`roles`, `memoryNote`).
- Verified on the real clock: run → replay handover, speed change, explanations for DECODE and register x3.
- Size check: `game/` is 1.8 MB of the 35 MB limit (Phaser 1.2 MB).

### Tier 3: forwarding (committed in 2ba193e)
- **Tier 3** (`T` on the title cycles 1 → 2 → 3): the tier 2 pipeline with the forwarding unit on. ALU results reach the next instruction with no stall; a load used right away still stalls once (load-use); a branch needs a brand-new ALU value one beat early. Tier options (`forwarding`) travel from the tier list / lesson to the scene and survive retry and replay.
- **Forwarding on screen:** when an instruction issues with a forwarded value, the value (`x4=3`) jumps up a lit wire from the producer's note in EXECUTE or MEMORY into it.
- **Lesson 3** (4 cards): hand it over (ALU → ALU timing chart), loads still wait (load-use timing chart), how it plays, your score. Practice explains the first forward and the first load-use stall.
- **Results** compare three CPUs: your forwarding run, the best possible run without forwarding (`perfectCycles()`), and single-cycle; plus "FORWARDING SAVED N CYCLES". SUM ARRAY perfect: 35 cycles / 8.8 µs vs 43 / 10.8 µs vs 20.0 µs.
- Simulator: `Pipeline.forwardedFrom()` and `perfectCycles()`, 2 tests (37 total). Dev option `?forwarding`.
- Verified in real-time headless runs: one load-use stall, `x4=3` forwarded from MEMORY into `add`, results 35 cycles / CPI 1.75.
- **Accuracy fix (playtest):** the load-use callout said "lb is still reading memory" while `lb` was in EXECUTE, where it only computes the address; it reads memory in MEMORY. Explanations now depend on the producer's actual stage (`whyNotReady()`), for both the hazard callout and the wrong-move message. Callout box made taller to fit.

### Tier 2: results on notes, the bus, and replay (committed in af4dc6c)
- Playtest: hard to appreciate registers/memory while focused on notes. Tried five switchable views (standard, results on notes, flying values, breathers, replay). Kept results on notes and replay; turned flying values into a bus; dropped breathers and the view selector.
- **Results on notes:** in the WB row a note shows what it did (`x2 = 4`, `mem[8] = 17`, `BRANCH TAKEN`).
- **The bus:** each result travels right along a wire from its row, up a vertical bus, and into its register or memory cell, lighting the wire behind it. Register results leave from WB (written back), stores from MEM (memory is written in MEM). The panel only changes when the value arrives.
- **Replay:** every results screen offers `[W] WATCH REPLAY`: the recorded run at 2x speed. `PipelineRun.force()` replays decisions exactly (tested).
- **No timing on waiting notes:** once a note is waiting on the line (stalled), any press during its cycle counts; timing only applies on first arrival. A missed waiting note says "LATE: +1 CYCLE" instead of "OFF BEAT". Tested.
- Tier 2 panel shows the **program listing** (top right): a 6-line window that scrolls to follow the instruction in ID, marked with `>`, with each line tagged by the pipeline stage it's in (IF / ID / EX / MEM / WB); `^` / `v` when there's more above / below.
- **Plain stage names** down the left of the pipeline: FETCH / DECODE / EXECUTE / MEMORY / WRITE BACK, with IF / ID / EX / MEM / WB underneath (lanes shifted right to make room).
- **The song ends when the pipeline drains:** the last instruction finishes its WRITE BACK beat and slides out, and its value lands, before the results appear (cycle count unchanged).
- Tier 2 panel shows **memory** too. Transfers and fades run on the real clock. Verified in real-time headless runs. 2 new tests (35 total).

### Tier 2 rework after playtest (uncommitted)
- **The highway is the pipeline:** the hit line is ID, with EX / MEM / WB rows underneath. Routed notes slide down one row per beat in their own lane. When the note on the line needs a register still being computed, it pulses, is tagged "x4 NOT READY", and a **link** connects it to the instruction below that's computing it. Rule for the player: link = stall, no link = route. The top-right pipeline strip is gone; the panel keeps registers (`<-EX` / `<-MEM`), throughput, stats and feedback. Callouts and feedback reworded around the link.
- **Tutorial trimmed** from 8 cards to 5, two short lines each (pipelining, five stages, wait for your data, how it plays, your score). Unused diagrams removed; "how it plays" redrawn for the new layout.
- **Slow-frame fixes:** issued notes ease to their rows, and fades run on the real clock (not Phaser tweens), so slow frames can't leave notes stranded on screen. Verified in a real-time headless run.

### Tier 2: the pipeline, playable (committed in ce8bab5)
- **Run logic** (`game/src/rhythm/pipelineRun.ts`): each beat is a cycle; the player's choice for the instruction in ID (route D/F/J or stall Space) is judged in a timing window, then the pipeline advances. Outcomes: issued, stalled (correct), wasted stall, violation (routed into a hazard: flushed), wrong unit / off-beat / missed (treated as stalls). Streak counts correct decisions; throughput = instructions completed per cycle over the last 8 cycles. 6 tests, including perfect play on SUM ARRAY = 43 cycles with a 36-decision streak.
- **Pipeline screen** (`game/src/scenes/PipelineScene.ts`): live IF/ID/EX/MEM/WB strip (the instruction blocked by a hazard and the stage still computing its value are outlined), registers marked `<- EX` / `<- MEM` while their new value is still in flight, STALL [SPACE] under the lanes, throughput bar, struck-out notes on flush, feedback that explains each outcome (e.g. "DATA HAZARD! add READ x1 = 0 BUT addi IS STILL COMPUTING 5"). Clock 4 MHz (≈82 BPM). Results compare pipelined vs single-cycle CPU time (SUM ARRAY perfect: 10.8 µs vs 20.0 µs, 1.9× faster with CPI 2.15).
- **Music layers** (`game/src/audio/music.ts`): bass, hi-hat, drums, arpeggio, melody, one per filled stage (Am–F–C–G). The conductor gained an `onBeat` hook so music is scheduled on the beat clock.
- **Tier 2 lesson** (8 cards): one at a time is slow (laundry), five stages, a faster clock, data hazards, stalling, how it plays, listen to the pipeline, your score. Textbook-style timing charts drawn in `visual/diagrams.ts`.
- **Practice** for tier 2: notes wait; first-time callouts for "no hazard: route it", "hazard: press SPACE", and taken-branch flushes; wrong choices explain instead of costing cycles.
- **Tiers** (`game/src/data/tiers.ts`): `T` on the title switches tier 1 / 2; Enter, B and P follow the chosen tier. Saved in settings.
- Simulator additions: `Pipeline.upcoming()` (next fetches with their future seq numbers, for drawing notes) and `stageOf()`; 1 new test (33 total).
- Dev URL options: `?scene=pipeline`, `?practice`, `?lesson=tier2`.

### Fixed while building tier 2
- **Slow frames could misassign presses:** a key press could arrive before the frame closed the previous cycle and be applied to the wrong cycle. Presses now close every cycle that ended before their timestamp first. Autoplay and practice also step one cycle at a time (found via headless runs where autoplay stalled 57 times and practice didn't wait).

### Esc didn't quit (committed in 97c44ad)
- Cause: Vimium swallows Escape while a text field has focus (to leave insert mode), and the game keeps focus on a hidden field so Vimium doesn't steal D/F/J. The game's own Escape handling works (verified headlessly).
- Fix: `Q` also quits / goes back (play, practice, results, briefing); the "[Q] QUIT" label is clickable. On-screen labels and README updated. Verified headlessly: `q` returns to the title.
- `.gitignore`: added `.claude/settings.local.json` (personal Claude Code permission rules).

### Tier 2 pipeline simulator (committed in 467e366)
- `game/src/sim/pipeline.ts`: the textbook 5-stage in-order pipeline (IF, ID, EX, MEM, WB), stepped one cycle per beat by the player's choice at ID (`issue` or `stall`). Register file written in the first half of WB, read in the second half of ID.
- Hazard detection (`hazard()`, `stallsNeeded()`): no forwarding 2 / 1 / 0 stalls for a dependency 1 / 2 / 3+ back; with forwarding ALU→ALU 0, load-use 1; branches (resolved in ID) need operands a stage earlier (ALU 1, load 2 / 1).
- Taken branches flush the instruction fetched behind them (fetch assumes not-taken). Issuing into a hazard reports the stale vs correct value, flushes, and refetches; the program still ends correct. Unnecessary stalls are reported as wasted cycles.
- Reports CPI (including fill cycles), occupancy (for music layers), flushed slots (for struck-out notes). `sourceRegs()` / `destReg()` added to `isa.ts`.
- `tests/pipeline.test.ts` (8 tests, 26 total): stall table, fill cost (N + 4), each dependency distance, forwarding, branch flush, hazard violation, wasted stall, and SUM ARRAY hand counts: **43 cycles / CPI 2.15 without forwarding, 35 / CPI 1.75 with** (20 instructions + 4 fill + 3 flushes + 16 or 8 stalls).

### Tempo curve (committed in a815cde)
- `game/src/rhythm/tempo.ts`: `tempoForClock(mhz, relaxed)`; tier 1 now derives its tempo from its 1 MHz clock (75 BPM, 60 relaxed/practice; was 80 / 64). New test (18 total).

### Tutorials: briefing → practice → play (committed in 089dda9)
- **Briefing scene** (`game/src/scenes/BriefingScene.ts`): paged concept cards, ←/→/Enter/Esc, page counter. Lesson content is data (`game/src/data/lessons.ts`); diagrams are drawn in the current era's style (`game/src/visual/diagrams.ts`).
- **Tier 1 lesson** (6 cards): a CPU follows instructions, the clock, three kinds of work (functional units), registers and memory, how it plays, your score (CPI and CPU time).
- **Practice mode** (`PlayScene` with `{ practice: true }`): the chart holds each note on the hit line until it's played (the clock keeps ticking); the first time each instruction appears, a callout explains it in plain words (`describe()` in `isa.ts`, tested); a wrong key explains instead of stalling. Ends with "now play for real".
- **Title flow:** first Enter goes to the briefing, then practice, then play; `B` replays the briefing, `P` practice. Seen lessons are saved in settings.
- **Keyboard bug found and fixed:** briefing pages sometimes skipped. Logging showed one Enter calling `next()` four times in a single frame. Cause: Phaser re-runs its whole per-frame key queue on every new key event. Every scene now uses `input/keys.ts` (browser events, keys by physical position); Phaser's keyboard plugin is off. Verified: the failing case passed 3/3 reruns.
- Verified with screenshots: all 6 cards; practice callout; wrong key in practice (real-time run) shows "NOT QUITE…" and costs no cycle.

### Second playtest changes (uncommitted)
- **Syntax highlighting** for notes and the program listing: `tokens()` in `isa.ts` splits instructions into opcode / register / number / label / punctuation (`format()` now joins tokens; new test). `game/src/visual/codeLine.ts` draws one text object per token with shrink-to-fit. Each era has a syntax palette: brightness levels of the phosphor at 8/16-bit (bold opcodes brightest), muted color at 32-bit, editor-style color at 64-bit.
- **Notes fit their boxes:** lanes widened 144 → 150 px, and long instructions shrink to fit (`bne x1,x2,loop` overflowed before).
- **Slower tier 1:** 80 BPM (relaxed 64), down from 100 (80).
- Checked 8-bit and 64-bit eras with screenshots; first 8-bit palette washed out to gray under bloom and was darkened/resaturated.

### Fixed after first tier 1 playtest (uncommitted)
- **Resolution doubled** to 960×540 (all layout and fonts scaled ×2); 8 px text at 480×270 was hard to read.
- **Lane keys rewritten:** Phaser queues key events and handles them on the next frame, so presses were judged at frame time, not press time, which could turn a hit into a miss. Play now listens on `window` directly, matches keys by physical key (`event.code`) with a lowercase fallback (Caps Lock, Shift and case don't matter), and judges each press at the event's own timestamp (`Conductor.beatAt()`). Verified with a harness sending Shift+uppercase F: routed to MEM correctly.
- **Works with keyboard extensions:** F "not working" was Vimium, which swallows single-letter keys (f, j, d, and r = reload). `game/src/input/keyFocus.ts` keeps focus on an invisible text field, where Vimium/Surfingkeys/Tridactyl pass keys through; events bubble to `window` as before. Verified headlessly that keys sent to the focused field reach the game (Vimium itself not tested here).
- Note slide-back after a stall and lane flash fades now use real elapsed time instead of Phaser's capped frame delta (they lagged at low frame rates).
- Investigated a lane flash that looked stuck in headless screenshots: caused by Chrome's `--virtual-time-budget` freezing `performance.now()`, not by the game. A real-time headless run (page held open 22 s) showed it fading correctly.

### Added: tier 1 gameplay (uncommitted)
- **Simulation** (`game/src/sim/`): RISC-V style instruction types (`add sub and or xor addi lb sb beq bne`), a two-pass assembler with labels, comments, and line-numbered errors, and an 8-bit single-cycle CPU (x0 hardwired to zero, wraparound at word size, `lb` sign-extends like RISC-V, 256 bytes of memory). `trace()` runs a copy of the CPU to list every instruction that will execute.
- **Rhythm logic** (`game/src/rhythm/`): Perfect / Good / Miss windows (normal ±45 / ±100 ms, relaxed ±80 / ±180 ms) and `SingleCycleRun`: a correct press executes the next instruction; a miss or wrong unit stalls one cycle and pushes later notes back a beat. Tracks instructions, cycles, CPI.
- **Play scene**: 3 lanes with scrolling instruction notes, program listing with a PC marker, registers (hex + decimal) and memory that highlight on change, live CPI, feedback that explains misses (`WRONG UNIT: lb RUNS ON MEM`), and a results screen working through CPU time = instructions × CPI × period.
- **First program** (`game/src/data/programs.ts`): SUM ARRAY, 20 executed instructions, stores 3+5+7+2 = 17 at address 8.
- **Title screen**: Enter / click to play, C calibrate (metronome + ←/→ offset), R relaxed mode, 1–4 era. Settings persist in `localStorage` (`game/src/settings.ts`).
- `game/src/audio/sfx.ts`: shared tone generator (hit blips pitched per unit, a buzz on misses; the metronome uses it too).
- Dev URL options: `?scene=play`, `?autoplay`, `?era=N` (documented in `README.md` with the controls).
- 12 new tests (`tests/sim.test.ts`, `tests/rhythm.test.ts`): 15 total, all passing.

### Changed
- Screen curvature reduced (8-bit 0.04 → 0.02, 16-bit 0.02 → 0.01): at 480×270 it made straight lines look jagged.

### Verified
- Autoplay in headless Chrome: 20/20 PERFECT, CPI 1.00, register values correct mid-run, results screen correct.
- First autoplay attempt missed every note: headless software rendering draws only a few frames per second, so the frame-based "press" was already late. Autoplay now presses at the exact due beat. Real key presses are judged when the key event fires, so players aren't affected.
- Not yet verified in a real browser: feel of the timing windows, lane flash fade (looked stuck in headless, probably due to the low frame rate), sound mix.

### Fixed (after first browser test)
- Beat LED looked out of sync after the first downbeat: beats 2–4 switched to dark green at full opacity, about as bright as the faded state, so they had no visible flash. Now a bright light flashes on every beat, and the downbeat also pulses larger.
- Visual beat timing now uses `AudioContext.getOutputTimestamp()` (which sample is reaching the speakers right now), with the old `outputLatency` method as a fallback.
- Added a manual calibration offset (Left/Right arrows, 5 ms steps) and an on-screen readout of the reported output latency and offset.

### Added: terminal look with eras (uncommitted)
- `game/src/visual/terminal.ts`: four "eras" (8/16/32/64-bit) that modernize the screen as the CPU upgrades: green phosphor with scanlines, curvature, vignette and flicker → softer green → white phosphor, nearly flat → flat modern terminal with no effects. Uses Phaser's built-in camera FX (bloom, barrel, vignette) plus a scanline overlay. Effect strengths live in one table for easy tuning.
- Title scene uses the era colors, has a blinking block cursor, and previews eras with keys 1–4 (or `?era=1..4` in the URL) until CPU upgrades exist to drive it.
- Verified with headless screenshots of all four eras. First pass was too dark (scanlines + vignette nearly halved brightness) and the prompt didn't appear until the first cursor blink; both fixed.

### Design notes
- The user likes the **old terminal** look: green phosphor CRT style, modernizing toward a white, flat modern terminal as the CPU is upgraded. Keep it small and subtle.

### Added (project scaffold)
- Git: initialized this directory, remote `origin` = `git@github.com:stradoc/Bit_Cycler.git`, local `main` tracks `origin/main` (which held only `LICENSE`, MIT). **Nothing committed yet.**
- `.gitignore` (`node_modules/`, `.tmp/`), `.npmrc` (npm cache kept in `.tmp/npm-cache` so nothing is written outside the project; update notifier off).
- `package.json` + `package-lock.json`: pinned dev dependencies; scripts `build`, `watch`, `check`, `test`, `serve`; `postinstall` copies `phaser.min.js` into `game/lib/`.
- `tsconfig.json` (compiles `game/src` → `game/js`, strict, `erasableSyntaxOnly`, `.ts` import rewriting, source maps) and `tests/tsconfig.json` (type-checks tests, no output).
- `game/index.html`, `game/src/main.ts`: Phaser 3.90 at 480×270, pixel-art mode, scaled to fit.
- `game/src/audio/timing.ts`: pure beat math. `game/src/audio/conductor.ts`: lookahead beat scheduler on the Web Audio clock with a metronome click.
- `game/src/scenes/TitleScene.ts`: placeholder title with WebGL glow; click/key starts a 120 BPM clock and an LED flashes on each beat (brighter on the downbeat).
- `tests/timing.test.ts`: 3 tests for the beat math.
- `README.md` (team setup and workflow), `game/README.md` (player README skeleton).

### Verified
- `npm run build`, `npm run check`, `npm test` (3/3 pass) all succeed.
- Served locally: every file returns 200. Headless Chrome screenshot shows the title rendering in WebGL with the glow effect and no console errors. The beat LED and audio need a real browser with a click to confirm.

### Notes
- A test initially failed because 60/150 isn't exact in binary floating point. Lesson for later: timing comparisons always use tolerances or judgment windows, never `===`.

### Next
- Playtest tier 1 in a real browser: timing feel, lane flashes, readability.
- Make a full-length (~60 s) song: longer or multiple programs.
- Then Phase 2: the 5-stage pipeline and data hazards (tier 2).
