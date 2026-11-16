# Simpler caches, a reputation, and five companies

Design for three changes to Bit Cycler (2026-11-16). Read `CLAUDE.md`, `RULES.md` and the Decisions table in `CHANGELOG.md` first: they are binding and describe how the code is built.

## Why

- **Caches.** Cache mapping (direct-mapped lines, 2-way sets, tags and set bits) is too much for players new to computers (user: "direct mapping I think is too much"). The cache parts have been marked WIP since 2026-11-02 for two reasons: first-use misses stop the song too often once data is wide, and TICK's lessons on them are too technical. The user wants only three cache parts, the L1, L2 and L3, each with upgrades to its size.
- **Companies.** Contracts come from about 30 one-off clients today. The user wants five companies the player gets to know, with names that hint at real computer companies of the period and ASCII logos that look like a company's insignia, the job screen redesigned to fit them if needed.
- **Reputation.** Money is hard to come by right now (user: "it's difficult to get cash in the game right now"). Reputation is the way to balance that: doing jobs well raises your pay. Later it will also unlock rewards, special jobs, cosmetics, and maybe "evil" contracts from sketchy companies. For now it only changes pay, but it must be built so those can be added.

## Goals

1. Three cache parts (L1, L2, L3), each with size upgrades in the shop. No mapping anywhere in the game: no sets, ways, tags, set bits, direct-mapped or CONFLICT misses.
2. Size upgrades that also cut the first-use misses that stop the song.
3. A reputation with two counters: GOOD (jobs done well) and BAD (jobs done poorly). Good reputation raises pay; bad reputation cuts it for a while.
4. A simple display of reputation on the board, and a line on the results card saying what a job did to it.
5. Every contract on the board from one of five companies, each with its ASCII logo on the job sheet.
6. Reputation built as one module with a small interface, its numbers in a table, so later rewards and contract kinds can read it without reworking it.

## Non-goals (this round)

- Rewards, special contracts, trophies, cosmetics, evil contracts, ads that buy reputation, clients gated by reputation. Only leave room for them.
- A full rewrite of TICK's cache lessons in plainer words. Edit only what this change makes wrong (anything about mapping, sets, tags, conflict misses, lines doubling). A plainer rewrite stays on `ROADMAP.md` item 2's WIP task.
- Taking the WIP marks off the cache parts. They stay until the user has played the new version and says so.
- Era styling of the new display (the user: era styling comes last, `ROADMAP.md` item 0). Use the existing kit as it draws today.
- Judging jobs by playing quality (accuracy, CPI) for reputation. A job done well means on time; done poorly means late. Quality could be added later as another event.

## Anti-goals (a failure even if it works)

- Reputation that makes money harder to earn than today. A new player who is sometimes late must still end up earning more than today, not less.
- A late job wiping out reputation built over many jobs.
- A second way of doing something that already has one (`CLAUDE.md`, "One way to do each thing"): old cache code left alongside the new, pay worked out in two places, reputation's rules spread across screens.
- Old saves that fail to load or lose their jobs.

## Constraints

- Everything in `CLAUDE.md` and `RULES.md`. In particular: rules and numbers in the pure layers (`sim/`, `data/`), tested in `tests/`; numbers only in `data/economy.ts`; screens only ask and draw; delete what's replaced (source, compiled `.js` and `.js.map`, tests, docs); never rename or remove a program kind in `sim/generator.ts`; no commit without the user's approval.
- Accuracy (`RULES.md`): real L1 caches are seldom fully associative (it needs a comparison for every line at once, which is costly), so the game must say it's simplified. Say so in the cache lesson's words where it fits naturally and in `game/README.md`'s accuracy notes.
- Build, both type checks and the tests must pass: `npm run build`, `npm run check`, `npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p .`, `npm test`. Look at the changed screens in headless Chrome (`CLAUDE.md`, "Verifying a change").

## Approaches considered

**Caches** (picked with the user):
- **Picked: every cache fully associative; size upgrades double the block size.** A block can go in any line, and the line used longest ago makes room. The only misses left are FIRST USE and TOO SMALL, both easy to explain. Doubling the block size doubles the cache *and* brings in more of the next data on each trip, so it cuts the first-use misses that were stopping the song.
- Rejected: size upgrades that add lines. They double the cache but don't reduce first-use misses, the WIP complaint.
- Rejected: keeping direct-mapped caches but hiding the mapping. CONFLICT misses would still happen with no way to explain them.

