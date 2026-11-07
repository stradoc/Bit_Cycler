# Bit Cycler

A tycoon + rhythm game where every beat is one CPU clock cycle. CSC 3501 (Computer Organization), Fall 2026.

This README is for the team: setup, commands and testing tools. How to play is in `game/README.md` (it ships with the game), how the code is organized and how to add features in `CLAUDE.md`, the rules in `RULES.md`, the plan in `ROADMAP.md`, and history and decisions in `CHANGELOG.md`.

## Just playing

Play it in your browser at **https://stradoc.github.io/Bit_Cycler/game/**, with nothing to install. Every push to `main` goes live there.

To play offline on Windows or Mac, download the repo (**Code > Download ZIP** on GitHub, then unzip it) and double-click **`Play Bit Cycler.bat`**. It serves the game with Windows' own PowerShell (nothing to install) and opens it in your browser; close the window that opens to stop. Windows may warn that the file came from the internet the first time: choose **More info > Run anyway**. On a Mac, double-click **`Play Bit Cycler.command`** instead: it serves the game with Python's own web server and opens it the same way (if the Mac has no Python yet, it offers to install Apple's Command Line Tools: accept, then double-click again). macOS blocks it the first time because it came from the internet: go to **System Settings > Privacy & Security** and choose **Open Anyway** (on older macOS, right-click the file and choose **Open**). On another computer, follow Setup below and `npm run serve`. (The game can't be played by opening `game/index.html` directly: browsers only run its modules from a web address.)

## Setup

Requires Node 22.18 or newer and Python 3.

```sh
npm install        # installs TypeScript and Phaser types, copies phaser.min.js into game/lib/
```

## Daily workflow

Run these in two terminals:

```sh
npm run watch      # recompiles game/src/*.ts into game/js/ on every save
npm run serve      # serves game/ at http://localhost:8000
```

On Windows, if `python3` isn't found, run `python -m http.server 8000 --directory game` instead.

Before committing:

```sh
npm run build      # compile once; game/js/ must be committed and up to date
npm run check      # type-check the tests too
npm test           # run the tests
```

To get every sound as a WAV file (to listen to or open in an audio editor): `npm run build`, then `npm run export-sounds`. It writes them to `sound-export/` using the game's own sound code in headless Chrome (set `CHROME=/path/to/chrome` if it isn't found). Editing the files doesn't change the game; the sounds are made in `game/src/audio/cues.ts`.

## Dev shortcuts

Add these to the URL, e.g. `http://localhost:8000/?scene=play&autoplay`. Any `?scene=` skips the intro.

| Parameter | Effect |
| --- | --- |
| `?scene=title` | The main menu |
| `?scene=play` (or `?scene=pipeline&single`) / `?scene=pipeline` | Tier 1 (single-cycle) / tier 2 |
| `?scene=pipeline&forwarding` | Tier 3 (forwarding) |
| `?scene=pipeline&forwarding&guessing` | Tier 4 (branch prediction) |
| `?scene=pipeline&forwarding&guessing&predictor=1-bit` (or `2-bit`) | Tiers 5–6 (hardware predictor, SUM GRID) |
| `&practice` | Practice mode |
| `&difficulty=hard` | Play at that difficulty (`relaxed` / `easy` / `medium` / `hard`) instead of the settings' |
| `&cache` / `&cache=lines,ways,blocks` / `&cache=l2` | The L1 cache / with those upgrades (8 lines, 2-way sets, 8-byte blocks; any of them) / with the L2 behind it (`l3`: the L2 and L3; mixes with the upgrades: `&cache=ways,l3`) |
| `&program=SUM WORDS` | Play a program by name (`data/programs.ts`, or a contract's, like `32-BIT SUM #4821`) |
| `&clock=150` | Start with the clock dial at 50–150% |
| `&deep` | The deep pipeline (on a pipelined tier): a 1.5x clock, 4 cycles per wrong guess |
| `&superscalar` | Superscalar (on a pipelined tier): chords start two instructions at once |
| `&contract=fair` | Play the board's first contract of that grade (`easy` / `fair` / `stretch`), with pay, results and the workday's clock |
| `&autoplay` | Every note played perfectly (demos, checking results) |
| `?scene=pipeline&single&practice&tour=tier1` | Play a lesson's tour of the song screen, then its practice (any lesson id in `data/lessons.ts`; `tour=memwall,cache` plays two in a row). The developer screen's OPEN LESSON and the main menu's BRIEFS do the same with the right hardware |
| `?money=5000` | Set the money |
| `?scene=motions` | The motion lab: every animation on a sample (`&motion=note-flush&at=300` freezes one 300 ms in, for screenshots) |
| `?era=1` … `?era=4` | Show an era (8/16/32/64-bit look) until the page reloads; otherwise the save's CPU chip decides |
| `?fps` | Frames per second and the canvas size in the corner |

## Testing cheats

The **developer screen** (backquote, `` ` ``, on the main menu) has them all, and changes the save you're playing (the active slot), To test without touching a campaign, export it first (SAVES) or play another slot.

Or type them in the browser's console (F12, then Console) while the game runs; `cheat.help()` lists them. Each changes the active save and redraws the screen:
## Layout

| Path | What it is |
| --- | --- |
| `game/` | Everything that ships. Copied to `games/bit-cycler/` in the course repo at submission |
| `game/src/` | TypeScript source, the files we edit (a map of it is in `CLAUDE.md`) |
| `game/js/` | Compiled JavaScript. Generated by `tsc`, but committed because GitHub Pages serves it as-is |
| `game/lib/` | Phaser 3.90, copied in by `npm install` |
| `game/assets/` | Fonts and the recorded keys, each folder with a `CREDITS.txt` |
| `tests/` | `node:test` tests, run directly on the TypeScript source |
| `tools/` | Team tools that don't ship (`export-sounds.mjs`) |
