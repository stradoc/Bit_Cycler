# Simpler caches, reputation and five companies: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully associative caches with size steps on every level, a two-counter reputation that sets pay, and five companies with ASCII logos on a redesigned job sheet.

**Architecture:** Rules and numbers go in the pure layers: `sim/memory.ts`, the new `sim/reputation.ts`, the new `data/companies.ts` and `data/economy.ts`, tested in Node. The screens (`BoardScene`, `PipelineScene`, `song/*`, `ShopScene`) only ask and draw.
- A cache level's shape is carried as data from the save to the simulator: `CacheShape` for the L1, and `readonly LowerCache[]` for the levels below it. Today it travels as a count.
- A job's pay is worked out once, by `settleJob`, at the reputation from before the job. The pay travels in the replay's `Recording` to the results card.

**Tech Stack:** TypeScript 7.0.2 (`erasableSyntaxOnly`, `.ts` imports, `import type`), Phaser 3.90, `node:test` on the TS source, plain `tsc`.

**Spec:** `docs/superpowers/specs/2026-11-16-caches-and-reputation-design.md`. Read it first, together with `CLAUDE.md` and `RULES.md`. The code maps this plan was built from (line numbers, measured numbers) are in the session scratchpad; the plan repeats what a task needs.

## Global Constraints

- **No commits.** `RULES.md` rule 2: never `git commit` or `git push` without the user's approval, given after they've seen every changed file and a summary. Each task ends at a green checkpoint, not a commit.
- **Stage by path only.** Never `git add -A` or `git add .`: the sandbox shows fake untracked dotfiles.
- **Checkpoint commands**, all clean:
  - `npm run build`
  - `npm run check`
  - `npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p .`
  - `npm test` (246 tests pass at the start)
- **Where things live** (`CLAUDE.md`):
  - Numbers only in `data/economy.ts`.
  - The song screen's text in `song/words.ts`. The exceptions are the card's lines, which `song/results.ts` already holds, and reputation's own words, which `sim/reputation.ts` owns.
  - Eras are never branched on.
  - Delete what's replaced: code, tests, docs, and any compiled `.js` / `.js.map` of a deleted module.
- **Never rename or remove a program kind** in `sim/generator.ts`. `TUTORIAL_PROGRAM` (`'BAKERY TILL'`, client `CORNER BAKERY`) stays exactly as it is.
- **Text on screen:**
  - Printable ASCII, or the code page 437 glyphs that `Glyphs` already uses. No `★ ☆ × −`: the era fonts lack them. Write `x1.35` and `-2`.
  - Labels in capitals. Tour lines ≤ 150 characters, in sentence case.
- **Seeds:**
  - Reputation never draws from `random`, and `newContract` never reads reputation.
  - `Contract.pay` stays the base pay, before reputation.
  - The generator keeps exactly one `r.pick` for the client.
- **Spec values:**
  - Cache sizes: L1 blocks 4 → 8 → 16 ($400, $800); L2 16 → 32 → 64 ($600, $1,200); L3 64 → 128 → 256 ($900, $1,800). Lines stay 4, 8 and 4.
  - Reputation levels: UNKNOWN 0 ×1.0, LOCAL 5 ×1.25, TRUSTED 15 ×1.5, RESPECTED 30 ×1.75, FAMOUS 50 ×2.0.
  - Bad marks: 5% cut each. Floor ×1.0 on days 1-7, ×0.75 from day 8.
  - Fades: one bad mark off per on-time job, and one per day ended.
  - GOOD: +1 per on-time job (a weight per grade, all 1).
  - At most 2 jobs from one company on the board.
- **The WIP marks stay** on the L2, the L3 and every size step.

## Decisions this plan makes (spec left them open)

1. **Lower caches as data.** `LowerCache` gets no new fields. `cachesBelow(lower, sizes)` returns each level with its grown shape. `PipelineOptions.lowerCaches`, `SongStart.lowerCaches`, `SongSetup.lowerCaches`, `Lesson.options.lowerCaches`, `MemorySystem(cache, lower)`, `missNs(shape, lower, from)` and `ramCycles(mhz, cache, lower)` all take `readonly LowerCache[]`. `RunReport.lowerCaches` stays a count (`setup.lowerCaches.length`).
2. **Save field and shop keys.** The save field is `Progress.cacheSizes: readonly number[]`: one count per `MEMORY_PARTS` level, L1 first, always `MEMORY_PARTS.length` long. Shop and showcase keys are `l1size`, `l2size` and `l3size`, built inline as `` `${MEMORY_PARTS[i].id}size` `` (no helper; `progress.ts` and `showcase.ts` import each other).
3. **The size lesson's id is `size`** (BRIEFS: `SIZE.EXE`), and its picture is `DiagramId` `'size'`, built from `bigblocks`. `bigblocks`, `morelines` and `twoway` are deleted.
4. **`CacheLine` becomes `{ valid, block }`.** `first-l1` stays a comparison of the L1 only: the same run with `cache: L1_BASE`, the lower levels as they are.
5. **The board's reputation line** sits right-aligned on the subtitle row (y = `LAYOUT.subtitle`), under the money. On the board only, the subtitle (`YOUR CPU: …`) becomes left-aligned at `LAYOUT.left`. Check both in screenshots in all four eras.
6. **Stars** are `bar(levelIndex, levels - 1, levels - 1, glyphs)`, so FAMOUS fills all 4 (`####` / `████`).
7. **Each company has a `short` name** (COBALT, INNERCORE, REDSHIFT, FLAGSHIP, WINGTIP). The board's list and the song panel use it; the full name goes on the job sheet, the card and the calendar.
8. **Logos in the 64-bit era.** Put a ZWNJ (U+200C) between each pair of characters at draw time, so JetBrains Mono's ligatures don't merge `<=`, `==` or `::`. This is one helper, `unligated(text)`, in `visual/asciiChart.ts`. Confirm it by screenshot in every era.
9. **TICK.**
   - `FIRST_DAY_TOUR` gets two new steps: one on the companies (pointing at the new `BoardTarget` `'job'`, now with the logo) and one on reputation (a new `BoardTarget` `'reputation'`).
   - The card's reputation line gets part `'reputation'`. TICK doesn't point at it.
   - A late job during the grace week says `BAD MARK +1 (GRACE WEEK)`.
10. **Don't count a job twice.** `finishJob` does nothing when its contract is no longer on the board: it returns `job: undefined`. RESTART during the 2-second wait after a paid run could otherwise count the job twice.
11. **Old saves:**
    - `cacheUpgrades` (strip the key; each distinct old id is one L1 step, capped at 2).
    - Old `bought` ids `lines`, `ways` and `blocks` become `l1size`, mapped before the dedupe.
    - Old `seenLessons` ids are left alone.
    - Reputation starts at `{ good: 0, bad: 0 }`.