**Reputation** (the user picked B):
- A: one net score (good − bad), pay from the net, can go negative. Rejected: a late job cancels a good one forever, against the goal of easier money.
- **B, picked: two counters with separate jobs.** GOOD builds levels with a pay bonus and never goes down. BAD is a pay cut per mark, with a floor, and marks fade.
- C: a ratio of good jobs to all jobs. Rejected: hard to show simply, and an early late job swings it a lot.
- Also rejected before these: a streak multiplier (one bad run wipes it), and simply raising pay (nothing to build rewards on).

## The design: caches

### What the player sees

The shop's MEMORY group lists, in order: the L1, its size upgrades, the L2, its size upgrades, the L3, its size upgrades. A level's size upgrades go on sale once that level is owned, one step at a time (like the clock's steps). Each item says what the cache becomes, for example `L1 SIZE: 32 BYTES` with the about line "Each trip to RAM brings 8 bytes instead of 4, so the next numbers are already there."

Levels are still bought in order (the L2 after the L1, and so on), and keep today's other conditions (the L1 once past the memory wall, the L2 with the 32-bit chip, the L3 with the 64-bit chip).

### Sizes (starting numbers, to tune by playing)

Each level keeps its number of lines; each upgrade doubles its block size.

| Level | Lines | Blocks (base → step 1 → step 2) | Size | Step prices |
| --- | --- | --- | --- | --- |
| L1 | 4 | 4 → 8 → 16 bytes | 16 → 32 → 64 bytes | $400, $800 |
| L2 | 8 | 16 → 32 → 64 bytes | 128 → 256 → 512 bytes | $600, $1,200 |
| L3 | 4 | 64 → 128 → 256 bytes | 256 → 512 → 1,024 bytes | $900, $1,800 |

The table lives in `data/economy.ts` as data (each level's steps, their block sizes and prices), like `CLOCK.prices`. Adding a step is adding an entry.

### Timing

Unchanged rules: a bigger L1 block makes a trip to RAM 5 ns longer per extra 4 bytes (`MEMORY_TIMING.moreBytesNs`); a lower level's bigger block adds nothing (critical word first). So a 16-byte L1 block's RAM trip is 60 + 15 ns. Lookup times per level (1, 5, 12 ns) stay.

### The model (`sim/memory.ts`)

- Every cache is fully associative with least-recently-used replacement: one set holding all its lines. Remove `ways` from `CacheShape` and everything that splits an address into tag, set and offset (`setsOf`, `setOf`, `tagOf`, `addressSplit`, and their uses), unless something unrelated to mapping still needs one; then keep only that.
- A line is identified by its block (the address ÷ the block size).
- `MissKind` becomes `'first-use' | 'too-small'`. Delete `'conflict'` and everything that names it (words, tips, diagrams' labels, tests).
- `cacheShape` builds each level's shape from the steps owned. `LOWER_CACHES` keeps names, lines, base block sizes and lookup times; the lower levels' shapes also follow their owned steps.
- `cacheWords` says it without mapping: "16 BYTES: 4 LINES OF 4".

### The save (`sim/progress.ts`, `saveFile.ts`)

- Replace `cacheUpgrades: CacheUpgradeId[]` with the size steps owned per level, for example `cacheSizes: readonly number[]` (one count per level, index 0 = L1). `cacheLevels` stays.
- Old saves: each old L1 upgrade the player owned (`lines`, `ways`, `blocks`) becomes one L1 size step, up to the L1's maximum, so nobody loses what they paid for. No refunds. Test it in `tests/save.test.ts`.
- `bought` (the log the showcases read) gets the new shop keys.

### Everything that shows the cache

Reads the shape, never the old upgrade ids: the panel's cache box (`song/panel.ts`, `song/layout.ts`: each line shows which bytes its block holds, no tags or sets), the words (`song/words.ts`: the lookup line, the miss explanations, the tips; no address split), the chip (`visual/chip3d.ts` `buildChip`, `LOWER_AREAS`), the boot (`data/boot.ts`), the developer screen's cache row (`scenes/DevScene.ts`, `CACHE_STEPS`) and the cheats (`cheats.ts`).

### Lessons

- Delete the `twoway` and `morelines` lessons, their tours, their pictures (`visual/diagrams.ts`: `twoway`, `morelines`, and `sets` if it's only theirs), and the programs written only for them if nothing else uses them (`data/programs.ts`: check `ADD TWO LISTS`, `TWO PASSES`; `TWO PASSES` is used by the L2's lesson today, so keep it if still needed).
- One size lesson, reworked from `bigblocks`: played the first time the player buys any size upgrade, on any level. Its words say what a bigger block does ("each trip brings back more of the numbers next to it") with an everyday comparison, and its picture compares a program's loads before and after on the real caches (`loadsOn`). Its practice runs on the first L1 with one size step.
- The `cache`, `l2` and `l3` lessons: remove anything about direct mapping, lines chosen by address, tags or conflict misses. Say once, in the L1's lesson, that "real L1 caches are a little pickier about where a block can go; the game lets a block go anywhere" (wording to the builder, ≤ 150 characters a line).
- `TAUGHT_IDS`, BRIEFS and `seenLessons` follow the lesson list; an old save that saw a deleted lesson just carries an unused id (harmless; clean it if `cleanProgress` already filters ids).

### Showcases (`sim/showcase.ts`)

Replace the `lines`, `ways` and `blocks` entries with one entry per level's size upgrade (`l1size`, `l2size`, `l3size`, under their shop keys): in use when that level has a step, "without" being the same level one step smaller. Keep `OTHERS` and `CHECKED COPY` as program kinds (never remove a kind); point their showcase at the size entries if they show them off, or leave them as ordinary kinds. `ADD ARRAYS` is no longer a showcase kind.

## The design: reputation

### What the player sees

On the board, under the money in the corner:

```
CONTRACT BOARD                               $1,240
MON NOV 3  10:42        REP  TRUSTED ★★★☆☆  +24  −2   PAY ×1.40
```

- The level's name and stars (one star per level reached above the first, out of the levels there are).
- `+24`: the GOOD counter. `−2`: the BAD counter (shown only when above 0, or always: builder's call).
- `PAY ×1.40`: the multiplier jobs pay at now.

The results card gets one line about the job: `REPUTATION +1` on time, `BAD MARK +1` when late, and `LEVEL UP: TRUSTED` when a level is reached. The job sheet's pay shows the pay at today's multiplier.

### Rules

- **GOOD** counts jobs finished on time. +1 for each one, with a weight per grade in the table (all 1 to start; a stretch job could later count more). It never goes down.
- **BAD** counts jobs finished late: +1 for each one.
- **Bad marks fade:** each on-time job removes one, and so does each day you log off (both counts in the table). BAD never goes below 0.
- **Levels** come from GOOD alone (starting numbers):

  | Level | GOOD needed | Pay |
  | --- | --- | --- |
  | UNKNOWN | 0 | ×1.0 |
  | LOCAL | 5 | ×1.25 |
  | TRUSTED | 15 | ×1.5 |
  | RESPECTED | 30 | ×1.75 |
  | FAMOUS | 50 | ×2.0 |

- **Pay multiplier** = the level's pay × the bad-mark cut, where the cut is 5% per bad mark (1 − 0.05 × BAD). Example: TRUSTED with 2 bad marks pays 1.5 × 0.90 = ×1.35.
- **A grace period** (user: "a grace period after your first week companies are less forgiving"): during the first week (days 1-7, Monday November 1 to Sunday November 7), the multiplier never goes below ×1.0, so bad marks only eat into a bonus. From day 8 on, it can go down to ×0.75. Both floors and the week's length are in the table. The board's reputation line can say so while it lasts (for example `GRACE WEEK`; builder's wording).
- The multiplier applies when a job is paid, on top of everything else (grade, data width, late half pay), so a job taken at one level and finished at another pays at the new one. Everything that shows a job's pay before it's played shows it at today's multiplier.
- **A job is paid at the reputation as it stood before it** (Claude's call): pay first, then the job's change to reputation. A late job's new bad mark cuts the jobs after it, not itself; a job that reaches a level shows LEVEL UP on its card and pays the new rate from the next job. So the card's pay and its reputation line come from the reputation before the job: the result passed to the results card (`RunReport` / the `Recording` the replay gets) carries the amount paid and the reputation change, worked out once, never recomputed from the save afterwards.
- The tutorial job counts like any other job.

### Where it lives

- `sim/reputation.ts` owns reputation: its state type (`Reputation = { good: number; bad: number }`), the rules (what a finished job does, what ending a day does), the level, the multiplier, and its wording for the board and the card. Its interface is small and documented. Other code calls it and never works the level or the multiplier out itself.
- Its numbers are one table in `data/economy.ts` (`REPUTATION`: the levels as rows with `name`, `good` and `pay`; the grade weights; the fades; the cut per mark and its floor). A later reward is a new field on a level row, or a new event the module handles.
- The state is `Progress.reputation`, with `{ good: 0, bad: 0 }` in `NEW_GAME`, range-checked in `cleanProgress` (old saves start at 0, 0). Tests in `tests/save.test.ts`.
- Pay goes through one function. Today `payFor(contract, late)` (`sim/progress.ts`) is used by the workday and the results; it takes the reputation into account (or a new function replaces it, used everywhere a job's pay is worked out or shown).
- Wiring: `finishJob` (`sim/workday.ts`) updates reputation for the job; `endDay` fades a bad mark. `RunReport` (`song/results.ts`) says what the job did to reputation for the card's line.
- Later contracts (evil, special) will read `good` and `bad` through the module, so BAD stays its own number and is never folded into GOOD.

### One reputation for all five companies

One score, not one per company (Claude's call, offered to the user). Keep the state and the module's interface so a per-company score could be added later (say, a `byCompany` map beside the totals) without changing its callers.

### Developer screen and cheats

A row on the developer screen to set GOOD and BAD (or to step through the levels), and a cheat (`cheat.rep(good, bad)`) to jump to any point.

## The design: five companies

### The companies

Made up, each hinting at a real computer company of the period without copying its name or logo (user: "parodies of IBM, Intel, AMD... commodore", then "a bit less on the nose"). The user picked these names and logos:

| Company | Hints at | Its kinds of job |
| --- | --- | --- |
| COBALT SYSTEMS | IBM ("Big Blue", stripes) | SUM (and UNROLLED SUM), RUNNING TOTAL, OTHERS |
| INNERCORE | Intel (the ring around its name) | CHECKSUM (and UNROLLED CHECKSUM), COUNT, CHECKED COPY |
| REDSHIFT MICRO | AMD (the red rival) | DOUBLE, REVERSE, REPLACE |
| FLAGSHIP COMPUTERS | Commodore (a naval rank) | COPY, FILL, ADD ARRAYS |
| WINGTIP SEMICONDUCTOR | Motorola (the batwing) | CHANGES, GRID SUM, FIND |

The split of kinds is Claude's call, by what each company would plausibly need. Every kind belongs to exactly one company (a test checks it, with every kind in `KERNELS`).

The logos, exactly as picked (plain ASCII; they're drawn in the era's font and colors):

```
 COBALT SYSTEMS     INNERCORE                REDSHIFT MICRO
      /\               .~~~~~~~~~~~~~~.             .  *  .
     /==\            (    innercore    `      - - -=( RS )=
    /====\            `~~~~~~~~~~~~~~'              '  *  '
   <= CS =>
    \====/
     \==/
      \/

 FLAGSHIP COMPUTERS   WINGTIP SEMICONDUCTOR
      (_)              __    .-------.    __
    ---+---            \ \___| [:::] |___/ /
       |                \____|_______|____/
   \   |   /
    \__|__/
```

(Each logo's lines line up with each other; the spacing between logos in this block is only for the page. In TypeScript strings, every backslash is written `\\`.)

### Job wording

Each company words its jobs as a hardware company would (the programs underneath don't change). Examples, the rest to the builder: COBALT SYSTEMS "TOTAL 48 CHIP ORDERS", "RUNNING BALANCES FOR PAYMENTS"; INNERCORE "VERIFY 64 FIRMWARE BYTES", "COUNT FAILED CHIPS"; REDSHIFT MICRO "BRIGHTEN (x2) PIXELS", "MIRROR FRAME PIXELS"; FLAGSHIP COMPUTERS "COPY GAME DISK BYTES", "MIX PAIRS OF SOUND SAMPLES"; WINGTIP SEMICONDUCTOR "CHANGES BETWEEN SIGNAL READINGS", "FIND A RADIO CHANNEL". Units ending in BYTES still become WORDS on wide data, as today.

### Where it lives

- `data/companies.ts` (new, pure): `COMPANIES`, one entry per company: an id, its name, its logo (lines of text), and its jobs (each kind's verb and unit, as `CLIENTS` has them today). A later company is an entry; later per-company things (a reputation, evil contracts, a trophy) are fields on it. A lookup from a program's client name to its company (`companyOf`).
- `sim/generator.ts`: `CLIENTS` is replaced by `COMPANIES` (delete `CLIENTS`; `CLIENTS_OF` stays for the unrolled kinds). Keep exactly one random draw for the client, as `r.pick` does today, so every seed's other choices stay the same and old saves' jobs rebuild the same programs (their client names change to the new companies; that's expected).
- `sim/progress.ts`: `newContract` regenerates a program when its client is already on the board. With 5 companies and 6 jobs that can't always work; allow up to 2 jobs from one company on the board (the number in `data/economy.ts`), so it never spins through retries.
- The tutorial job (`BAKERY TILL`, client CORNER BAKERY) stays as it is (Claude's call): it's the player's one-off first customer, its name is stored in saves and must never change, and TICK's first lessons talk about it.

### The job screen

- The job sheet (`BoardScene.drawSheet`) gets the company's logo at its top left, with the company's name and the job's wording beside it. Everything below moves down to make room, and the details along the bottom get tighter. The logos are 3 to 7 lines tall, so the sheet's rows (`SHEET_ROWS`) are laid out again; the redesign is the builder's, within these rules: the logo, name and job at the top; the three big figures (pays, your CPU takes, due in), the deadline bar and the verdict still large in the middle; the loop, notes and memory small at the bottom.
- The list on the left keeps one row per job, labeled with the company's name and pay.
- TICK's board tour (`BOARD_TOUR`, `where(target)`) still points at the right parts after the move; check every step.
- The results card's client line and the calendar's list of expiring offers show the company's name (they already read `client`).

## Docs to update

- `CHANGELOG.md`: the Decisions rows (caches fully associative with size upgrades, replacing the three L1 upgrades and the 2-way decision of 2026-11-02; reputation as two counters, changing the 2026-11-01 plan where a streak raised pay and reputation gated clients) and a session entry.
- `ROADMAP.md`: item 1 phase 2 (reputation, done in part; what's left: streak, special contracts, client gating, ads, evil contracts as ideas), item 2's WIP task (mapping removed; first-use misses cut by size upgrades; left: play it, plainer lessons, then the WIP marks).
- `CLAUDE.md`: the code map (`sim/reputation.ts`; `sim/memory.ts` without sets), "An upgrade to the L1" (becomes size steps for any level), "A cache level below the L1", and a short "Reputation" entry under "Adding things" (how to add a level, an event, or a reward).
- `CLAUDE.md` "Writing": "Companies, products and people in the game are made up" becomes "made up; companies may hint at real computer companies of the period, but never copy their names or logos". Code map: `data/companies.ts`. "A contract or program kind": a new kind goes under one company in `COMPANIES`.
- `CHANGELOG.md` Decisions: the five companies and the rule change.
- `game/README.md`: the accuracy note on fully associative caches, and a line on reputation for players.

## Left to the builder

- Exact wording on screen and in TICK's lines (within the rules in `CLAUDE.md`), and the size lesson's picture.
- How the board corner fits the extra line in each era (it's drawn with today's kit).
- The name of the save field for size steps, and of the shop keys.
- Whether BAD shows when it's 0.
- The job sheet's new layout (within the rules above), and each company's job wording.
- How the panel's cache box shows a line's block for bigger blocks.
- Whether `setsOf` and friends survive in any form (only if needed outside mapping).

## Numbers to tune by playing

The size steps' prices, the reputation levels' thresholds and pay, the bad-mark cut and floor, how fast marks fade. All in `data/economy.ts`.
