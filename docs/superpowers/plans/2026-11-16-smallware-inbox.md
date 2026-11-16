# Smallware and the Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An INBOX tab with about 21 emails (Smallware's welcome, orientation and reputation notes; each company's thanks after 1, 5 and 15 jobs), and Smallware's door logo and name on the player's computer.

**Architecture:** Emails are data (`data/emails.ts`) with a rule for when each arrives; a pure module (`sim/mail.ts`) delivers what's due into `Progress.mail`, called wherever the game moves on (a finished job, a new day, a new game, loading a save). `InboxScene` only lists and shows them.

**Tech Stack:** TypeScript 7 (`erasableSyntaxOnly`), Phaser 3.90, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-16-smallware-inbox-design.md`

## Global Constraints

- No commits without the user's approval (`RULES.md` rule 2); stage by path, never `git add -A`.
- Checkpoint after each task: `npm run build`, `npm run check`, `npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p .`, `npm test` (277 pass at the start).
- Emails are sentence case (letters), labels in capitals; printable ASCII; made-up people and companies. Smallware's logo is the door, exactly as in the spec, with no text.
- `deliverMail` never draws random numbers and never changes the board, so seeds and boards stay as they are.
- The host name `smallware` lives only in `SMALLWARE.host` (`data/companies.ts`).

## Review Focus

1. **Old saves** get the welcome and orientation once, on load, and never twice (`mail.test.ts` "a save from before the inbox gets its welcome once").
2. **Saving and loading** keeps every email's read state, and an edited save's unknown ids, duplicates and bad days are dropped (`save.test.ts`).
3. **An email is never delivered twice**, however often `deliverMail` runs (`mail.test.ts` "delivering is idempotent").
4. **A company's count** goes up for late jobs too, and not for the tutorial's bakery (`workday.test.ts`).
5. **Every email fits the reader**: no body line over the panel's width once wrapped is too tall (`mail.test.ts` "every email fits its panel": at most 18 lines at 46 characters).

---

### Task 1: The mail model and the emails

**Files:**
- Create: `game/src/data/emails.ts`, `game/src/sim/mail.ts`, `tests/mail.test.ts`
- Modify: `game/src/data/companies.ts` (`SMALLWARE`), `game/src/sim/progress.ts` (`Progress.mail`, `Progress.companyJobs`, `NEW_GAME`, `newCampaign`), `game/src/sim/workday.ts` (`finishJob`, `endDay`), `game/src/saveFile.ts`, `game/src/save.ts` (`getProgress`)
- Test: `tests/mail.test.ts`, `tests/save.test.ts`, `tests/workday.test.ts`

**Interfaces (produces):**
- `SMALLWARE = { name: 'SMALLWARE', host: 'smallware', logo: string[], founder: string }` in `data/companies.ts`.
- `type MailRule = { kind: 'start' } | { kind: 'jobs'; company: string; count: number } | { kind: 'level'; level: string }`.
- `type Email = { id: string; from: string; subject: string; body: readonly string[]; when: MailRule }`; `EMAILS: readonly Email[]` (order = delivery order when several are due at once).
- `type Received = { readonly id: string; readonly day: number; readonly read: boolean }`.
- `Progress.mail: readonly Received[]` (oldest first), `Progress.companyJobs: Readonly<Record<string, number>>` (by company id).
- `sim/mail.ts`: `deliverMail(progress): Progress`, `readMail(progress, id): Progress`, `unreadCount(progress): number`, `emailById(id): Email | undefined`, `cleanMail(raw): Received[]`, `cleanCompanyJobs(raw): Record<string, number>`.

- [ ] **Step 1: Write `tests/mail.test.ts`** (failing):
  - `every email is well made`: unique ids; a sender and subject; `jobs` rules name a company in `COMPANIES` with counts 1, 5, 15 each; `level` rules name a `REPUTATION` level (not the first); exactly two `start` emails, the welcome first.
  - `every email fits its panel`: each body, word-wrapped at 46 characters, is at most 18 lines; subjects at most 26 characters; printable ASCII only.
  - `a new game starts with the welcome and orientation, unread`: `newCampaign().mail` ids `['welcome', 'orientation']`, day 1, unread; `unreadCount` 2.
  - `delivering is idempotent`: `deliverMail(deliverMail(p))` deep-equals `deliverMail(p)`.
  - `a company writes after 1, 5 and 15 jobs for it`: with `companyJobs: { cobalt: 5 }`, both COBALT emails for 1 and 5 arrive, not the 15th, dated `progress.day`.
  - `each reputation level brings Smallware's note`: `reputation.good` 15 gives the LOCAL and TRUSTED notes.
  - `reading marks one email read`: `readMail` sets only that one; an unknown id changes nothing.
  - `a save from before the inbox gets its welcome once`: `deliverMail({...NEW_GAME, mail: []})` has both start emails; delivering again adds nothing.