## Review Focus

These are the five things most likely to bite a player that no task's main tests would catch. Each line names the test that pins it, in the task that owns the code.

1. **The card shows what was paid, even after a level-up.** A run that crosses into LOCAL is paid at ×1.0, and its card must say ×1.0, not ×1.25. Pinned in Task 4: `song.test.ts` "the card's pay comes from the recording, not the save".
2. **An old save keeps what it paid for.** A save with `cacheUpgrades: ['lines', 'ways', 'blocks']` loads with `cacheSizes [2, 0, 0]`, no `cacheUpgrades` key, and `bought` mapped. Pinned in Task 1: `save.test.ts` "an old save's L1 upgrades become size steps".
3. **A third job from one company.** Over seeds 1-200, no board deal puts more than 2 jobs from one company on the board. Pinned in Task 5: `progress.test.ts` "no company has more than two jobs on the board".
4. **Buying a size step twice doesn't replay its lesson, and a maxed step can't be bought.** Pinned in Task 1: `progress.test.ts` "size steps: one at a time, lesson once, then max".
5. **The first week stays forgiving.** A new player late on one job in three over days 1-7 never earns below ×1.0, and still averages at least ×1.0 over 30 days. Pinned in Task 3: `reputation.test.ts` "the anti-goal: sometimes late still earns at least today's pay".

---

### Task 1: Fully associative caches with size steps (model, shop, save, everything that reads a cache)

These all land together. `lessons.ts` and `showcase.ts` build shapes, and run a guard, when they're imported. A missing export (`setsOf`, say) stops every test that imports `words.ts` from loading.

**Files:**
- Modify:
  - `game/src/sim/memory.ts`, `game/src/data/economy.ts`, `game/src/sim/progress.ts`, `game/src/saveFile.ts`, `game/src/sim/showcase.ts`, `game/src/sim/pipeline.ts`
  - `game/src/song/setup.ts`, `game/src/song/results.ts`, `game/src/song/words.ts`, `game/src/song/panel.ts`, `game/src/song/layout.ts`, `game/src/song/view.ts`
  - `game/src/scenes/PipelineScene.ts` (`:205`), `game/src/scenes/DevScene.ts`, `game/src/cheats.ts`
  - `game/src/data/boot.ts`, `game/src/visual/chip3d.ts`, `game/src/flow.ts`
  - `game/src/data/lessons.ts`: options types only; the lessons themselves move in Task 2
  - `game/src/visual/diagrams.ts`: signatures only
  - `game/src/data/tours.ts`: the `ns()` helper only
- Test:
  - `tests/memory.test.ts`, `tests/progress.test.ts`, `tests/showcase.test.ts`, `tests/save.test.ts`, `tests/songSetup.test.ts`
  - `tests/song.test.ts`, `tests/boot.test.ts`, `tests/model3d.test.ts`, `tests/generator.test.ts`

**Interfaces:**
- Produces (`sim/memory.ts`):
  - `type CacheShape = { readonly lines: number; readonly blockBytes: number }`
  - `L1_BASE = { lines: 4, blockBytes: 4 }`
  - `cacheShape(level: number, steps = 0): CacheShape`: level 0 is the L1, 1 the L2, 2 the L3; steps are clamped to `0..sizes.length`
  - `cachesBelow(lower: number, sizes: readonly number[] = []): readonly LowerCache[]`
  - `missNs(shape: CacheShape, lower: readonly LowerCache[] = [], from: Source = 'RAM'): number`
  - `ramCycles(mhz: number, cache?: CacheShape, lower: readonly LowerCache[] = []): number`
  - `new MemorySystem(cache?: CacheShape, lower: readonly LowerCache[] = [])`
  - `type MissKind = 'first-use' | 'too-small'`
  - `type CacheLine = { readonly valid: boolean; readonly block: number }`
  - `cacheWords(shape)`: `"16 BYTES: 4 LINES OF 4"`
  - Deleted: `setsOf`, `setOf`, `tagOf`, `addressSplit`, the `ways` field, `'conflict'`.
- Produces (`data/economy.ts`):
  - Each `MEMORY_PARTS` row gains `sizes: readonly { blockBytes: number; price: number }[]`.
  - `CACHE_SIZE = { lessonId: 'size', wip: true } as const`.
  - `WIP_PARTS = [...MEMORY_PARTS, CACHE_SIZE].filter((p) => p.wip)`.
  - Deleted: `CACHE_UPGRADES`, `CacheUpgradeId`.
- Produces (`sim/progress.ts`):
  - `Progress.cacheSizes: readonly number[]`, with `NEW_GAME.cacheSizes = MEMORY_PARTS.map(() => 0)`. `cacheUpgrades` is removed.
  - `lowerCachesOf(p): readonly LowerCache[]`.
  - `cacheOf(p)` returns `cacheShape(0, p.cacheSizes[0])` when an L1 is owned.
  - `withEverything` sets every level to its maximum.

- [ ] **Step 1: Write the failing model tests in `tests/memory.test.ts`**
  - Delete: "an address splits into tag, line and offset", "an 8-bit address splits by the cache's shape", "2-way: …", "8 lines: …".
  - Add or rewrite:
    - `two blocks a cache apart both stay`: on `new Cache(L1_BASE)`, reading 0, 16, 1, 17 gives miss, miss, hit, hit.
    - `the line used longest ago makes room, across every line`: reading blocks 0-4 then 0 gives, for the last read, `{ hit: false, missKind: 'too-small' }`, with `evicted` the block used longest ago.
    - `misses are first use or too small`: `Object.keys(new MemorySystem(L1_BASE).missKinds)` deepEqual `['first-use', 'too-small']`.
    - `each level's size steps double its blocks`:
      - `cacheShape(0, 0..3)` blockBytes `[4, 8, 16, 16]`
      - `cacheShape(1, 2)` deepEqual `{ lines: 8, blockBytes: 64 }`
      - `cacheShape(2, 2)` deepEqual `{ lines: 4, blockBytes: 256 }`
      - `cacheWords(cacheShape(0, 2)) === '64 BYTES: 4 LINES OF 16'`
    - `a level's blocks never get smaller than the level above's`: for every combination of steps, each level's blockBytes ≥ the level above's.
    - `bigger L1 blocks make a trip to RAM longer; lower steps add nothing`:
      - `missNs(L1_BASE) === 61`
      - `missNs(cacheShape(0, 1)) === 66`
      - `missNs(cacheShape(0, 2)) === 76`
      - `missNs(L1_BASE, cachesBelow(2, [0, 2, 2])) === 78`
    - Practice programs (perfect runs, the `misses()` helper with its new signature):
      - TWO PASSES on `L1_BASE`: `{ misses: 12, 'first-use': 6, 'too-small': 6 }`
      - TWO PASSES on `cacheShape(0, 1)`: `{ 3, 3, 0 }`
      - SUM WORDS: 6, then 3, then 2 (base, then each step)
    - Levels:
      - TWO PASSES, L1 alone: `{ L1: 0, RAM: 12 }`, AMAT 61.
      - With `cachesBelow(1)`: `L1 0, L2 10, RAM 2`, AMAT 16.
      - SUM BIG NUMBERS is unchanged.
      - `new MemorySystem(L1_BASE, cachesBelow(1))` sequences stay as they are today.
    - `an L2 with 32-byte blocks answers the next seven L1 blocks after one trip to RAM`.

