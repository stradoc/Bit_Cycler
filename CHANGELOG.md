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
| 2026-10-28 | Art direction: 8/16-bit pixel art, ~480×270 internal resolution, electronics effects, **old-terminal / green-phosphor CRT look** | Fits the hardware theme; visuals can evolve with CPU tier (presented as era styling, not a technical claim) |

| 2026-10-28 | Build: **plain `tsc`, no bundler**; commit both `src/` and compiled `js/` | Smallest possible build step; output mirrors source and runs as-is on GitHub Pages. Tests run on `.ts` directly via Node type stripping (`erasableSyntaxOnly`) |
| 2026-10-28 | Package manager: **npm** (dev tools only: `typescript`, `phaser@3.90.0`, `@types/node`) | Already installed with Node; `node_modules/` never ships |
| 2026-10-28 | Dev server: **`python3 -m http.server`** | Already installed; teammates may use any static server |

| 2026-10-28 | Git: **separate team repo** (this directory); the whole team works in one `game/` folder, copied to `games/bit-cycler/` in the course repo fork at submission | Small repo with only our work; planning files stay out of the shipped folder |
| 2026-10-28 | Title: **Bit Cycler**, folder `bit-cycler` | Team choice |

| 2026-10-28 | ISA: **RISC-V inspired**, adapted for 8/16/32/64-bit CPU tiers | Matches modern textbook notation; real RV32I/RV64I at 32/64-bit, simplified teaching CPUs at 8/16-bit (README must say so) |
| 2026-10-28 | CPU word size progresses 8 → 16 → 32 → 64-bit; art style is separate (pixel art throughout) | Word size is a real gameplay mechanic (multi-chunk arithmetic) |

| 2026-10-28 | TypeScript **7.0.2** (native Go compiler); exact versions pinned: `phaser@3.90.0`, `@types/node@22.20.5` | Current release line, much faster; we use only the plain compiler, so its plugin/API gaps don't affect us. Fallback is 6.0.3 with no code changes |

All Step 0 decisions are made.

---

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

### Fixed (after first browser test, uncommitted)
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
- You: run `npm run serve`, open http://localhost:8000, click, and confirm the click track and LED stay in sync.
- Phase 1: input judgment windows, note highway, tier 1 single-cycle CPU, register panel.