- [ ] **Step 2: Run** `node --test tests/mail.test.ts`; expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `SMALLWARE`, `data/emails.ts` (the 21 emails), `sim/mail.ts`, the `Progress` fields (`NEW_GAME`: `mail: []`, `companyJobs: {}`; `newCampaign` delivers). Run the test; expected: PASS.
- [ ] **Step 4: Wire and test the game moving on** (failing first):
  - `workday.test.ts`: `finishing a job counts it for its company and brings any mail due`: a COBALT job finished (on time or late) makes `companyJobs.cobalt` 1 and delivers COBALT's first email; the tutorial's bakery counts for no company; `endDay` delivers what's due.
  - `save.test.ts`: the round trip keeps `mail` (with read states) and `companyJobs`; an old save gets `mail: []`, `companyJobs: {}`; an edited save drops unknown ids, repeats, non-numeric days and negative or unknown-company counts.
  - Then: `finishJob` adds 1 to the contract's company (`companyOf(...)?.id`), then `deliverMail`; `endDay` calls `deliverMail` on the morning; `cleanProgress` uses `cleanMail` / `cleanCompanyJobs`; `getProgress` (`save.ts`) runs `deliverMail` after `fillBoard`.
- [ ] **Step 5: Checkpoint** (the four commands); expected: all clean.

### Task 2: The inbox screen and Smallware around the game

**Files:**
- Create: `game/src/scenes/InboxScene.ts`
- Modify: `game/src/main.ts` (scene list), `game/src/visual/terminal.ts` (`TITLES` "BIT CYCLER - INBOX", `PATHS` `~/mail`, `DOS_ITEM` CONTRACTS, the window bar's host), `game/src/scenes/BoardScene.ts` (`E` and the hint), `game/src/data/boot.ts` (the logo at the top, the shell prompt's host), `game/src/data/menuFiles.ts` (the prompt's host), `game/src/ui/eras.ts` (BIOS names: `SMALLWARE BIOS 1.0` etc.)
- Test: `tests/boot.test.ts`, `tests/menuFiles.test.ts`

- [ ] **Step 1: Failing tests**: `boot.test.ts` `every era's boot shows Smallware's door and its name` (the logo's lines appear, in order, in every era's boot; the modern prompt is `player@smallware:~$`; no `player@bit-cycler`); `menuFiles.test.ts`: the modern prompt reads `player@smallware:`.
- [ ] **Step 2: Implement**: boot prints `SMALLWARE.logo` (each line a `print` step with a short pause) first in every era, then the BIOS line; the BIOS strings in `ERAS` become `SMALLWARE BIOS n.0` (the modern era has none); every `player@bit-cycler` comes from `SMALLWARE.host`.
- [ ] **Step 3: `InboxScene`** (`super('inbox')`, `setUp()`, `header('INBOX', ...)`, `corner(money)`): Smallware's logo small at the top left; a `ListMenu` of received mail, newest first, rows `* SENDER  SUBJECT  NOV 4` (the `*` while unread); a `panel` beside it showing the chosen email (From, Subject, the day, the body word-wrapped); choosing marks it read (`updateProgress(readMail)`); hints `[UP/DOWN] CHOOSE`, `[B] CONTRACT BOARD`, `[Q] MENU`; `B` goes back to the board; pause items like the calendar's. Board: `E` opens it (`this.cue` as for C), the hint reads `[E] INBOX` or `[E] INBOX (n)`.
- [ ] **Step 4: Register** in `main.ts`, `TITLES`, `PATHS`, `DOS_ITEM`.
- [ ] **Step 5: Screenshots** (headless Chrome, `CLAUDE.md`): the inbox in all four eras (new game; a save with company mail, some read), the board's hint with unread mail, the boot in each era. Expected: nothing overlaps or runs off its panel; the door draws intact.
- [ ] **Step 6: Checkpoint**.

### Task 3: Docs and hand-over

- [ ] `CLAUDE.md`: code map (`data/emails.ts`, `sim/mail.ts`, `scenes/InboxScene.ts`, `SMALLWARE`), "An email" under Adding things (an entry in `EMAILS` with its rule; a new kind of rule is a case in `deliverMail`), host name one place.
- [ ] `CHANGELOG.md`: a Decisions row (Smallware, the door, the inbox) and a session entry; `ROADMAP.md`: the inbox done, rewards and replies later, bills and debts next; `game/README.md`: the inbox; README.TXT if it fits its pages.
- [ ] Final checkpoint, empty `.tmp/` (keep `npm-cache` and `session-notes.md`), list the changed files and a summary, and wait for the user's "commit".