- [ ] **Step 2: Run them and watch them fail**

  Run: `node --test tests/memory.test.ts`
  Expected: FAIL. The new signatures don't exist yet, and `'conflict'` is still in `missKinds`.

- [ ] **Step 3: Implement the model in `sim/memory.ts`, and the sizes in `data/economy.ts`**
  - The `Cache` class keeps one set of all its lines:
    - `find` is a linear search for the block.
    - `room()` takes an empty line first, else the line used least recently.
    - `missKind` is `seen.has(block) ? 'too-small' : 'first-use'`.
    - `evicted` is the old line's `block`.
  - Rewrite the module comment and `SHOWN_BYTES`'s comment. Say once, in the header, that "fully associative" is a simplification of real L1s.
  - In `MEMORY_PARTS`, add `sizes` as the spec's table gives them, and drop "2-way" from the L2's `about`.

- [ ] **Step 4: Write the failing shop, save, showcase and setup tests**
  - **`tests/progress.test.ts`:**
    - Replace "the L1's upgrades…" with `size steps: one at a time, lesson once, then max`:
      - The `l1size` item is `'later'` without an L1, `'buy'` at $400 with one, and $800 after one step.
      - At 2 steps it's `'max'`, priced 0, named `L1 SIZE: 64 BYTES (WIP)`.
      - Its `lessonId` is `'size'` until `seenLessons` includes `'size'`, then undefined.
      - The `l2size` item is `'later'` until `cacheLevels >= 2`.
      - `apply` never goes past the maximum.
    - Shop keys in the MEMORY group: `['l1', 'l1size', 'l2', 'l2size', 'l3', 'l3size']`.
    - The WIP names are `l1size`, `l2`, `l2size`, `l3`, `l3size`; `isWip` lesson ids `['l2', 'l3', 'size']`.
    - `cpiFor('TWO PASSES')` is lower with `cacheSizes [1, 0, 0]` than with `[0, 0, 0]`.
    - `withEverything(NEW_GAME).cacheSizes` deepEqual `[2, 2, 2]`.
    - Delete the ADD ARRAYS #1 versus #16 collision assertions (`:203-205`). Both now cost the same (CPI 31.84).
  - **`tests/save.test.ts`:**
    - `an old save's L1 upgrades become size steps`: a raw save with `cacheUpgrades: ['ways', 'bogus', 'ways', 'lines']` and no `cacheSizes` gives `cacheSizes [2, 0, 0]` and no `cacheUpgrades` key.
      - Three distinct ids are capped at `[2, 0, 0]`.
      - `bought ['l1', 'ways', 'l2', 'blocks']` gives `['l1', 'l2', 'l1size']`.
    - `cacheSizes [9, -1, 'x']` gives `[2, 0, 0]`.
    - A new game has `[0, 0, 0]`.
    - Migration is decided by `raw.cacheUpgrades` being present. The raw value is read before the `{ ...NEW_GAME, ...raw }` merge.
  - **`tests/showcase.test.ts`:**
    - The `tier7` fixture uses `cacheSizes [1, 0, 0]`, and its `bought` includes `'l1size'`.
    - `l1size` is in use only with an L1 step. Its `without` is `cacheShape(0, steps - 1)`, and it deals OTHERS and CHECKED COPY on 16-, 32- and 64-bit data.
    - `l2size` and `l3size`: `without` shrinks only that level's shape. Widths are `[32, 64]` and `[64]`.
    - Drop the 2-WAY / ADD ARRAYS half.
  - **`tests/songSetup.test.ts`:**
    - The save's steps reach `setup.l1` and `setup.lowerCaches[i].shape`.
    - `?cache=l3&sizes=2,1,0` gives `l1 { 4, 16 }` and the L2 at 32-byte blocks.
    - A retry and a replay keep the same shapes.

- [ ] **Step 5: Run them and watch them fail**

  Run: `node --test tests/progress.test.ts tests/save.test.ts tests/showcase.test.ts tests/songSetup.test.ts`
  Expected: FAIL.

- [ ] **Step 6: Implement**
  - **`sim/progress.ts`:**
    - `sizeItem(progress, level)` is modelled on `clockItem`:
      - Its about line says what the cache becomes (`cacheWords(after)`).
      - For the L1, it adds `+${missNs(after) - missNs(now)} ns` per trip to RAM. For the L2 and L3, it says the bigger block costs no time.
      - Its name is `wipLabel(\`${NAME} SIZE: ${cacheBytes} BYTES\`, CACHE_SIZE.wip)`.
      - `lessonId` is `'size'` only while unseen (`hasSeen`).
    - In `shopItems`, after each level's item, push its `sizeItem`. Delete `cacheUpgradeItem`.
    - `clockAbout` states the trip's real time: `missNs(cacheOf(p), lowerCachesOf(p))`, not a fixed 60 ns.
  - **`saveFile.ts`:** `cleanSizes(raw.cacheSizes, raw.cacheUpgrades)`. The one surviving list of old ids is a commented constant there.
  - **`sim/showcase.ts`:** entries `l1size`, `l2size` and `l3size`, each right after its level's entry. The load-time guard checks every `MEMORY_PARTS` level has its size entry.
  - **`song/setup.ts`:**
    - `cacheParam` / `lowerParam` read `?cache[=l2|l3]&sizes=a,b,c`.
    - `SongStart` and `SongSetup.lowerCaches` become `readonly LowerCache[]`.
  - **`sim/pipeline.ts`:** `PipelineOptions.lowerCaches?: readonly LowerCache[]`.

