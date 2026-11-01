# CLAUDE.md

**Bit Cycler**: CSC 3501 (Computer Organization) team project. A browser tycoon + rhythm game where each beat is one CPU clock cycle: the player is the CPU's control unit, routing each instruction to its unit on the beat, stalling for hazards and guessing branches, and earns money from contracts to buy the hardware that does those jobs for them. Due by pull request on Nov 30, 2026.

Stack: Phaser 3.90, TypeScript compiled with plain `tsc` (no bundler), raw Web Audio API, `node:test`, npm for dev tools only. The game ships from `game/` (copied to `games/bit-cycler/` in the course repo at submission).

Instruction set: RISC-V inspired. The CPU chip's word size grows 8 → 16 → 32 → 64-bit as shop upgrades, in the order features reached real microprocessors, and it sets the era (green CRT, DOS, 90s desktop, modern terminal). An era is the look of its period's computers, not a claim that word size changes the screen. Wider words inside the CPU model and the song aren't built yet (phases 2 and 3 in `ROADMAP.md`).

## Start of every session
1. Read `RULES.md`. It is binding. In brief: never touch files outside this directory (temporary files go in `.tmp/`, emptied when done); never commit or push without approval, after showing every changed file and a summary; never adopt a technology without explaining the benefits and drawbacks, recommending, and waiting; log decisions in `CHANGELOG.md` and update it and `ROADMAP.md` at the end of each session.
2. Read the latest entry and the Decisions table in `CHANGELOG.md`.
3. Read `ROADMAP.md` for what's next.

## Commands
```sh
npm run build          # compile game/src into game/js (commit both)
npm run check          # type-check the tests
npm test               # node:test on the TypeScript source
npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p .   # stricter check, keep it clean
npm run export-sounds  # every sound as a WAV in sound-export/ (needs Chrome)
```
Dev URL parameters and console cheats are listed in `README.md`.