- [ ] **Step 7: Make every consumer compile and load on the new model**

  Each change follows the map:
  - **`song/panel.ts`:**
    - The cache box is one column, a line a row (the L1 always has 4 lines).
    - Each row's text comes from a new `SongWords.cacheRow(line)`:
      - `${line} ${hex bytes}` for 4-byte blocks.
      - `${line} ${from}-${to}` for 8- and 16-byte blocks.
      - At most 18 characters.
    - Delete `cachePlace`.
    - `markBytes` outlines every row a block spans.
  - **`song/words.ts`:**
    - Delete `placeWord` and the `'miss-conflict'` tip.
    - `lookup()` becomes e.g. `lw 20: BYTES 20-23 -> MISS (TOO SMALL)`, at most 50 characters.
    - `cacheLine`, `cacheTitle`, `cache()` and `lookupInfo()` lose sets, tags and `tttt ii oo`. `cacheLine` says "A block can go in any line; when all are full, the one used longest ago makes room."
  - **`song/layout.ts`:** delete `addressBits`; `MISS_WORDS` has two keys.
  - **`song/view.ts`** and **`PipelineScene.ts:205`:** `{ valid: false, block: 0 }`.
  - **`song/results.ts`:**
    - `first-l1` uses `!sameShape(setup.l1, L1_BASE)`.
    - `no-l2` / `no-l3` use `setup.lowerCaches.slice(0, -1)`.
  - **`data/boot.ts`:** lists each owned level's grown shape.
  - **`visual/chip3d.ts`:** no gaps between sets; lower levels from `lowerCachesOf`.
  - **`scenes/DevScene.ts`:**
    - `CACHE_STEPS` becomes `{ levels: number; sizes: readonly number[] }[]`: none; then each level bare and at each of its steps; then all at full size.
    - `cacheText` shows owned sizes, e.g. `L1 64 B + L2 512 B`. The row must fit (screenshot).
  - **`cheats.ts`:**
    - `cheat.size(l1, l2 = 0, l3 = 0)` replaces `cheat.l1`; HELP is updated.
    - `status()` prints the sizes.
  - **`data/lessons.ts`:**
    - `options.lowerCaches` is a list: `cachesBelow(1)` and `cachesBelow(2)`.
    - Interim: `morelines` and `twoway` use `cacheShape(0, 1)` until Task 2 deletes them. `bigblocks` uses `cacheShape(0, 1)`.
  - **`visual/diagrams.ts`:** `loadsOn(program, shape, lower: readonly LowerCache[] = [])`, and every `cacheShape([...])` call becomes `cacheShape(0, 1)`.
  - **`data/tours.ts`:** `ns()` passes `cachesBelow(n)`.

  Then fix the remaining tests:
  - **`song.test.ts`:**
    - The fixture `cacheShape(0, 1)`.
    - `first` uses `!sameShape`.
    - The text `'With the first L1 (16 bytes: 4 lines of 4)'`.
    - `LOADS: L1 0, L2 10, RAM 2` and `L1 0, L2 10, L3 1, RAM 1`.
    - "10 from the L2".
  - **`boot.test.ts`:** at full size, `93 ns = 372 CYCLES`; `64 BYTES: 4 LINES OF 16`; `L2 512 BYTES: 8 LINES OF 64, +5 ns`; `L3 1024 BYTES: 4 LINES OF 256, +12 ns`.
  - **`model3d.test.ts`:** loop over `cacheSizes [s, 0, 0]`.
  - **`generator.test.ts`:**
    - Delete the ADD ARRAYS conflict test. Its `r.chance(0.5)` draw stays in the generator.
    - The OTHERS / CHECKED COPY tests use `cacheShape(0, 1)`.

- [ ] **Step 8: Add the song-words test, and run the checkpoint**
  - Add to `tests/song.test.ts`: `the cache's words never mention mapping`.
    - Build `SongWords` with filled lines on `L1_BASE` and on `cacheShape(0, 2)`.
    - Use hand-built `Access` objects: a hit, a first-use miss, a too-small miss with and without lower levels, and a store.
    - Check that `lookup()`, the tips, `cacheLine()`, `cacheTitle()`, `cache()`, `lookupInfo()` and `cacheRow()` never match `/\bCONFLICT\b|\bTAGS?\b|\bSETS?\b|DIRECT-MAPPED|\d-WAY|tttt/i`.
    - Lengths: `lookup()` ≤ 50 characters, `cacheRow()` ≤ 18.
  - Run the four checkpoint commands.

  Expected: all clean, every test passes.

### Task 2: Teach the new caches (lessons, tours, pictures, glossary, programs)

**Files:**
- Modify: `game/src/data/lessons.ts`, `game/src/data/tours.ts`, `game/src/visual/diagrams.ts`, `game/src/data/glossary.ts`, `game/src/data/programs.ts`, `game/src/song/words.ts` (the results tour, `:527`)
- Test: `tests/tours.test.ts`, `tests/memory.test.ts`, `tests/song.test.ts`, `tests/progress.test.ts`

**Interfaces:**
- Consumes (Task 1): `cacheShape(level, steps)`, `cachesBelow`, `missNs(shape, lower, from)`, `MissKind`, `CACHE_SIZE.lessonId`.
- Produces:
  - Lesson `size`: `{ id: 'size', title: 'BIGGER CACHE BLOCKS', scene: 'pipeline', options: { forwarding: true, l1: cacheShape(0, 1), program: 'SUM WORDS' }, practice: true }`, placed where `bigblocks` was.
  - `SONG_TOURS.size`.
  - `DiagramId` `'size'`.

- [ ] **Step 1: Write the failing tests in `tests/tours.test.ts`**
  - `no lesson or glossary entry talks about mapping`: no `SONG_TOURS` line and no `GLOSSARY` body matches the regex from Task 1, Step 8. Allow the glossary's "tags show which stage", which is about pipeline tags: test the cache entries, or exclude that one.
  - `the cache lesson says the game simplifies`: the `cache` tour has a line matching `/anywhere/`.
  - `the size lesson`:
    - `LESSONS.size.practice === true`.
    - `LESSONS.size.options.l1` deepEqual `cacheShape(0, 1)`.
    - Its tour holds up `'size'`, and its steps are at least 4.
  - `morelines, twoway and bigblocks are gone`.

- [ ] **Step 2: Run them and watch them fail**

  Run: `node --test tests/tours.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Rewrite the lessons**
  - **Delete:**
    - The lessons and tours `morelines`, `twoway` and `bigblocks`.
    - The pictures `address`, `cacheplay`, `morelines`, `twoway` and `sets`.
    - The program `ADD TWO LISTS`, which only they used.
  - **`cache` tour:**
    - `:238` drops "Every block has one line it can go in."
    - `:239` becomes: "Any block can go in any LINE; when all 4 are full, the one used longest ago makes room."
    - Add: "Real L1 caches are a little pickier about where a block can go; this game lets a block go anywhere."
    - `:241` gives two kinds of miss: FIRST USE (never loaded) and TOO SMALL (pushed out for lack of room).
    - The `lines` picture is redrawn: blocks taking free lines in the order used, built on a real `new Cache()`.
    - The `misskinds` picture becomes two boxes. Its footer says bigger blocks cut both kinds.
  - **`size` tour**, built from `bigblocks`:
    - Each size step doubles a cache's blocks, so each trip brings back more of the numbers next to it, and the cache holds twice as much (fewer TOO SMALL misses).
    - The everyday comparison: carrying two bags in from the car each trip.
    - Only the L1 pays about 5 ns more per trip; the L2 and L3 cost nothing extra.
    - It practices on the L1.
    - Its numbers are built from `MEMORY_PARTS` and `missNs`, as `tours.ts:139-142` already does.
    - The picture `'size'` is `bigblocks`' drawing, with its labels taken from `blockBytes` (6 MISSES -> 3, 61 -> 66 ns).
  - **`l2` and `l3` tours, and TICK's results tour (`words.ts:527`):** check every number against TWO PASSES' new run (L1 alone misses 12 of 12; with the L2, 10 are found there and 2 go to RAM). Reword "The L1 cache already had 0 of 12…" so it reads naturally.
  - **Stale comments:** `programs.ts:132, 166, 196-198`.

- [ ] **Step 4: Fix dependent tests and run the checkpoint**
  - `tests/memory.test.ts`: drop ADD TWO LISTS.
  - `tests/progress.test.ts`: the lesson ids from Task 1 now include only `size`.
  - Run the four checkpoint commands.

  Expected: all clean.

### Task 3: Reputation: rules, state, and paying once

**Files:**
- Create: `game/src/sim/reputation.ts`, `tests/reputation.test.ts`
- Modify: `game/src/data/economy.ts`, `game/src/sim/progress.ts`, `game/src/sim/workday.ts`, `game/src/saveFile.ts`
- Test: `tests/workday.test.ts`, `tests/progress.test.ts`, `tests/tutorial.test.ts`, `tests/save.test.ts`

**Interfaces:**
- Produces (`data/economy.ts`, after `LATE_PAY_FACTOR`):

  ```ts
  export const REPUTATION = {
    levels: [
      { name: 'UNKNOWN', good: 0, pay: 1 }, { name: 'LOCAL', good: 5, pay: 1.25 }, { name: 'TRUSTED', good: 15, pay: 1.5 },
      { name: 'RESPECTED', good: 30, pay: 1.75 }, { name: 'FAMOUS', good: 50, pay: 2 },
    ],
    goodPerJob: { easy: 1, fair: 1, stretch: 1 },
    badPerLate: 1,
    fades: { onTime: 1, dayEnd: 1 },
    cutPerMark: 0.05,
    floor: { grace: 1, after: 0.75 },
    graceDays: 7,
  } as const;
  ```

- Produces (`sim/reputation.ts`; it imports only `data/economy.ts` and `visual/asciiChart.ts`'s pure `bar` / `Glyphs`):
  - `type Reputation = { readonly good: number; readonly bad: number }`; `NO_REPUTATION`.
  - `type ReputationChange = { readonly before: Reputation; readonly after: Reputation; readonly late: boolean; readonly grace: boolean; readonly levelUp?: string }`.
  - `levelOf(rep): { index: number; level: (typeof REPUTATION.levels)[number]; next?: … }`.
  - `inGrace(day): boolean`.
  - `payMultiplier(rep, day): number`: the level's pay × (1 − cutPerMark × bad), never below that day's floor.
  - `afterJob(rep, grade: GradeId, late: boolean, day: number): ReputationChange`.
  - `afterDay(rep): Reputation`.
  - `cleanReputation(raw: unknown): Reputation`: whole numbers 0..1e6; anything else gives `NO_REPUTATION`.
  - `multiplierText(m)`: `"x1.35"`.
  - `reputationLine(rep, day, glyphs: Glyphs): string`: `"TRUSTED ##.. +24 -2  PAY x1.35"`. `-N` only when bad > 0.
  - `changeLine(change): { left: string; right?: string }`: one of `LEVEL UP: LOCAL`, `REPUTATION +1`, `BAD MARK +1` or `BAD MARK +1 (GRACE WEEK)`; `right` is e.g. `PAY x1.25 NEXT JOB` when the multiplier changed.
- Produces (`sim/progress.ts`):
  - `Progress.reputation: Reputation`; `NEW_GAME.reputation = NO_REPUTATION`.
  - `payFor(progress: Progress, contract: Contract, late = false): number`: `Math.round(contract.pay × (late ? LATE_PAY_FACTOR : 1) × payMultiplier(progress.reputation, progress.day))`.
  - `type JobResult = { readonly late: boolean; readonly pay: number; readonly reputation: ReputationChange }`.
  - `settleJob(progress, contract, late): JobResult`: pay at the reputation before the job, then the change.
  - `completeContract` is deleted, folded into `finishJob`.
- Produces (`sim/workday.ts`):
  - `finishJob(progress, contract, seconds, late, random): { progress: Progress; job?: JobResult }`. `job` is undefined when the contract isn't on the board, and progress is then returned unchanged.
  - `endDay` fades: `reputation: afterDay(progress.reputation)`.

- [ ] **Step 1: Write `tests/reputation.test.ts`**
  - `the table climbs`: thresholds rise from 0, pay never falls, and every `GradeId` has a weight.
  - `levels come from GOOD`: 4 is UNKNOWN, 5 LOCAL, 15 TRUSTED, 49 RESPECTED, 50 and 500 FAMOUS.
  - `payMultiplier`:
    - TRUSTED with 2 marks on day 8 is 1.35.
    - UNKNOWN with 3 marks is 1.0 on day 7 and 0.85 on day 8.
    - UNKNOWN with 10 marks on day 8 is 0.75.
    - FAMOUS with 0 marks is 2.
  - `afterJob`:
    - On time: GOOD +1 and BAD −1, never below 0.
    - Late: BAD +1, GOOD unchanged.
    - `levelUp === 'LOCAL'` going from 4 to 5, and only on an on-time job.
    - `grace` is true on days 1-7.
  - `afterDay takes one mark off, never below 0`.
  - `cleanReputation`: `undefined`, `{ good: -3, bad: 'x' }`, `{ good: 2.5 }` and `NaN` all give `{ 0, 0 }`, and `{ good: 24, bad: 2 }` comes through unchanged.
  - `the words fit and use only the era fonts' characters`:
    - `reputationLine` with ASCII and CP437, and `changeLine`, in every case: at most 40 characters.
    - Every character is ASCII or in `CP437`'s glyph set.
  - `the anti-goal: sometimes late still earns at least today's pay`:
    - Simulate 30 days of 3 jobs a day with a fixed late pattern: job 3 of each day late; `afterJob` per job, `afterDay` per day.
    - The multiplier at every job of days 1-7 is ≥ 1.
    - The average over 30 days is ≥ 1.
  - `one late job doesn't cost a level`: at TRUSTED (GOOD 15), one late job leaves the level TRUSTED and the multiplier ≥ 1.5 × 0.95.