## How the code is organized (`game/src/`)
| Folder | What's in it |
| --- | --- |
| `main.ts` | Starts Phaser with the scene list; reads `?era=` and `?scene=` |
| `scenes/` | One scene per screen: boot, title (the main menu), settings, saves, dev, board, shop, briefing, pipeline (the song). Every one extends `ui/screen.ts` |
| `ui/` | The screen kit: `eras.ts` (everything about each era), `theme.ts` (sizes, positions, color roles), `widgets.ts` (text, panels, `Box`, `PressButton`, `glideIn`), `list.ts` (`ListMenu`), `screen.ts` (`Screen`), `guide.ts` (`Guide`: the robot who teaches, its speech bubble and voice, and the spotlight that dims all but what it points at) |
| `visual/` | Rendering underneath the kit: `display.ts` (canvas size, fonts, the CRT overlay), `terminal.ts` (`TerminalLook`: window or DOS bars, glow, LCD grid), `chip3d.ts` (the shop's 3D chip), `heat.ts` (fire), `diagrams.ts` (lesson pictures), `codeLine.ts`, `branchHint.ts`, `asciiChart.ts` |
| `audio/` | `sound.ts` (what screens import), `cues.ts` (every short sound by name), `hum.ts`, `machine.ts` (power, chime), `samples.ts` (recordings), `synth.ts` (building blocks), `mix.ts` (buses and `LEVELS`), `output.ts` (volume), `music.ts` (the song's music), `conductor.ts` (the beat clock), `render.ts` + `wav.ts` (the export) |
| `song/` | The song screen's parts: `highway.ts` (lanes, notes, rows, hazard links), `panel.ts` (listing, registers, memory, cache, stats, feedback), `bus.ts`, `gauge.ts`, `replay.ts` (replay controls, click-to-learn), `results.ts`, `words.ts` (everything the screen says), `setup.ts` (how a song is set up: program, hardware, practice or replay; what retries and replays pass on), `layout.ts` (positions, shared types), `view.ts` (what the parts share) |
| `sim/` | The hardware model, pure: `isa.ts`, `assembler.ts`, `cpu.ts`, `pipeline.ts` (5 stages, hazards, forwarding, branch prediction), `memory.ts` (RAM timing, the L1 cache), `thermal.ts` (clock, heat, wear); `progress.ts` (the campaign's rules: tiers, contracts, shop, buying); `generator.ts` (contract programs); `jobSheet.ts` (what's in a contract: its loop, notes per lane, memory used) |
| `rhythm/` | `judge.ts` (timing windows), `pipelineRun.ts` (turns beats and key presses into cycles and outcomes), `tempo.ts` |
| `data/` | `tiers.ts`, `lessons.ts` (briefings and their pictures' ids), `tours.ts` (what the guide says on each screen), `glossary.ts` (click-to-learn), `programs.ts`, `economy.ts` (every price and balance number), `boot.ts` (the intro's script), `menuFiles.ts` (the menu's disk: names, README.TXT, CREDITS.TXT) |
| top level | `save.ts` (slots), `saveFile.ts` (the save format), `settings.ts`, `flow.ts` (board → briefing → practice → song), `cheats.ts`, `format.ts`, `files.ts`, `input/` (`keys.ts`, `keyFocus.ts`) |

**Layers.** `sim/`, `rhythm/`, `data/`, `format.ts`, `saveFile.ts`, `song/setup.ts`, `song/words.ts` and `song/results.ts` never use Phaser or the browser at runtime, so `tests/` runs them in Node. Put rules and numbers there and test them; drawing and sound go in `scenes/`, `ui/`, `visual/`, `audio/` and the other `song/` parts.

**One place per thing.** An era is described only in `ui/eras.ts`; code asks `era.kind`, `era.screen.*`, `era.computer.*`, `era.sound.*`, never "is this era 2". Sizes and positions come from `ui/theme.ts`. Sounds are played only by name (`this.cue('move')`). Prices and balance numbers live only in `data/economy.ts`. The CPU is put into words only by `cpuName` / `cpuLine` (word size: `bitsName`), and a chip is found by its width only with `chipByBits` (`sim/progress.ts`). A screen that must be redrawn when the era changes (a new chip, another save) asks `eraChanged()` (`ui/screen.ts`). Text the song screen shows lives only in `song/words.ts`. What the guide says lives in `data/tours.ts` (tours) and `song/words.ts` (practice's tips); only `ui/guide.ts` draws it.

## Adding things

**A screen.**
1. Make `scenes/NameScene.ts` extending `Screen` (`super('name')`). In `create()`, call `this.setUp()` first (options: `hum: false` for screens with their own music, `glow: 'menu'` for dark screens, `windowed: false` before the program "starts").
2. Build it from the kit: `this.header(title, subtitle)`, `this.corner(money)`, `this.aboutLine()`, `this.messageLine()`, `this.hints('[ENTER] ...', '[Q] BACK')`, `this.text()` / `this.textAt()`, `new ListMenu(this, this.era, {...})`, `new Box(...)`, `panel(...)`, `PressButton.create(...)`.
3. Handle keys in `protected onKey(key)`: return `true` when handled (`M` toggles the hum otherwise). Use `this.cue(...)` for sounds and `this.back(scene, data)` to leave.
4. Register it in `main.ts`'s scene list, and give it its window title, terminal path and DOS menu item in `TITLES`, `PATHS` and `DOS_ITEM` (`visual/terminal.ts`).
5. Reach it from somewhere: the main menu's disk (`TitleScene.rootEntries`, named the era's way by `data/menuFiles.ts`), the board, or `flow.ts`.
6. Screenshot it in all four eras.

**A sound.**
- A short sound: add a recipe to `CUES` in `audio/cues.ts`, built from `audio/synth.ts` (`tone`, `flat`, `buzz`, `noiseBurst`, `blip`), into a bus: `bus(ctx, 'ui')` for the interface, `'song'` for the song. If it needs more than a time and a volume, declare its options in `Extras`. Add its folder in `CUE_FOLDER` (`audio/render.ts`; the compiler insists). Play it with `this.cue(name)`, or `cueOn(ctx, ...)` without a scene.
- Loudness: `LEVELS` in `audio/mix.ts`. A new kind of sound gets a new bus there rather than a hard-coded gain.
- A longer sound: follow `audio/machine.ts`: build it at a time on any context (`powerOnAt(ctx, era, t)`), with a small wrapper that plays it now in a scene. That's what lets `audio/render.ts` export it.
- A recording: add it to `assets/sounds/`, load it like `audio/samples.ts`, credit it in `assets/sounds/CREDITS.txt` and CREDITS.TXT (`data/menuFiles.ts`). A recording needs the user's approval first (rule 3).
- Then run `npm run export-sounds` and check its length, peak and pitch. Nobody can hear headless audio: tell the user what still needs a listen.

**An era, or a change to one.** Everything is one entry in `ERAS` (`ui/eras.ts`): the chip whose era it is (`bits`; the active save's chip picks the era, `?era=N` previews another for the session), colors, font, `kind` (how widgets draw: `terminal`, `dos`, `desktop`, `modern`), `screen` (resolution, smoothness, glow, CRT overlay, LCD grid, window or DOS bars), `computer` (CRT or LCD, drive, BIOS, file names, splash colors), `sound`, the chip's style, an optional `dark` variant. A new font is loaded in `loadFonts` (`visual/display.ts`) and credited. A new `kind` needs a case wherever `kind` is switched on (`ui/widgets.ts`, `ui/list.ts`, `song/highway.ts`); a new frame style needs `FRAMES` (`visual/display.ts`) and `drawChrome` (`visual/terminal.ts`). The boot and file-name tests run over every era.

**A gameplay feature in the song** (a new hazard, a key, a kind of note):
1. Model it in `sim/` (usually `pipeline.ts`, switched on by a `PipelineOptions` flag), with tests that match hand-worked cycle counts. Check the numbers against Patterson & Hennessy, and label anything approximate. The song gets the flag from `song/setup.ts`: add it to `SongStart` and `SongSetup`, work it out in `songSetup` (from the tier, the save, or a URL shortcut) and hand it to the simulator in `pipelineOptions`; retries and replays carry it on by themselves. Test it in `tests/songSetup.test.ts`.
2. Judge it in `rhythm/pipelineRun.ts` (a new `Action` or `Outcome`, what `CycleReport` tells the screen), with tests.
3. Show it: drawing in the `song/` part it belongs to, its feedback, practice tip (`Tip`, shown once and said by the guide, with the part of the screen it points at) and click-to-learn entry in `song/words.ts` (shared definitions in `data/glossary.ts`), its lines in `song/results.ts`, and the wiring in `PipelineScene` (`handleKey`, `showDecision`, `onCycle`). Sound through a cue.
4. Keep the design rules: no quizzes, a mistake costs cycles and never ends the song, practice explains instead of punishing, relaxed mode still works, and replays reproduce it (record what the player did in `recording` or `dialRecording`, which the replay gets as a `Recording` from `song/setup.ts`).

**A CPU tier or shop part.** A chip (a word size) goes in `CHIPS` (`data/economy.ts`: the tier it follows, its top clock step); a CPU part says which chip it needs (`bits`), and the shop lists chips and parts in that order. The tier goes in `data/tiers.ts` (its `TierOptions` reach the song through `songSetup` in `song/setup.ts`, which also reads the parts that change the song, like the L1, from the save). The part's price goes in `data/economy.ts`, and it goes on sale in `shopItems` / `buy` (`sim/progress.ts`, tested in `tests/progress.test.ts`). Its lesson goes in `data/lessons.ts` (pictures in `visual/diagrams.ts`) and, better, as a tour of the song screen in `SONG_TOURS` (`data/tours.ts`), played straight after buying via `briefAfterPurchase` (`flow.ts`): the guide's tour, then practice, then play (a lesson with no tour yet shows its briefing cards instead). Draw it on the shop's chip (`buildChip` in `visual/chip3d.ts`), report it in the boot (`hardware` in `data/boot.ts`), and add it to the developer screen (`scenes/DevScene.ts`) and the cheats (`cheats.ts`).

**A contract or program kind.** Add the kind to `sim/generator.ts` (its source, register roles, key registers, memory note, clients and job wording). The tests run thousands of seeds checking answers, memory bounds and key registers. Contract sizes, deadlines and pay are in `data/economy.ts`.

**Campaign mode** (planned: a debt to pay off by a far deadline, with the endless board as free play after). Not started; settle the open questions in `ROADMAP.md` with the user first (what missing the deadline does, installments, how fast time passes). The pieces fit like this:
- State: new fields in `Progress` (`sim/progress.ts`) with their new-game values in `NEW_GAME`. Old saves get those values and range-checks in `cleanProgress` (`saveFile.ts`); test both in `tests/save.test.ts`.
- Time: game time passes when a contract finishes, by the whole job's time at the pace actually played (`jobSeconds` in `song/results.ts`; `contractSeconds` in `sim/progress.ts` is the board's estimate). Apply it in `completeContract`, as a pure, tested function.
- Showing it: the board's header and corner (`BoardScene`), the results' lines (`song/results.ts`), the boot's report (`data/boot.ts`), and the save slots (`SavesScene`).
- The end: a new screen (see above), started from `flow.ts` or the board when the debt is paid or the deadline passes. NEWGAME.EXE (`TitleScene`) starts a campaign; free play needs its own entry.
- Numbers go in `data/economy.ts`; add developer-screen rows and cheats to jump to any point.

**A tour, a briefing, or a click-to-learn entry.**
- A tour is the guide (TICK, a robot drawn in characters) walking the player through a real screen, step by step: each step says one short sentence-case line and points at a part of the screen (the rest dims) or holds up a picture (a `DiagramId`). The steps go in `data/tours.ts`, with the names of the parts they may point at as a type (`BoardTarget`, `SongTarget`); the screen says where those parts are (`where(target)` in `BoardScene` and `PipelineScene`), makes a `Guide` (`ui/guide.ts`), calls `guide.tour(steps, where, done)`, sends it Enter (`guide.next()`) while `guide.touring`, and calls `guide.update(now)` every frame. A tour plays once: its id goes in `Progress.seenLessons` when it ends, and in `TAUGHT_IDS` so the cheats can mark it seen. A song tour is keyed by its lesson's id and plays before that lesson's practice (`SongStart.tour`).
- Write for a player who has never heard of a CPU: define each new word the first time it appears (in capitals), with an everyday comparison.
- A briefing's pages (for lessons not yet turned into tours) go in `data/lessons.ts`: a picture, at most three short lines (about 60 characters), and an analogy.
- Definitions go in `data/glossary.ts`. What a thing on the song screen is goes in `song/words.ts`.

**A setting.** Add it to `Settings` and its default in `settings.ts`, and a row in `SettingsScene`.

## Conventions
- **TypeScript:** only syntax Node can erase (`erasableSyntaxOnly`): no `enum` (use `as const` objects), no `namespace`, no constructor parameter properties (declare the field, assign it in the constructor). Import local files with `.ts`. Type-only imports use `import type`.
- **Comments** say what something is for and why, in plain full sentences, like the code around them; every module opens with a short comment on what it's for. Doc comments on exports.
- **On-screen text:** labels, menus and feedback in capitals; lesson lines and callouts in sentence case; the era's way of naming files comes from `data/menuFiles.ts`. Layout uses 960 x 540 coordinates in every era.
- **Writing (docs and in-game):** plain words, short sentences, no jargon a first-year student wouldn't know without defining it. Companies, products and people in the game are made up; take ideas from other games, never their assets, names or text.
- **Accuracy:** figures follow the textbook; stylized ones (the tempo curve, wear, the overheat limits) are labeled so in lessons and the README.
- **Commits:** build first, so `game/js/` matches `game/src/`. Delete a removed module's compiled `.js` and `.js.map` too (`tsc` doesn't).

## Verifying a change
- Build, both type checks, and the tests, every time.
- Look at it. Headless Chrome works: write throwaway scripts in `.tmp/`; serve `game/` (a few lines of `node:http`); start Chrome with `--headless=new --remote-debugging-port=0 --user-data-dir=.tmp/<name> --disable-breakpad --window-size=1280,720` (read the port from `DevToolsActivePort` in the profile); drive it over the DevTools protocol (`Page.navigate`, `Input.dispatchKeyEvent`, `Page.captureScreenshot`). Set `localStorage` first (`bit-cycler-settings` with `bootSeen: true`, `music: false`; a `bit-cycler-save-1` fixture, whose `wordBits` picks the era), then open `?scene=...` (`&era=N` shows another era) (`&autoplay` plays songs by itself). Shut Chrome with `Browser.close` and wait for it to exit before deleting its profile. Without `--disable-breakpad`, Chrome's crash reporter writes in `~/.config/google-chrome`, outside this directory; even with it, Chrome rewrote `~/.config/google-chrome/Crash Reports/settings.dat` on start (2026-10-31). Not yet tried: pointing Chrome's config at `.tmp/` (`XDG_CONFIG_HOME` or `CHROME_CONFIG_HOME`); check that file's date after a run.
- Compare against the last commit: `git archive HEAD game | tar -x -C .tmp/base` gives the old build to run side by side.
- Headless timing: Phaser's timers and tweens advance per frame and headless Chrome draws few frames, so the boot runs about 5x slow; songs follow the audio clock and run in real time. Never use `--virtual-time-budget` (it freezes `performance.now()`).
- Say what you couldn't check: feel, sound, real-browser behavior.
- `pkill -f` and `pgrep -f` match your own command line too: a pattern that appears in your command kills the shell running it.

## Gotchas already paid for
- **Keys:** Phaser's keyboard plugin re-runs its key queue on every new event (one Enter fired four times), so it's off; all input goes through `input/keys.ts`, judged at the event's own timestamp (`Conductor.beatAt`). Vimium swallows Escape and single letters, so `input/keyFocus.ts` keeps focus on a hidden field, and `Q` works wherever `Esc` does.
- **Scene data:** Phaser restarts a scene with its last data when given none. `Screen.setUp` clears it, so a restart must pass its data again.
- **Slow frames:** a looping timer can fire several times in one frame (the boot ran twice), so one-shot endings need a guard. Things that must not lag (notes, fades, values on the bus) move on `performance.now()`, not tweens.
- **Audio in the background:** Phaser suspends the audio clock while the window is hidden, but timers keep going; sounds scheduled then all play at once on return. Cues and the hum's drive skip while `live()` is false.
- **Glow:** Phaser's bloom averages the picture with its blur (halving the letters), so `addGlow` runs it at half strength and doubles the result. The CRT overlay blends as soft light so bright text keeps its brightness.
- **Tweening a rectangle's height** doesn't re-anchor it; scale instead.
- **Floating-point beat times:** compare with tolerances or windows, never `===`.
- **JetBrains Mono's ligatures** draw `<-` and `->` as arrows (on purpose in the 64-bit era).

## Where the docs go
`RULES.md`: binding rules. `CLAUDE.md` (this file): how the code works and how to extend it. `README.md`: team setup, commands, dev shortcuts and cheats. `game/README.md`: for players (ships with the game). `ROADMAP.md`: open work. `CHANGELOG.md`: the Decisions table and a short entry per work session (what changed and why, what was verified and what wasn't). Say a thing in one of them and link from the others.

## References
- Design doc: https://claude.ai/artifact/8VttdcZGpm8e6upLo3wgzy (describes an older plan: check the code and the Decisions table first)
- Course repo: https://github.com/riseatlsu/CSC-3501-Fall-2026
- Assignment spec: https://docs.google.com/document/d/1at5jsBLU62t-u3HPodi3NxE4kLm13Ni8Rd-yDOTXDLU/edit
- Repo: https://github.com/stradoc/Bit_Cycler