- [ ] **Step 2: Run it and watch it fail**

  Run: `node --test tests/reputation.test.ts`
  Expected: FAIL (module missing).

- [ ] **Step 3: Implement `sim/reputation.ts` and `REPUTATION`**

- [ ] **Step 4: Write the failing pay and workday tests**
  - **`tests/workday.test.ts`**, "finishing a job pays…":
    - Use `.progress`.
    - `job.pay` equals the money gained and the change in `today.earned`.
    - Reputation is `{ 1, 0 }` on time and `{ 0, 1 }` late.
    - New: `a job is paid at the reputation before it`. From GOOD 4 (UNKNOWN), an on-time job pays `contract.pay` (×1), and the next job pays `round(pay × 1.25)`.
    - New: `a job no longer on the board isn't counted twice`. Finishing the same contract twice: the second call returns `job: undefined`, and money, `today` and reputation are unchanged.
    - "ending the day…": from `{ good: 3, bad: 2 }`, the morning has `bad 1`.
  - **`tests/progress.test.ts`:**
    - `payFor` at `NEW_GAME` is `contract.pay`, and `Math.round(pay / 2)` late.
    - At `{ good: 15 }` on day 8, it's `round(pay × 1.5)`.
    - The endless-board test moves to `finishJob`.
  - **`tests/tutorial.test.ts`:** the `completeContract` call becomes `finishJob(...).progress`. `TUTORIAL_JOB.pay` still holds.
  - **`tests/save.test.ts`:**
    - An old save gets `{ 0, 0 }`.
    - The edited save's `reputation: { good: -3, bad: 'x' }` gives `{ 0, 0 }`.
    - The round-trip keeps `{ good: 24, bad: 2 }`.

- [ ] **Step 5: Run them and watch them fail; implement; run the checkpoint**

  Run: `node --test tests/workday.test.ts tests/progress.test.ts tests/tutorial.test.ts tests/save.test.ts`
  Expected: FAIL first.
  - Then implement: `payFor`, `settleJob`, the new `finishJob` and `endDay`, and `cleanProgress` calling `cleanReputation`.
  - Update the one caller, `PipelineScene.finish`, just enough to compile: take `.progress`. Task 4 wires the rest.
  - The four checkpoint commands are clean.

### Task 4: Reputation on screen (the card, the board, the developer screen, cheats)

**Files:**
- Modify:
  - `game/src/song/setup.ts` (`Recording`), `game/src/scenes/PipelineScene.ts` (`finish`, `:323`), `game/src/song/results.ts`
  - `game/src/scenes/BoardScene.ts` (pay shown, the reputation line, `where`), `game/src/data/tours.ts` (`BoardTarget`, `FIRST_DAY_TOUR`)
  - `game/src/sim/workday.ts` (`eventsOn`'s offer labels), `game/src/scenes/CalendarScene.ts`
  - `game/src/scenes/DevScene.ts`, `game/src/cheats.ts`
- Test: `tests/song.test.ts`, `tests/songSetup.test.ts`, `tests/tours.test.ts`, `tests/workday.test.ts`

**Interfaces:**
- Consumes (Task 3): `JobResult`, `ReputationChange`, `changeLine`, `reputationLine`, `payFor(progress, contract, late)`, `finishJob(...) → { progress, job? }`.
- Produces:
  - `Recording.job?: JobResult` replaces `paid` and `late`. Present means paid.
  - `RunReport.job.reputation: ReputationChange`.
  - `BoardTarget` gains `'reputation'`.
  - Each `offers-end` event entry: `${client} ${formatMoney(payFor(progress, contract))}`. Task 6 switches it to the company's short name.

- [ ] **Step 1: Write the failing tests**
  - **`tests/song.test.ts`:**
    - The `paidRun` fixture and `:135` carry `job: settleJob(NEW_GAME-based progress, contract, late)`.
    - New: `the card's pay comes from the recording, not the save`. A recording whose `job.pay` is 123, with a different `contract.pay`, shows `PAID $123`.
    - New: `the card says what the job did to reputation`:
      - On time: `REPUTATION +1`.
      - Late on day 3: `BAD MARK +1 (GRACE WEEK)`.
      - Crossing 5: `LEVEL UP: LOCAL`.
      - In both ASCII and CP437, `cardLines` stay within `CARD_WIDTH`, and `parts.verdict` is still `{ first: 0, last: 2 }`.
  - **`tests/songSetup.test.ts`:** the `recording` fixture's new shape.
  - **`tests/tours.test.ts`:** `FIRST_DAY_TOUR` has one step pointing at `'reputation'`.
  - **`tests/workday.test.ts`:** the offers-end entries carry the pay, and there is still one entry per offer.

- [ ] **Step 2: Run them and watch them fail**

  Run: `node --test tests/song.test.ts tests/songSetup.test.ts tests/tours.test.ts tests/workday.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement**
  - **`PipelineScene.finish()`:**
    - Run `const p = getProgress(); const done = finishJob(p, …); setProgress({ ...done.progress, skills: logJob(p.skills, …) })`. This avoids TS issue #9998 with a closure.
    - Put `done.job` in the recording.
    - `:323` reads `setup.replay?.job`.
  - **`results.ts`:**
    - `verdict` and `job` come from `setup.replay?.job`. Remove the `payFor` import.
    - Push `{ kind: 'line', ...changeLine(job.reputation), part: 'reputation' }` after the deadline row.
  - **`BoardScene`:**
    - The list's `middle` and the sheet's PAYS use `formatMoney(payFor(progress, contract))`.
    - The subtitle is left-aligned at `LAYOUT.left`.
    - `reputationLine(progress.reputation, progress.day, this.era glyphs)` goes at `(LAYOUT.right, LAYOUT.subtitle)`, origin `(1, 0.5)`, `TEXT.subtitle`.
    - `where('reputation')` is that text's bounds.
  - **`FIRST_DAY_TOUR`:** one new line, ≤ 150 characters, in sentence case:
    - "Your REPUTATION: jobs done on time raise it and your pay. Late jobs leave BAD MARKS that cut pay for a while." Points at `'reputation'`.
  - **`DevScene`:** rows `REPUTATION` (steps GOOD through the levels' thresholds) and `BAD MARKS` (±1, ≥ 0).
  - **`cheats`:** `cheat.rep(good, bad = 0)`, through `cleanReputation`; a HELP line; `status()` prints `reputationLine`.

- [ ] **Step 4: Run the checkpoint**

  Run the four commands.
  Expected: all clean.

### Task 5: Five companies (data, the generator, at most two jobs each)

**Files:**
- Create: `game/src/data/companies.ts`, `tests/companies.test.ts`
- Modify: `game/src/sim/generator.ts` (delete `Client` and `CLIENTS`; export `KINDS`), `game/src/sim/progress.ts` (`fillBoard`), `game/src/data/economy.ts` (`JOBS_PER_COMPANY = 2`), `game/src/data/programs.ts` (the `client` doc), `game/src/visual/asciiChart.ts` (`unligated`)
- Test: `tests/generator.test.ts` (`:44`, `:188`), `tests/progress.test.ts` (`:312`)

**Interfaces:**
- Produces (`data/companies.ts`; it imports nothing from `sim/` or `data/programs.ts`):
  - `type Wording = { readonly unit: string; readonly verb?: string | ((verb: string) => string) }`.
  - `type Company = { readonly id: string; readonly name: string; readonly short: string; readonly logo: readonly string[]; readonly jobs: Readonly<Record<string, readonly Wording[]>> }`.
  - `COMPANIES: readonly Company[]`, with ids `cobalt`, `innercore`, `redshift`, `flagship` and `wingtip`.
  - `companyOf(client?: string): Company | undefined`.
- Produces (`sim/generator.ts`): `export const KINDS: readonly string[]`, every kind in `KERNELS`.
- Produces (`visual/asciiChart.ts`): `unligated(text: string): string`. It puts U+200C between each pair of characters on a line.
- The logos, as the spec gives them:
  - Double-quoted strings, every `\` written `\\`, leading spaces kept, no trailing spaces.
  - COBALT: 7 lines. INNERCORE: 3. REDSHIFT: 3. FLAGSHIP: 5. WINGTIP: 3.
  - "innercore" stays lowercase.
- Kinds by company:
  - **COBALT SYSTEMS:** SUM, RUNNING TOTAL, OTHERS. UNROLLED SUM goes through `CLIENTS_OF`.
  - **INNERCORE:** CHECKSUM, COUNT, CHECKED COPY. UNROLLED CHECKSUM goes through `CLIENTS_OF`.
  - **REDSHIFT MICRO:** DOUBLE, REVERSE, REPLACE.
  - **FLAGSHIP COMPUTERS:** COPY, FILL, ADD ARRAYS.
  - **WINGTIP SEMICONDUCTOR:** CHANGES, GRID SUM, FIND.
- Wording is hardware-themed, one or two per kind. Kinds whose verb carries a number keep it:
  - COUNT, FIND, FILL and REPLACE have no `verb`, so the kernel's own verb stays.
  - GRID SUM: `(v) => v.replace('GRIDS', 'BOARDS')`.
  - Units ending in ` BYTES` still become `WORDS` on wide data.

- [ ] **Step 1: Write `tests/companies.test.ts`, and rewrite the generator and progress tests**
  - `every kind belongs to exactly one company`. Every entry in `KINDS`, through `CLIENTS_OF`, is in exactly one company's `jobs`.
  - `logos are badges of plain ASCII`:
    - 3 to 7 lines, each matching `/^[\x20-\x7e]*$/` and at most 21 characters long, with no trailing spaces.
    - COBALT's 4th line is `<= CS =>`. WINGTIP's 2nd line is `\ \___| [:::] |___/ /`.
  - `companyOf`:
    - It finds all five by name.
    - It returns undefined for CORNER BAKERY and for `undefined`.
    - Every `short` is ≤ 9 characters, and every `name` is ≤ 21.
  - `every job line fits beside the logo`: over `SEEDS` × every width, `` `${verb} ${formatCount(9.99e14)} ${unit}` `` is ≤ 70 characters.
  - `unligated keeps the text and stops ligatures`: removing U+200C gives the input back. `'<='` becomes `'<‌='`. Newlines are kept.
  - **`generator.test.ts:44` and `:188`:**
    - Every client is a `COMPANIES` name.
    - All 5 appear over `SEEDS`.
    - A kind always comes from the same company.
    - Verb and unit aren't empty.
  - **`progress.test.ts:312`:** `no company has more than two jobs on the board`. Over `fillBoard(NEW_GAME, seeded(seed))` and `fillBoard(withTier(NEW_GAME, 7), seeded(seed))`, seeds 1-200, every company's count is ≤ `JOBS_PER_COMPANY`.

- [ ] **Step 2: Run them and watch them fail**

  Run: `node --test tests/companies.test.ts tests/generator.test.ts tests/progress.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement**
  - **The generator:** a kind → `{ company, wordings }` map, built once from `COMPANIES`.
    - `const wording = r.pick(entry.wordings)`: still one draw, still the last use of `r`.
    - `client: company.name`.
    - A load-time throw if a kind has no company.
  - **`fillBoard`:** count jobs per company, and pass only the companies at `JOBS_PER_COMPANY` as the busy set.
    - If seeds still reach 3 after `newContract`'s 10 retries, raise that bound in `newContract` until the 200-seed test passes. Don't redraw the kind.
    - Rename the parameter and its docs.

- [ ] **Step 4: Run the checkpoint**

  Run the four commands, then `npm test`.
  Expected: all clean. In `showcase.test.ts:120`, `fillBoard(tier7, seeded(5))` still deals a `shows` job; if it doesn't, pick a seed that does and note why.

### Task 6: The job sheet with the company's logo, and short names in tight spots

**Files:**
- Modify: `game/src/scenes/BoardScene.ts` (`SHEET_ROWS`, `drawSheet`, the list labels, `where`), `game/src/song/panel.ts` (`:61`, the short name), `game/src/sim/workday.ts` (offers-end labels), `game/src/data/tours.ts` (`FIRST_DAY_TOUR`), `game/src/scenes/CalendarScene.ts` (if the labels need room)
- Test: `tests/tours.test.ts`, `tests/workday.test.ts`; headless screenshots (below) for the layout.

**Interfaces:**
- Consumes: `companyOf`, `Company.short`, `Company.logo`, `unligated` (Task 5); `payFor` (Task 3); `BoardTarget 'reputation'` (Task 4).

- [ ] **Step 1: Lay out the sheet.** These are starting coordinates in 960 × 540; adjust them by screenshot.
  - **The logo box** is fixed at x 412-585, y 102-186, reserved for 7 lines so nothing jumps between jobs.
    - Shorter logos are centred vertically in it.
    - It's drawn with `textAt`, `setLineSpacing(0)`, left-aligned (never centre-aligned), in the era's accent color, not bold.
    - It's scaled down only if it overflows the box (`displayHeight` / `width`, as the clock does).
    - The text goes through `unligated`.
  - **Beside the logo:** the company's full name at x ≈ 600, y 108 (`TEXT.body + 4`, bold), and the job line at y 134 (`TEXT.body`, wrap width ≈ 315, 2 lines at most).
  - **Below:**
    - Figure labels at 196, values at 214.
    - Bar 252, verdict 270, when 287.
    - Rule 306.
    - Details from 318 with `DETAIL_LINE` 14.
    - The working line at 436.
  - **The tutorial (no company)** keeps its name centred at the top as today, with no logo.
  - **`where()`:**
    - `'job'` runs from the logo's top to below the PAYS figure.
    - `'time'`, `'loop'`, `'notes'` and `'memory'` follow the new constants.
  - **The list's label** is `companyOf(spec.client)?.short ?? spec.client`. The song panel's title and the calendar's offers-end entries use the short name too.
  - **`FIRST_DAY_TOUR`:** a new step before the reputation one: "Work comes from five COMPANIES. Each has its own logo on the job sheet." Points at `'job'`. Add a `tests/tours.test.ts` assertion that it exists and points at `'job'`.

- [ ] **Step 2: Screenshots in all four eras** (`CLAUDE.md`, "Verifying a change"; scripts in `.tmp/`)
  - Use `XDG_CONFIG_HOME` / `CHROME_CONFIG_HOME` in `.tmp/`, and `--disable-breakpad`.
  - Build fixtures from `.tmp/fixture.ts`.
  - Capture:
    - The board with each of the five companies on the sheet, in `?era=1..4`. A seeded board, plus `cheat.board()` until all five have shown.
    - The tutorial's sheet.
    - The reputation line on day 3 with marks, day 10 with marks, and at FAMOUS, with the longest subtitle (a worn 64-bit tier 7 chip with the deep pipeline).
    - Every `BOARD_TOUR` and `FIRST_DAY_TOUR` step, with its spotlight on the right part.
    - The shop's MEMORY group: none, partly bought, and every size at max.
    - The developer screen's CACHES and REPUTATION rows.
    - A song at L1 max size: the cache box, and a 16-byte block outlining two memory rows.
    - The results card on time, late in the grace week, and on a level-up, in the busiest case (`?cache=l3&contract=fair&autoplay`).
  - Expected:
    - No overlap or clipping.
    - Logos intact: no ligatures, and backslashes and backticks shown.
    - Every spotlight on its part.
    - The card on screen.

- [ ] **Step 3: Run the checkpoint**

  Run the four commands.
  Expected: all clean.

### Task 7: Docs, the logs, and the hand-over

**Files:**
- Modify: `CLAUDE.md`, `ROADMAP.md`, `CHANGELOG.md`, `README.md`, `game/README.md`, and optionally `game/src/data/menuFiles.ts` (README.TXT's line on late pay: add reputation; `tests/menuFiles.test.ts` checks it fits)

- [ ] **Step 1: Update the docs**
  - **`CLAUDE.md`:**
    - The code map: `sim/memory.ts` (fully associative; each level's shape from its size steps), `sim/reputation.ts`, `data/companies.ts`, and `asciiChart.ts`'s `unligated`.
    - "One place per thing": a job's pay is worked out only by `payFor` / `settleJob`; reputation's level and multiplier only by `sim/reputation.ts`.
    - Replace "An upgrade to the L1" with "A cache's size step".
    - Update "A cache level below the L1", and "A contract or program kind" (`COMPANIES`).
    - Add a new "Reputation" entry under "Adding things": a level is a row; an event is a function in `sim/reputation.ts`; a reward is a field on a level row; the card's line comes from the run's `JobResult`.
    - The Writing rule becomes: "made up; companies may hint at real computer companies of the period, but never copy their names or logos".
  - **`ROADMAP.md`:**
    - Item 1, phase 2: done in part (two counters, levels, pay, the grace week). Left: the streak, special contracts, client gating, ads, evil contracts, a per-company score.
    - Item 2: phases 2 and 3 replaced; the WIP task updated (left: play it, plainer lessons, then the WIP marks).
    - Items 8, 9 and 10, `:65`, `:67`, `:105`, `:120` and `:122`, as the docs map lists.
  - **`CHANGELOG.md`:**
    - Decisions rows, each saying what it replaces:
      - Caches fully associative, with size steps. This replaces the one-L1-shape rows, the three L1 upgrades, 2-WAY's "same size", and the L2's "2-way".
      - Reputation: two counters, the grace week, paid at the reputation before the job. This replaces the 2026-11-01 streak / client-gating row; the streak, gating and ads are deferred.
      - Five companies, and the rule change. This amends "contracts are for made-up clients".
    - A `## 2026-11-16` session entry: what changed and why (the user's words), the number of tests, what the screenshots showed, and what wasn't checked (feel, prices, sound).
  - **`README.md`:** the `&cache` / `&sizes` URL row. Cheats live in `cheat.help()`; don't restore a table.
  - **`game/README.md`:**
    - `:37`: the caches' size steps, with the simplification note.
    - `:41`: the levels' sizes and times.
    - `:31`: a reputation sentence.
    - `:39`: "companies".
    - `:43`: the job sheet's logo.

- [ ] **Step 2: Final verification**
  - Run the four checkpoint commands. Expected: all clean.
  - `git status`. Expected: only the planned files; `game/js` matches the source; the new `game/js/sim/reputation.js(.map)` and `game/js/data/companies.js(.map)` are there.
  - Empty `.tmp/`, keeping `npm-cache`. Ask before deleting the stale `.tmp/session-notes.md` from 2026-11-02.

- [ ] **Step 3: Hand over for the commit**

  List every changed file with what changed and why, then a summary (`RULES.md` rule 2). Say what couldn't be checked: feel, prices, sound, and a real browser at full frame rate. Wait for an explicit "commit".
